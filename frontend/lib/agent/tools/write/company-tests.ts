/**
 * Write tool: build_company_test — draft a test that follows a company exam
 * pattern (Admin → Company patterns) at Easy / Moderate / Tough. Questions
 * come from the built version (or, with a branch, a fresh bank composition);
 * propose() never calls AI and never writes. execute() saves through
 * lib/services/exams createExam — the same path create_test uses (plan
 * limits, tenant, sanitising, knowledge hooks). Created UNPUBLISHED.
 */
import { ToolInputError } from '@/lib/agent/contract'
import { bankToExamQuestion, questionBank, type BankQuestionDoc } from '@/lib/question-bank'
import { normalizeSections } from '@/lib/exam-sections'
import { metaFor } from '@/lib/question-types'
import { checkAssessmentLimit, createExam } from '@/lib/services/exams'
import { BRANCHES } from '@/lib/engineering-catalog'
import { composeSection } from '@/lib/company-tests/compose'
import { LEVEL_LABEL, PRACTICE_LEVELS, patternTotals, versionId, type CompanyExamPattern, type PracticeLevel } from '@/lib/company-tests/types'
import { writeTool } from '../define'
import { argsObject, optEnum, optInt, optString, reqString } from '../args'
import { friendlyServiceError, serviceUser, unwrap } from '../scope'
import { questionOutline, testLink } from '../loaders'
import { DRAFT_KEY, openDraft, sealDraft } from '../seal'
import { clip } from '../output'

type Doc = Record<string, any>

export interface BuildCompanyTestArgs {
  company: string
  difficulty: PracticeLevel
  exam?: string
  branch?: string
  title?: string
  pass_mark?: number
  access_type?: 'invite_only' | 'open'
  [DRAFT_KEY]?: unknown
}

interface CompanyTestDraft {
  patternId: string
  questionList: Doc[]
  sections: Doc[]
  warnings: string[]
}

function compact<T extends Record<string, unknown>>(o: T): T {
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k]
  return o
}

async function resolvePattern(a: BuildCompanyTestArgs): Promise<CompanyExamPattern> {
  const { listPatterns, getPattern } = await import('@/lib/company-tests/db')
  if (a.exam) {
    const p = await getPattern(a.exam.toLowerCase())
    if (p?.active) return p
  }
  const q = a.company.trim().toLowerCase()
  const all = await listPatterns({ activeOnly: true })
  const hits = all.filter((p) => p.id === q || p.companySlug === q || p.companyName.toLowerCase() === q || p.examName.toLowerCase() === q)
  const list = hits.length ? hits : all.filter((p) => p.companyName.toLowerCase().includes(q) || p.examName.toLowerCase().includes(q))
  if (!list.length) throw new ToolInputError(`No company exam pattern matches “${clip(a.company, 60)}”. Patterns are managed under Admin → Company patterns.`)
  if (list.length > 1 && !a.exam) {
    throw new ToolInputError(`“${clip(a.company, 60)}” has several patterns: ${list.slice(0, 6).map((p) => `${p.examName} (exam: ${p.id})`).join(', ')}. Pass \`exam\`.`)
  }
  return list[0]
}

