/**
 * Read a learner's results into weak-area signals (lib/study-plan/weak-areas.ts):
 * test answers (joined with the test's questions or the bank rows of an adaptive run),
 * company practice attempts (per question, else section scores), study practice sets and
 * completed AI mock interviews. Last 180 days, bounded reads. Grading of pending
 * (manually reviewed) answers is skipped.
 */
import 'server-only'
import { getMongoDb } from '@/lib/mongodb'
import { categoryArea, type AnswerSignal, type Signals } from './weak-areas'
import { practiceCol } from './db'
import type { Difficulty } from './types'

type Doc = Record<string, any>
const LOOKBACK_DAYS = 180
const diff = (v: unknown): Difficulty | null => (v === 'Easy' || v === 'Medium' || v === 'Hard' ? v : typeof v === 'string' ? ({ easy: 'Easy', medium: 'Medium', hard: 'Hard', moderate: 'Medium', tough: 'Hard' } as Record<string, Difficulty>)[v.toLowerCase()] ?? null : null)

/** Bank / exam question → area. Domain: bot tag → branch → the exam's adaptive domain → its subject. */
export function questionArea(q: Doc | null | undefined, fallbackDomain?: string | null): { domain: string; topic: string | null } {
  const subject = typeof q?.subject === 'string' && q.subject.trim() ? q.subject.trim().slice(0, 80) : null
  const domain = (typeof q?.domain === 'string' && q.domain) || (typeof q?.branch === 'string' && q.branch) || fallbackDomain || (subject ? subject.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40) : 'general')
  return { domain: String(domain).toLowerCase(), topic: subject }
}

