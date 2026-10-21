/**
 * Batch job (server only): code similarity clusters + AI-written signals for
 * one test or contest, stored in integrity_reports. Runs after the test /
 * contest ends (scheduler sweep, every 5 minutes) or on "Run now".
 *
 * Locking: the report row is claimed with a lease (status running +
 * lease_until), so two replicas or a double click never run it twice; a
 * replica that dies mid-run loses the lease after 10 minutes. Re-running is
 * idempotent: the report is replaced, reviewers' marks on clusters with the
 * same members are kept.
 *
 * The optional classifier is spend-capped platform-wide (calls per UTC day +
 * monthly USD) and per test (classifier_max_calls), only sees the most
 * suspicious answers, gets the code fenced as untrusted data, and is skipped
 * for code that trips the prompt-injection scanner.
 */
import 'server-only'
import { createHash } from 'node:crypto'
import { getMongoDb } from '@/lib/mongodb'
import { logger } from '@/lib/logger'
import { parseCodingAnswer } from '@/lib/coding-answer'
import { isCodingType } from '@/lib/question-types'
import { ok, fail, type ServiceResult } from '@/lib/services/result'
import { pairwiseSimilarity, clusterPairs, type CodeSubmission } from './code-similarity'
import { aiSignals, combineSignals } from './ai-signals'
import { mergeCadence, type CadenceSummary } from './cadence'
import { getGlobal, getSettings, integrityUserNames, loadTarget, purgeExpiredSnapshots, type Target } from './service'
import {
  aiUsageCol, eventsCol, reportId, reportsCol, settingsCol, stripId,
  type ClusterReview, type ReportAiRow, type ReportCluster, type ReportDoc, type ReportQuestion,
} from './store'
import type { IntegritySettings } from './types'

type Doc = Record<string, any>
const LEASE_MS = 10 * 60_000
const MAX_SUBS_PER_QUESTION = 400
const nowIso = () => new Date().toISOString()

interface Answer {
  submission_id: string
  owner: string
  user_id: string
  question_id: string
  code: string
  language: string
  time_ms: number | null
  solved: boolean
  created_at: number
}

interface QuestionMeta { id: string; title: string; difficulty: string | null; starter: string[]; language: string }

const starterOf = (v: unknown): string[] => {
  if (typeof v === 'string' && v.trim()) return [v]
  if (v && typeof v === 'object') return Object.values(v as Record<string, unknown>).filter((x): x is string => typeof x === 'string' && !!x.trim())
  return []
}

/** Coding answers of a test: the latest submission per candidate. */
async function examAnswers(t: Target): Promise<{ questions: QuestionMeta[]; answers: Answer[] }> {
  const exam = t.doc
  const list = (Array.isArray(exam.questionList) ? exam.questionList : Array.isArray(exam.questions) ? exam.questions : []) as Doc[]
  const questions: QuestionMeta[] = list.filter((q) => q && isCodingType(q.type)).map((q) => ({
    id: String(q.id), title: String(q.title || q.prompt || 'Question').slice(0, 140), difficulty: q.difficulty ? String(q.difficulty) : null,
    starter: [...starterOf(q.starter_code), ...starterOf(q.starterCode)], language: String(q.language || ''),
  }))
  if (!questions.length) return { questions, answers: [] }
  const db = await getMongoDb()
  const subs = (await db.collection('exam_submissions').find({ exam_id: t.id }, { projection: { _id: 0, id: 1, user_id: 1, answers: 1, details: 1, question_timings: 1, created_at: 1 } })
    .sort({ created_at: -1 }).limit(5000).toArray()) as Doc[]
  const latest = new Map<string, Doc>()
  for (const s of subs) if (s.user_id && !latest.has(String(s.user_id))) latest.set(String(s.user_id), s)
  const answers: Answer[] = []
  for (const s of latest.values()) {
    const details = Array.isArray(s.details) ? (s.details as Doc[]) : []
    for (const q of questions) {
      const parsed = parseCodingAnswer(typeof s.answers?.[q.id] === 'string' ? s.answers[q.id] : '')
      if (!parsed.code.trim()) continue
      const d = details.find((x) => x && String(x.qId) === q.id)
      const timing = Number(s.question_timings?.[q.id])
      answers.push({
        submission_id: String(s.id), owner: String(s.user_id), user_id: String(s.user_id), question_id: q.id,
        code: parsed.code.slice(0, 64_000), language: parsed.language || q.language,
        time_ms: Number.isFinite(timing) && timing > 0 ? timing : null,
        solved: !!d && (d.correct === true || Number(d.awarded) > 0),
        created_at: Date.parse(String(s.created_at || '')) || 0,
      })
    }
  }
  return { questions, answers }
}

