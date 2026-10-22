/**
 * The frozen question paper of a live drive (server only). Built once from
 * the company test version (pattern + level) when the drive is scheduled, so
 * a weekly question refresh never changes a drive. Candidates get the public
 * view (no answers), cached per process so 1,000 candidates starting at once
 * cost one DB read per instance. Scoring reuses the company test scorer.
 */
import 'server-only'
import { questionBank, type BankQuestionDoc } from '@/lib/question-bank'
import { getPattern, versions } from '@/lib/company-tests/db'
import { reconcileVersion } from '@/lib/company-tests/build'
import { scoreAttempt } from '@/lib/company-tests/compose'
import { codeRatios, publicQuestion, snapshot } from '@/lib/company-tests/practice'
import { versionId, type PracticeLevel } from '@/lib/company-tests/types'
import { papersCol, type PaperDoc, type PaperSection } from './store'
import { passMark, seededOrder, type LiveCandidateDoc, type LiveDriveDoc } from './types'

export class PaperError extends Error {
  constructor(message: string, public status = 409, public code = 'ld_paper_unavailable') { super(message) }
}

export async function buildPaper(driveId: string, patternId: string, level: PracticeLevel): Promise<PaperDoc> {
  const pattern = await getPattern(patternId)
  if (!pattern || !pattern.active) throw new PaperError('That company test is not available.', 409, 'ld_test_unavailable')
  const stored = await (await versions()).findOne({ id: versionId(patternId, level) }, { projection: { _id: 0 } })
  if (!stored) throw new PaperError('That level of the test is not built yet. Pick another level.', 409, 'ld_level_not_ready')
  const version = await reconcileVersion(stored, pattern)
  const ids = version.sections.flatMap((s) => s.questionIds)
  const docs = ids.length
    ? await (await questionBank()).find({ id: { $in: ids }, is_active: true, review_status: { $ne: 'draft' } } as never, { projection: { _id: 0 } }).toArray()
    : []
  const byId = new Map(docs.map((d) => [d.id, d as BankQuestionDoc]))
  const sections: PaperSection[] = []
  for (const vs of version.sections) {
    const def = pattern.sections.find((s) => s.id === vs.sectionId)
    if (!def) continue
    const questions = vs.questionIds.map((qid) => byId.get(qid)).filter((d): d is BankQuestionDoc => !!d).map(snapshot)
    if (questions.length) sections.push({ id: def.id, name: def.name, cutoffPercent: def.cutoffPercent ?? pattern.cutoffPercent, questions })
  }
  if (!sections.length) throw new PaperError('That test has no approved questions yet.', 409, 'ld_no_questions')
  const paper: PaperDoc = {
    drive_id: driveId, sections, negative_marking: pattern.negativeMarking, cutoff_percent: pattern.cutoffPercent,
    version_revision: version.revision, built_at: new Date().toISOString(),
  }
  await (await papersCol()).replaceOne({ drive_id: driveId }, paper, { upsert: true })
  publicCache.delete(driveId)
  fullCache.delete(driveId)
  return paper
}

// ponytail: per-process caches keyed by built_at; a rebuild bumps built_at and
// the next read refreshes. Ceiling: one stale read per instance after a rebuild.
const fullCache = new Map<string, { at: number; paper: PaperDoc }>()
const publicCache = new Map<string, { at: number; built_at: string; sections: PublicSection[] }>()
const TTL = 10 * 60_000

export async function loadPaper(driveId: string, builtAt: string | null): Promise<PaperDoc | null> {
  const hit = fullCache.get(driveId)
  if (hit && hit.paper.built_at === builtAt && Date.now() - hit.at < TTL) return hit.paper
  const paper = await (await papersCol()).findOne({ drive_id: driveId }, { projection: { _id: 0 } })
  if (paper) fullCache.set(driveId, { at: Date.now(), paper })
  return paper
}

export type PublicQuestion = ReturnType<typeof publicQuestion>
export interface PublicSection { id: string; name: string; questions: PublicQuestion[] }

/** The paper as a candidate sees it, questions in a per-candidate order. */
export async function publicPaper(drive: Pick<LiveDriveDoc, 'id' | 'paper_built_at'>, userId: string): Promise<PublicSection[]> {
  let base = publicCache.get(drive.id)
  if (!base || base.built_at !== drive.paper_built_at || Date.now() - base.at > TTL) {
    const paper = await loadPaper(drive.id, drive.paper_built_at)
    if (!paper) throw new PaperError('The question paper is not ready yet.')
    base = { at: Date.now(), built_at: paper.built_at, sections: paper.sections.map((s) => ({ id: s.id, name: s.name, questions: s.questions.map(publicQuestion) })) }
    publicCache.set(drive.id, base)
  }
  return base.sections.map((s) => ({ ...s, questions: seededOrder(s.questions, `${drive.id}:${userId}:${s.id}`) }))
}

export function paperQuestionIds(paper: Pick<PaperDoc, 'sections'>): Set<string> {
  return new Set(paper.sections.flatMap((s) => s.questions.map((q) => q.id)))
}

/** Score one candidate's answers (runs code questions through the runner). */
export async function scoreCandidate(paper: PaperDoc, rules: LiveDriveDoc['rules'], c: Pick<LiveCandidateDoc, 'answers'>): Promise<NonNullable<LiveCandidateDoc['result']>> {
  const inputs = []
  for (const s of paper.sections) {
    const answers: Record<string, string> = {}
    for (const q of s.questions) if (c.answers?.[q.id]) answers[q.id] = c.answers[q.id]
    inputs.push({
      id: s.id, name: s.name, cutoffPercent: s.cutoffPercent, late: false, answers,
      questions: s.questions.map((q) => ({ id: q.id, type: q.type, marks: q.marks, options: q.options, answer: q.answer, tolerance: q.tolerance, pairs: q.pairs, matrix: q.matrix, table: q.table })),
      codeRatios: await codeRatios({ late: false, questions: s.questions, answers }),
    })
  }
  const mark = passMark(rules, paper.cutoff_percent)
  const r = scoreAttempt(inputs, paper.negative_marking, mark)
  return {
    percent: r.percent, score: r.score, max: r.max, passed: rules.pass_percent == null ? r.passed : r.percent >= mark,
    sections: r.sections.map((s) => ({ id: s.id, name: s.name, percent: s.percent, passed: s.passed })),
  }
}