async function buildDraft(a: BuildCompanyTestArgs): Promise<CompanyTestDraft> {
  const pattern = await resolvePattern(a)
  const { versions } = await import('@/lib/company-tests/db')
  const { loadPool } = await import('@/lib/company-tests/build')
  const warnings: string[] = []
  if (!pattern.verified) warnings.push('This pattern has not been verified against the company’s current test yet.')
  if (pattern.negativeMarking > 0) warnings.push(`The pattern uses negative marking (${pattern.negativeMarking} of a mark per wrong answer); tests don’t apply negative marking, so scores here won’t include it.`)

  // Built version first (curated, tagged); a branch filter needs a fresh composition.
  const stored = a.branch ? null : await (await versions()).findOne({ id: versionId(pattern.id, a.difficulty) }, { projection: { _id: 0 } })
  const pool = stored ? [] : await loadPool(pattern)
  const used = new Set<string>()
  const plan = pattern.sections.map((s) => {
    const ids = stored?.sections.find((v) => v.sectionId === s.id)?.questionIds
      ?? composeSection({ section: s, level: a.difficulty, pool, exclude: used, branch: a.branch }).picked
    ids.forEach((id) => used.add(id))
    return { section: s, ids }
  })
  const all = plan.flatMap((p) => p.ids)
  const docs = all.length
    ? await (await questionBank()).find({ id: { $in: all }, is_active: true, review_status: { $ne: 'draft' } } as never, { projection: { _id: 0 } }).toArray()
    : []
  const byId = new Map(docs.map((d) => [d.id, d as BankQuestionDoc]))
  const questionList: Doc[] = []
  const sections: Doc[] = []
  for (const [i, { section, ids }] of plan.entries()) {
    const qs = ids.map((id) => byId.get(id)).filter((d): d is BankQuestionDoc => !!d).map((d) => bankToExamQuestion(d) as Doc)
    if (qs.length < section.questionCount) {
      warnings.push(`Section “${section.name}”: ${qs.length} of ${section.questionCount} approved questions available.`)
    }
    if (!qs.length) continue
    questionList.push(...qs)
    sections.push({ id: `sec_${i + 1}`, title: section.name, time_limit_minutes: section.timeMinutes, lock_after_leave: true, question_ids: qs.map((q) => String(q.id)) })
  }
  if (!stored && !a.branch) warnings.push(`The ${LEVEL_LABEL[a.difficulty].toLowerCase()} version hasn’t been built yet, so questions were picked straight from the bank.`)
  if (questionList.some((q) => !metaFor(q.type).deterministic)) warnings.push('Code and written questions are graded by the test’s usual reviewer flow.')
  return { patternId: pattern.id, questionList, sections: normalizeSections(sections, questionList.map((q) => String(q.id))), warnings }
}