/** Code submissions of a contest: the latest per entry and task. */
async function contestAnswers(t: Target): Promise<{ questions: QuestionMeta[]; answers: Answer[] }> {
  const c = t.doc as Doc
  const tasks = (Array.isArray(c.config?.tasks) ? c.config.tasks : []) as Doc[]
  const { submissionsCol } = await import('@/lib/contests/store')
  const subs = (await (await submissionsCol()).find({ contest_id: t.id, 'payload.code': { $type: 'string' } }, { projection: { _id: 0, id: 1, entry_id: 1, user_id: 1, task_id: 1, payload: 1, detail: 1, score: 1, created_at: 1 } })
    .sort({ created_at: -1 }).limit(10_000).toArray()) as Doc[]
  const seen = new Set<string>()
  const answers: Answer[] = []
  for (const s of subs) {
    const key = `${s.entry_id}:${s.task_id}`
    if (seen.has(key)) continue
    seen.add(key)
    const total = Number(s.detail?.total) || 0
    answers.push({
      submission_id: String(s.id), owner: String(s.entry_id), user_id: String(s.user_id), question_id: String(s.task_id),
      code: String(s.payload?.code || '').slice(0, 64_000), language: String(s.payload?.language || ''),
      time_ms: null, solved: total > 0 && Number(s.detail?.passed) === total,
      created_at: Date.parse(String(s.created_at || '')) || 0,
    })
  }
  const ids = new Set(answers.map((a) => a.question_id))
  const questions: QuestionMeta[] = [...ids].map((id) => {
    const task = tasks.find((x) => String(x.id) === id) ?? {}
    return {
      id, title: String(task.title || (id === '_' ? 'Task' : id)).slice(0, 140), difficulty: task.difficulty ? String(task.difficulty) : null,
      starter: [...starterOf(task.buggy_code), ...starterOf(task.starter_code)], language: String(task.language || ''),
    }
  })
  return { questions, answers }
}

const clusterId = (qid: string, members: string[]) => `cl_${createHash('sha256').update(`${qid}:${[...members].sort().join(',')}`).digest('hex').slice(0, 16)}`

// ─── Classifier (optional, capped) ───────────────────────────────────────────

async function reserveClassifierCall(): Promise<boolean> {
  const g = await getGlobal()
  if (g.classifier_daily_cap <= 0 || g.monthly_cost_cap_usd <= 0) return false
  const now = new Date()
  const day = now.toISOString().slice(0, 10)
  const month = day.slice(0, 7)
  const col = await aiUsageCol()
  const spent = await col.aggregate<{ total: number }>([{ $match: { month } }, { $group: { _id: null, total: { $sum: '$cost_usd' } } }]).toArray()
  if ((spent[0]?.total ?? 0) + g.cost_per_call_usd > g.monthly_cost_cap_usd) return false
  try {
    const r = await col.findOneAndUpdate(
      { day, calls: { $lt: g.classifier_daily_cap } },
      { $inc: { calls: 1, cost_usd: g.cost_per_call_usd }, $setOnInsert: { day, month } },
      { upsert: true, returnDocument: 'after' },
    )
    return !!r
  } catch {
    return false // duplicate key = today's row exists and is at the cap
  }
}

async function classify(code: string, language: string): Promise<{ p: number | null; note?: string }> {
  const [{ scanPrompt }, { fenceUntrusted, untrustedRule, parseConfidence }, { backendComplete }] = await Promise.all([
    import('@/lib/ai/prompt-guard'), import('@/lib/ai/untrusted-input'), import('@/lib/ai/backend'),
  ])
  if (scanPrompt(code).flagged) return { p: null, note: 'injection_like_text' }
  if (!(await reserveClassifierCall())) return { p: null, note: 'cap' }
  try {
    const res = await backendComplete({
      systemMessage: `You estimate how likely a code answer from a programming test was written by an AI assistant rather than typed by the candidate. Be conservative: competent human code is common. ${untrustedRule(['candidate_code'])} Reply with JSON only: {"probability": number between 0 and 1}.`,
      userMessage: `Language: ${language.replace(/[^A-Za-z0-9+#.-]/g, '').slice(0, 20) || 'unknown'}\n${fenceUntrusted('candidate_code', code, 4000)}`,
      modelRole: 'fast', responseFormat: 'json', feature: 'integrity_ai_classifier',
    })
    if (!res.ok) return { p: null }
    let j: unknown = res.json
    if (!j && res.text) { const m = res.text.match(/\{[\s\S]*\}/); if (m) { try { j = JSON.parse(m[0]) } catch { j = null } } }
    const prob = j && typeof j === 'object' ? (j as Record<string, unknown>).probability : undefined
    return { p: prob === undefined ? null : parseConfidence(prob, 0) }
  } catch {
    return { p: null }
  }
}