export async function gatherSignals(userId: string, now = new Date()): Promise<Signals> {
  const db = await getMongoDb()
  const since = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000).toISOString()
  const answers: AnswerSignal[] = []
  const out: Signals = { answers, sections: [], adaptive: [], interviews: [] }

  // 1. Tests (exam_submissions): per-question details joined with the test's questions.
  const subs = await db.collection('exam_submissions').find({ user_id: userId, created_at: { $gte: since } }, { projection: { _id: 0, exam_id: 1, details: 1, adaptive: 1, created_at: 1 } }).sort({ created_at: -1 }).limit(40).toArray() as Doc[]
  if (subs.length) {
    const exams = await db.collection('exams').find({ id: { $in: [...new Set(subs.map((s) => s.exam_id))] } }, { projection: { _id: 0, id: 1, adaptive_domain: 1, 'questions.id': 1, 'questions.subject': 1, 'questions.difficulty': 1, 'questions.domain': 1, 'questions.branch': 1, 'questionList.id': 1, 'questionList.subject': 1, 'questionList.difficulty': 1, 'questionList.domain': 1, 'questionList.branch': 1 } }).toArray() as Doc[]
    const em = new Map(exams.map((e) => [e.id, e]))
    const bankIds = subs.flatMap((s) => (Array.isArray(s.details) ? s.details : []).map((d: Doc) => d.bank_id).filter((x: unknown) => typeof x === 'string'))
    const bank = bankIds.length ? await db.collection('question_bank').find({ id: { $in: [...new Set(bankIds)].slice(0, 2000) } }, { projection: { _id: 0, id: 1, subject: 1, domain: 1, branch: 1, difficulty: 1 } }).toArray() as Doc[] : []
    const bm = new Map(bank.map((b) => [b.id, b]))
    for (const s of subs) {
      const exam = em.get(s.exam_id)
      const qs: Doc[] = Array.isArray(exam?.questionList) ? exam!.questionList : Array.isArray(exam?.questions) ? exam!.questions : []
      const qm = new Map(qs.map((q) => [String(q.id), q]))
      const fallback = typeof exam?.adaptive_domain === 'string' ? exam.adaptive_domain : null
      for (const d of (Array.isArray(s.details) ? s.details : []).slice(0, 200) as Doc[]) {
        if (d.pending_review) continue
        const q = (typeof d.bank_id === 'string' && bm.get(d.bank_id)) || qm.get(String(d.qId))
        const { domain, topic } = questionArea(q, fallback)
        answers.push({ domain, topic, difficulty: diff(d.difficulty) ?? diff(q?.difficulty), correct: d.correct === true, at: s.created_at, source: 'test' })
      }
      if (s.adaptive && fallback && diff(s.adaptive.peak)) out.adaptive.push({ domain: fallback, peak: diff(s.adaptive.peak)!, at: s.created_at })
    }
  }

  // 2. Company practice attempts.
  const attempts = await db.collection('company_test_attempts').find({ userId, status: 'completed', createdAt: { $gte: since } }, { projection: { _id: 0, patternId: 1, sections: 1, result: 1, completedAt: 1, createdAt: 1 } }).sort({ createdAt: -1 }).limit(20).toArray() as Doc[]
  if (attempts.length) {
    const pats = await db.collection('company_exam_patterns').find({ id: { $in: [...new Set(attempts.map((a) => a.patternId))] } }, { projection: { _id: 0, id: 1, sections: 1 } }).toArray() as Doc[]
    const pm = new Map(pats.map((p) => [p.id, new Map<string, string[]>((p.sections || []).map((x: Doc) => [String(x.id), Array.isArray(x.categories) ? x.categories : []]))]))
    for (const a of attempts) {
      const at = a.completedAt || a.createdAt
      const cats = pm.get(a.patternId) || new Map<string, string[]>()
      for (const sec of (a.result?.sections || []) as Doc[]) {
        const categories = cats.get(String(sec.id)) || []
        const snap = (a.sections || []).find((x: Doc) => x.id === sec.id) as Doc | undefined
        const qd = new Map<string, Doc>((snap?.questions || []).map((q: Doc) => [String(q.id), q]))
        const per = (Array.isArray(sec.questions) ? sec.questions : []).filter((q: Doc) => q.status !== 'not_scored')
        if (per.length && categories.length) {
          const area = categoryArea(categories[0])
          for (const q of per as Doc[]) answers.push({ domain: area.domain, topic: area.topic, difficulty: diff(qd.get(String(q.id))?.difficulty), correct: q.status === 'correct', at, source: 'company' })
        } else {
          out.sections.push({ categories, percent: Number(sec.percent) || 0, questions: (Number(sec.correct) || 0) + (Number(sec.wrong) || 0) + (Number(sec.unanswered) || 0), at, source: 'company' })
        }
      }
    }
  }

  // 3. Study practice sets.
  const prs = await (await practiceCol()).find({ user_id: userId, created_at: { $gte: since } }, { projection: { _id: 0, domain: 1, topic: 1, difficulty: 1, correct: 1, created_at: 1 } }).sort({ created_at: -1 }).limit(1000).toArray()
  for (const r of prs) answers.push({ domain: r.domain, topic: r.topic, difficulty: r.difficulty, correct: r.correct, at: r.created_at, source: 'practice' })

  // 4. AI mock interviews (report category scores are 0–100).
  const mocks = await db.collection('ai_mock_sessions').find({ userId, status: 'completed' }, { projection: { _id: 0, report: 1, completedAt: 1 } }).sort({ completedAt: -1 }).limit(10).toArray() as Doc[]
  for (const m of mocks) {
    const at = typeof m.completedAt === 'number' ? new Date(m.completedAt).toISOString() : m.completedAt
    const norm = (n: unknown) => { const v = Number(n); return Number.isFinite(v) ? (v > 10 ? v / 100 : v / 10) : null }
    const cats = Array.isArray(m.report?.categoryBreakdown) ? m.report.categoryBreakdown as Doc[] : []
    if (cats.length) for (const c of cats.slice(0, 8)) { const s = norm(c.score); if (s !== null && typeof c.category === 'string') out.interviews.push({ category: c.category.slice(0, 60), score: s, at }) }
    else { const s = norm(m.report?.overallScore); if (s !== null) out.interviews.push({ category: typeof m.report?.category === 'string' ? m.report.category.slice(0, 60) : 'Overall', score: s, at }) }
  }
  // 5. Interview simulator (interview_sim_sessions, when present): rubric dimensions 0–5 and per-topic question scores 0–100.
  const sims = await db.collection('interview_sim_sessions').find({ user_id: userId, status: 'completed', 'report.generated_at': { $gte: since } }, { projection: { _id: 0, 'report.dimension_averages': 1, 'report.questions.topic': 1, 'report.questions.score': 1, 'report.generated_at': 1 } }).sort({ created_at: -1 }).limit(10).toArray().catch(() => [] as Doc[]) as Doc[]
  for (const s of sims) {
    const at = s.report?.generated_at
    for (const [dim, v] of Object.entries((s.report?.dimension_averages || {}) as Record<string, unknown>).slice(0, 6)) {
      const n = Number(v)
      if (Number.isFinite(n)) out.interviews.push({ category: dim.charAt(0).toUpperCase() + dim.slice(1).slice(0, 40), score: Math.max(0, Math.min(1, n / 5)), at })
    }
    for (const q of (Array.isArray(s.report?.questions) ? s.report.questions : []).slice(0, 12) as Doc[]) {
      const n = Number(q.score)
      if (typeof q.topic === 'string' && q.topic && Number.isFinite(n)) out.interviews.push({ category: q.topic.slice(0, 60), score: Math.max(0, Math.min(1, n / 100)), at })
    }
  }
  return out
}