export const buildCompanyTestTool = writeTool<BuildCompanyTestArgs>({
  name: 'build_company_test',
  risk: 'create',
  description:
    'Draft a new test (created UNPUBLISHED) that follows a company exam pattern — e.g. TCS NQT, Infosys SP/DSE, Wipro Elite NTH, Google OA — ' +
    'at difficulty easy, moderate or tough. Sections, question counts and section timers come from the pattern; questions are approved question-bank items ' +
    '(no AI generation here). Optional `branch` limits questions to an engineering branch. The admin sees every question by section before anything is saved.',
  parameters: {
    type: 'object',
    properties: {
      company: { type: 'string', maxLength: 120, description: 'Company name or slug (e.g. "tcs", "Infosys"), or a pattern id.' },
      difficulty: { type: 'string', enum: [...PRACTICE_LEVELS] },
      exam: { type: 'string', maxLength: 63, description: 'Pattern id when a company has several (e.g. "tcs-nqt").' },
      branch: { type: 'string', enum: BRANCHES.map((b) => b.id), description: 'Optional engineering branch filter.' },
      title: { type: 'string', maxLength: 200 },
      pass_mark: { type: 'integer', minimum: 0, maximum: 100, description: 'Defaults to the pattern’s cut-off.' },
      access_type: { type: 'string', enum: ['invite_only', 'open'] },
    },
    required: ['company', 'difficulty'],
  },
  parse(raw) {
    const r = argsObject(raw, ['company', 'difficulty', 'exam', 'branch', 'title', 'pass_mark', 'access_type'])
    const branch = optString(r, 'branch', { max: 40 })
    if (branch && !BRANCHES.some((b) => b.id === branch)) throw new ToolInputError(`Unknown branch "${clip(branch, 40)}".`)
    const exam = optString(r, 'exam', { max: 63 })
    if (exam && !/^[a-z0-9][a-z0-9-]{0,62}$/i.test(exam)) throw new ToolInputError('`exam` must be a pattern id like "tcs-nqt".')
    return compact({
      company: reqString(r, 'company', { max: 120, min: 2 }),
      difficulty: optEnum(r, 'difficulty', PRACTICE_LEVELS) ?? 'moderate',
      exam,
      branch,
      title: optString(r, 'title', { max: 200, min: 3 }),
      pass_mark: optInt(r, 'pass_mark', 0, 100),
      access_type: optEnum(r, 'access_type', ['invite_only', 'open'] as const),
    })
  },
  draftInputs: (a) => ({ company: a.company, difficulty: a.difficulty, exam: a.exam, branch: a.branch }),
  async propose(a, ctx) {
    unwrap(await checkAssessmentLimit(serviceUser(ctx.caller)))
    const draft = (await openDraft<CompanyTestDraft>('build_company_test', ctx.caller, a[DRAFT_KEY])) ?? await buildDraft(a)
    if (!draft.questionList.length) {
      throw new ToolInputError('There are no approved questions for this pattern yet. Build the version under Admin → Company patterns first.')
    }
    a[DRAFT_KEY] = await sealDraft('build_company_test', ctx.caller, draft)
    const { getPattern } = await import('@/lib/company-tests/db')
    const pattern = await getPattern(draft.patternId)
    const title = a.title || `${pattern?.examName ?? 'Company test'} — ${LEVEL_LABEL[a.difficulty]}`
    const n = draft.questionList.length
    return {
      title: `Create test “${clip(title, 80)}” with ${n} question${n === 1 ? '' : 's'}`,
      preview: {
        fields: {
          Title: title,
          Pattern: pattern ? `${pattern.companyName} · ${pattern.examName}` : draft.patternId,
          Difficulty: LEVEL_LABEL[a.difficulty],
          Branch: a.branch ? BRANCHES.find((b) => b.id === a.branch)?.label ?? a.branch : '—',
          Duration: `${pattern ? patternTotals(pattern).minutes : 0} min (section timers)`,
          'Pass mark': `${a.pass_mark ?? pattern?.cutoffPercent ?? 60}%`,
          Access: (a.access_type ?? 'invite_only') === 'open' ? 'Open' : 'Invite only',
          Status: 'Unpublished draft',
        },
        totals: { questions: n, sections: draft.sections.length },
        sections: questionOutline({ questionList: draft.questionList, sections: draft.sections }, { promptChars: 140 }),
        warnings: draft.warnings,
      },
    }
  },
  async execute(a, ctx) {
    const draft = (await openDraft<CompanyTestDraft>('build_company_test', ctx.caller, a[DRAFT_KEY])) ?? (await buildDraft(a))
    if (!draft.questionList.length) return { ok: false, message: 'There are no approved questions for this pattern yet.' }
    const { getPattern } = await import('@/lib/company-tests/db')
    const pattern = await getPattern(draft.patternId)
    if (!pattern) return { ok: false, message: 'That company pattern no longer exists.' }
    const title = a.title || `${pattern.examName} — ${LEVEL_LABEL[a.difficulty]}`
    const hasCode = draft.questionList.some((q) => metaFor(q.type).group === 'coding')
    const hasObjective = draft.questionList.some((q) => metaFor(q.type).deterministic)
    const body: Record<string, unknown> = {
      title,
      subject: `${pattern.companyName} ${pattern.examName}`,
      description: `Follows the ${pattern.examName} pattern (${LEVEL_LABEL[a.difficulty].toLowerCase()}).${pattern.verified ? '' : ' Pattern not yet verified against the company’s current test.'}`,
      level: a.difficulty === 'easy' ? 'Beginner' : a.difficulty === 'tough' ? 'Advanced' : 'Intermediate',
      techStack: [...new Set(pattern.sections.flatMap((s) => s.categories))].slice(0, 10).length ? [...new Set(pattern.sections.flatMap((s) => s.categories))].slice(0, 10) : ['General'],
      duration: patternTotals(pattern).minutes,
      screening_type: hasCode && hasObjective ? 'mixed' : hasCode ? 'coding' : 'aptitude',
      questions: draft.questionList.length,
      passing_score: a.pass_mark ?? pattern.cutoffPercent,
      access_type: a.access_type ?? 'invite_only',
      starts_at: null,
      ends_at: null,
      proctoring_mode: 'standard',
      allow_retake: false,
      published: false,
      // Superadmin acting for an organisation: the session's tenant, never the model's.
      ...(ctx.caller.role === 'superadmin' && ctx.caller.tenantId ? { tenant_id: ctx.caller.tenantId } : {}),
    }
    const r = await createExam(serviceUser(ctx.caller), body, { questionList: draft.questionList, sections: draft.sections as never })
    if (!r.ok) return { ok: false, message: friendlyServiceError(r) }
    const id = String(r.data.id)
    return {
      ok: true,
      message: `Created “${title}” (unpublished) with ${draft.questionList.length} questions in ${draft.sections.length} timed sections.`,
      link: testLink(id),
      data: { test_id: id, questions: draft.questionList.length, pattern: pattern.id },
    }
  },
})