// ─── Report ──────────────────────────────────────────────────────────────────

async function buildReport(t: Target, settings: IntegritySettings, previous: ReportDoc | null): Promise<Pick<ReportDoc, 'questions' | 'ai' | 'classifier_calls' | 'notes'>> {
  const { questions, answers } = t.kind === 'exam' ? await examAnswers(t) : await contestAnswers(t)
  const notes: string[] = []
  const userIds = [...new Set(answers.map((a) => a.user_id))]
  const names = await integrityUserNames(userIds)
  let entryNames = new Map<string, string>()
  if (t.kind === 'contest' && answers.length) {
    const { entriesCol } = await import('@/lib/contests/store')
    const entries = await (await entriesCol()).find({ contest_id: t.id, id: { $in: [...new Set(answers.map((a) => a.owner))] } }, { projection: { _id: 0, id: 1, name: 1 } }).toArray()
    entryNames = new Map(entries.map((e) => [e.id, e.name]))
  }
  const nameOf = (a: Answer) => (t.kind === 'contest' ? entryNames.get(a.owner) : null) || names.get(a.user_id)?.name || 'Candidate'
  const prevReviews = new Map<string, ClusterReview>()
  for (const q of previous?.questions ?? []) for (const c of q.clusters) prevReviews.set(c.id, c.review)

  // 1. Similarity clusters per question.
  const out: ReportQuestion[] = []
  if (settings.similarity.enabled) {
    for (const q of questions) {
      const qa = answers.filter((a) => a.question_id === q.id)
      if (qa.length > MAX_SUBS_PER_QUESTION) notes.push(`${q.title}: compared the ${MAX_SUBS_PER_QUESTION} longest of ${qa.length} answers.`)
      const subs: CodeSubmission[] = qa.map((a) => ({ id: a.submission_id, owner: a.owner, code: a.code, language: a.language }))
      const pairs = pairwiseSimilarity(subs, { threshold: settings.similarity.threshold, minTokens: settings.similarity.min_tokens, starterCode: q.starter, maxSubmissions: MAX_SUBS_PER_QUESTION })
      const bySub = new Map(qa.map((a) => [a.submission_id, a]))
      const clusters: ReportCluster[] = clusterPairs(pairs).slice(0, 50).map((c) => {
        const id = clusterId(q.id, c.members)
        return {
          id,
          members: c.members.map((m) => { const a = bySub.get(m); return { submission_id: m, user_id: a?.user_id || '', name: a ? nameOf(a) : 'Candidate' } }),
          max_score: c.max_score,
          pairs: c.pairs.slice(0, 30),
          review: prevReviews.get(id) ?? { status: 'unreviewed', note: '', by: null, at: null },
        }
      })
      out.push({ question_id: q.id, title: q.title, language: q.language, submissions: qa.length, clusters })
    }
  }

  // 2. AI-written signals per answer.
  const ai: ReportAiRow[] = []
  let classifierCalls = 0
  if (settings.ai_signals.enabled && answers.length) {
    const ev = (await (await eventsCol()).find(
      { target_kind: t.kind, target_id: t.id, type: { $in: ['paste', 'typing_summary'] } },
      { projection: { _id: 0, user_id: 1, type: 1, q: 1, data: 1 } },
    ).limit(100_000).toArray())
    const paste = new Map<string, { chars: number; n: number }>()
    const typing = new Map<string, Partial<CadenceSummary>[]>()
    for (const e of ev) {
      const k = `${e.user_id}:${e.q || '_'}`
      if (e.type === 'paste') { const p = paste.get(k) ?? { chars: 0, n: 0 }; p.chars += Number(e.data?.length) || 0; p.n++; paste.set(k, p) }
      else { const l = typing.get(k) ?? []; l.push(e.data as Partial<CadenceSummary>); typing.set(k, l) }
    }
    const qMeta = new Map(questions.map((q) => [q.id, q]))
    for (const a of answers) {
      const k = `${a.user_id}:${a.question_id}`
      const p = paste.get(k)
      const tl = typing.get(k)
      const cad = tl ? mergeCadence(tl) : null
      // Contests: time from first keystroke on the task to the submission.
      const timeMs = a.time_ms ?? (cad?.first_at && a.created_at > cad.first_at ? a.created_at - cad.first_at : null)
      const r = aiSignals({
        code_length: a.code.length, pasted_chars: p?.chars ?? 0, paste_events: p?.n ?? 0,
        typed_chars: cad ? cad.chars : null, mean_gap_ms: cad?.mean_ms, sd_gap_ms: cad?.sd_ms, fast_bursts: cad?.fast_bursts,
        time_ms: timeMs, difficulty: qMeta.get(a.question_id)?.difficulty, solved: a.solved,
      })
      ai.push({ user_id: a.user_id, name: nameOf(a), question_id: a.question_id, submission_id: a.submission_id, signals: r.signals, combined: r.combined, level: r.level, classifier: null })
    }
    if (settings.ai_signals.classifier && settings.ai_signals.classifier_max_calls > 0) {
      const pick = ai.filter((r) => r.level === 'medium' || r.level === 'high').sort((x, y) => y.combined - x.combined).slice(0, settings.ai_signals.classifier_max_calls)
      for (const row of pick) {
        const a = answers.find((x) => x.submission_id === row.submission_id && x.question_id === row.question_id)
        if (!a) continue
        const res = await classify(a.code, a.language)
        if (res.note === 'cap') { notes.push('The AI classifier stopped at the platform spend cap.'); break }
        if (res.note === 'injection_like_text') { notes.push(`${row.name}: the answer contains text aimed at AI graders; the classifier was skipped.`); continue }
        classifierCalls++
        if (res.p === null) continue
        row.classifier = res.p
        const only = aiSignals({ code_length: 0, pasted_chars: 0, paste_events: 0, typed_chars: null, time_ms: null, solved: false, classifier: res.p })
        const merged = combineSignals([...row.signals.filter((s) => s.id !== 'classifier'), ...only.signals])
        row.signals = merged.signals
        row.combined = merged.combined
        row.level = merged.level
      }
    }
    ai.sort((x, y) => y.combined - x.combined)
  }
  return { questions: out, ai: ai.filter((r) => r.level !== 'none').slice(0, 500), classifier_calls: classifierCalls, notes }
}

