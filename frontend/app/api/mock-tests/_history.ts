/**
 * Mock-test attempt history (pure — no DB). Used by GET /api/mock-tests/attempts
 * to build the Mongo filter/sort from query params and to shape rows.
 *
 * Statuses:
 *  - submitted   — graded on the server (`submitted_at` set)
 *  - in_progress — open, has questions, not abandoned, still inside the resume window
 * Abandoned and stale/generating attempts are never listed.
 */
import { RESUME_WINDOW_MS, type MockTestSessionDoc } from './_sessions'

export type HistoryStatus = 'all' | 'submitted' | 'in_progress'
export type HistorySort = 'date' | 'score'

export interface HistoryQuery {
  page: number
  pageSize: number
  company: string | null
  role: string | null
  status: HistoryStatus
  sort: HistorySort
  order: 'asc' | 'desc'
}

export const MAX_PAGE_SIZE = 50
const MAX_FILTER_CHARS = 100

function clampInt(raw: string | null, def: number, min: number, max: number): number {
  const n = Number(raw)
  if (!raw || !Number.isFinite(n)) return def
  return Math.min(max, Math.max(min, Math.floor(n)))
}

function filterValue(raw: string | null): string | null {
  const v = (raw ?? '').trim()
  return v ? v.slice(0, MAX_FILTER_CHARS) : null
}

export function parseHistoryQuery(sp: URLSearchParams): HistoryQuery {
  const status = sp.get('status')
  const sort = sp.get('sort')
  return {
    page: clampInt(sp.get('page'), 1, 1, 10_000),
    pageSize: clampInt(sp.get('page_size'), 10, 1, MAX_PAGE_SIZE),
    company: filterValue(sp.get('company')),
    role: filterValue(sp.get('role')),
    status: status === 'submitted' || status === 'in_progress' ? status : 'all',
    sort: sort === 'score' ? 'score' : 'date',
    order: sp.get('order') === 'asc' ? 'asc' : 'desc',
  }
}

/** Filter for the caller's open (resumable) attempts. */
export function inProgressFilter(now: number): Record<string, unknown> {
  return {
    submitted_at: null,
    abandoned_at: { $exists: false },
    'questions.0': { $exists: true },
    created_at: { $gte: new Date(now - RESUME_WINDOW_MS).toISOString() },
  }
}

/**
 * Mongo filter for the history list. Company/role are exact matches (values
 * come from the facet lists), never regexes built from user input.
 */
export function buildHistoryFilter(userId: string, q: Pick<HistoryQuery, 'company' | 'role' | 'status'>, now: number): Record<string, unknown> {
  const filter: Record<string, unknown> = { user_id: userId }
  if (q.company) filter.company = q.company
  if (q.role) filter.role = q.role
  const submitted = { submitted_at: { $ne: null } }
  if (q.status === 'submitted') Object.assign(filter, submitted)
  else if (q.status === 'in_progress') Object.assign(filter, inProgressFilter(now))
  else filter.$or = [submitted, inProgressFilter(now)]
  return filter
}

export function buildHistorySort(q: Pick<HistoryQuery, 'sort' | 'order'>): Record<string, 1 | -1> {
  const dir = q.order === 'asc' ? 1 : -1
  return q.sort === 'score'
    ? { percentage: dir, created_at: -1, id: 1 }
    : { created_at: dir, id: 1 }
}

/** Seconds from start (first autosaved start, else creation) to submission; null while open. */
export function timeTakenSeconds(doc: Pick<MockTestSessionDoc, 'created_at' | 'submitted_at' | 'progress'>): number | null {
  if (!doc.submitted_at) return null
  const end = Date.parse(doc.submitted_at)
  const started = typeof doc.progress?.started_at === 'number' ? doc.progress.started_at : Date.parse(doc.created_at)
  if (!Number.isFinite(end) || !Number.isFinite(started)) return null
  return Math.max(0, Math.round((end - started) / 1000))
}

export interface HistoryRow {
  id: string
  company: string
  role: string
  difficulty: string
  status: 'submitted' | 'in_progress'
  score: number | null
  total: number
  percentage: number | null
  created_at: string
  submitted_at: string | null
  time_taken_sec: number | null
}

export function toHistoryRow(doc: MockTestSessionDoc): HistoryRow {
  const submitted = Boolean(doc.submitted_at)
  return {
    id: doc.id,
    company: doc.company,
    role: doc.role,
    difficulty: doc.difficulty,
    status: submitted ? 'submitted' : 'in_progress',
    score: submitted ? doc.score ?? 0 : null,
    total: doc.total ?? doc.questions?.length ?? 0,
    percentage: submitted ? doc.percentage ?? 0 : null,
    created_at: doc.created_at,
    submitted_at: doc.submitted_at ?? null,
    time_taken_sec: timeTakenSeconds(doc),
  }
}

/** Per-question review for a submitted attempt (answer key only after submission). */
export function reviewQuestions(doc: MockTestSessionDoc) {
  if (!doc.submitted_at) return null
  const answers = doc.answers ?? {}
  return doc.questions.map((q, i) => {
    const chosen = typeof answers[String(i)] === 'number' ? answers[String(i)] : null
    return {
      index: i,
      question: q.question,
      options: q.options,
      chosen_index: chosen,
      correct_index: q.correctIndex,
      correct: chosen !== null && chosen === q.correctIndex,
      explanation: q.explanation,
    }
  })
}