export async function getReport(t: Target): Promise<ReportDoc | null> {
  return stripId(await (await reportsCol()).findOne({ id: reportId(t.kind, t.id) }, { projection: { _id: 0, lease_until: 0 } }))
}

/** Claim the lease and (re)build the report. */
export async function runReport(t: Target, trigger: 'cron' | 'manual'): Promise<ServiceResult<ReportDoc>> {
  const col = await reportsCol()
  const id = reportId(t.kind, t.id)
  const now = new Date()
  await col.updateOne({ id }, {
    $setOnInsert: { id, target_kind: t.kind, target_id: t.id, tenant_id: t.tenant_id, status: 'idle', lease_until: null, started_at: null, finished_at: null, error: null, trigger: null, questions: [], ai: [], classifier_calls: 0, notes: [] },
  }, { upsert: true })
  const claimed = await col.findOneAndUpdate(
    { id, $or: [{ status: { $ne: 'running' } }, { lease_until: { $lt: now } }] },
    { $set: { status: 'running', lease_until: new Date(now.getTime() + LEASE_MS), started_at: now.toISOString(), trigger, error: null } },
    { returnDocument: 'before', projection: { _id: 0 } },
  )
  if (!claimed) return fail(409, 'The check is already running. Refresh in a minute.')
  try {
    const settings = await getSettings(t.kind, t.id)
    const built = await buildReport(t, settings, claimed as ReportDoc)
    await col.updateOne({ id }, { $set: { ...built, status: 'done', lease_until: null, finished_at: nowIso(), error: null } })
    if (trigger === 'cron') await (await settingsCol()).updateOne({ target_kind: t.kind, target_id: t.id }, { $set: { auto_report_done: true } })
  } catch (e) {
    logger.error('[integrity] report failed', (e as Error).message)
    await col.updateOne({ id }, { $set: { status: 'failed', lease_until: null, finished_at: nowIso(), error: 'The check failed. Try again.' } })
    return fail(500, 'The check failed. Try again.')
  }
  const r = await getReport(t)
  return r ? ok(r) : fail(500, 'Report missing')
}

export async function setClusterReview(user: { id: string }, t: Target, clusterIdArg: string, status: ClusterReview['status'], note: string): Promise<ServiceResult<ClusterReview>> {
  if (!/^cl_[0-9a-f]{16}$/.test(clusterIdArg)) return fail(400, 'Invalid cluster')
  const review: ClusterReview = { status, note: note.trim().slice(0, 2000), by: user.id, at: nowIso() }
  const col = await reportsCol()
  const r = await col.updateOne(
    { id: reportId(t.kind, t.id) },
    { $set: { 'questions.$[q].clusters.$[c].review': review } },
    { arrayFilters: [{ 'q.clusters.id': clusterIdArg }, { 'c.id': clusterIdArg }] },
  )
  if (!r.matchedCount || !r.modifiedCount) return fail(404, 'Cluster not found')
  return ok(review)
}

/** Code of two submissions in a cluster, for the side-by-side view (staff only; caller checked). */
export async function clusterCode(t: Target, questionId: string, submissionIds: string[]): Promise<ServiceResult<Array<{ submission_id: string; code: string; language: string }>>> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(questionId) || submissionIds.length !== 2 || submissionIds.some((s) => !/^[A-Za-z0-9_-]{1,128}$/.test(s))) return fail(400, 'Pick two submissions')
  const report = await getReport(t)
  const q = report?.questions.find((x) => x.question_id === questionId)
  const inReport = new Set(q?.clusters.flatMap((c) => c.members.map((m) => m.submission_id)) ?? [])
  if (!submissionIds.every((s) => inReport.has(s))) return fail(404, 'Submission not in this report')
  if (t.kind === 'exam') {
    const db = await getMongoDb()
    const subs = await db.collection('exam_submissions').find({ exam_id: t.id, id: { $in: submissionIds } }, { projection: { _id: 0, id: 1, answers: 1 } }).toArray()
    return ok(submissionIds.map((sid) => {
      const s = subs.find((x) => x.id === sid)
      const p = parseCodingAnswer(typeof s?.answers?.[questionId] === 'string' ? s.answers[questionId] : '')
      return { submission_id: sid, code: p.code, language: p.language }
    }))
  }
  const { submissionsCol } = await import('@/lib/contests/store')
  const subs = await (await submissionsCol()).find({ contest_id: t.id, id: { $in: submissionIds } }, { projection: { _id: 0, id: 1, payload: 1 } }).toArray()
  return ok(submissionIds.map((sid) => {
    const s = subs.find((x) => x.id === sid)
    return { submission_id: sid, code: String(s?.payload?.code || ''), language: String(s?.payload?.language || '') }
  }))
}

// ─── Scheduler sweep ─────────────────────────────────────────────────────────

/** Has the test / contest ended (+10 min for late submits)? */
export function targetEnded(kind: 'exam' | 'contest', doc: Doc, now: number): boolean {
  const end = kind === 'exam' ? Date.parse(String(doc.ends_at || '')) : Date.parse(String(doc.schedule?.ends_at || ''))
  return Number.isFinite(end) && end + 10 * 60_000 < now
}

/**
 * Every 5 minutes (lib/scheduler.ts, 'integrity'): purge expired snapshots,
 * then build reports for up to 2 ended tests / contests not yet processed.
 */
export async function runIntegritySweep(now: Date = new Date()): Promise<{ purged: number; reports: number }> {
  const purged = await purgeExpiredSnapshots(now).catch((e) => { logger.error('[integrity] purge failed', (e as Error).message); return 0 })
  const pending = await (await settingsCol()).find(
    { auto_report_done: { $ne: true }, $or: [{ 'similarity.enabled': true }, { 'ai_signals.enabled': true }] } as Record<string, unknown>,
    { projection: { _id: 0, target_kind: 1, target_id: 1 } },
  ).sort({ updated_at: 1 }).limit(100).toArray()
  let reports = 0
  for (const s of pending) {
    if (reports >= 2) break
    const t = await loadTarget(s.target_kind, s.target_id)
    if (!t || !targetEnded(t.kind, t.doc, now.getTime())) continue
    const r = await runReport(t, 'cron')
    if (r.ok) reports++
  }
  return { purged, reports }
}
