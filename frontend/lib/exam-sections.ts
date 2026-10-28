/**
 * Sections inside a test — ordered groups of questions (e.g. Coding, MCQ,
 * Written, CAD), each with a title, optional instructions, its own time limit
 * (or "shares the overall time") and an optional "lock after leaving".
 *
 * Pure and client-safe (no server imports): the editor uses the normaliser,
 * the candidate page the status helpers, and the exam routes the timing rules.
 *
 * Storage
 *   exam.sections            ExamSection[] (each owns its question_ids)
 *   exam_drafts.sections_state  SectionsState for the running attempt
 *   exam_submissions.section_timings / section_scores (copied at submit)
 *
 * A test without sections behaves exactly as before: resolveSections() returns
 * [] and every route skips the section rules.
 *
 * Timing rules (enforced by the server, the browser only displays them)
 *   - A section's clock starts the first time the candidate enters it.
 *   - Its deadline = start + its time limit, capped at the attempt deadline;
 *     a section that shares the overall time ends at the attempt deadline.
 *   - Past deadline + grace the section is closed ('time'): its answers can't
 *     change, and if it was the current section the candidate moves on to the
 *     next open section automatically (that section's clock starts at the
 *     previous deadline, so time keeps running while the candidate is away).
 *   - Leaving a section with lock_after_leave closes it ('left').
 *   - Only the current section's answers are accepted.
 */

export interface ExamSection {
  id: string
  title: string
  instructions?: string
  /** Minutes for this section; null = shares the overall test time. */
  time_limit_minutes: number | null
  /** Once the candidate leaves this section they can't go back. */
  lock_after_leave: boolean
  question_ids: string[]
}

export const MAX_SECTIONS = 12
export const MAX_SECTION_MINUTES = 600
const MAX_TITLE = 120
const MAX_INSTRUCTIONS = 4000

type Doc = Record<string, unknown>

function cleanId(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim() : ''
  return /^[A-Za-z0-9_-]{1,64}$/.test(s) ? s : null
}

/**
 * Coerce sections from an editor body (or a stored exam). Unknown keys are
 * dropped, strings capped, each question belongs to at most one section (the
 * first that lists it), and — when `questionIds` is given — only questions
 * that exist on the test are kept.
 */
export function normalizeSections(raw: unknown, questionIds?: readonly string[]): ExamSection[] {
  if (!Array.isArray(raw)) return []
  const known = questionIds ? new Set(questionIds.map(String)) : null
  const usedQ = new Set<string>()
  const usedIds = new Set<string>()
  const out: ExamSection[] = []
  for (const [i, item] of raw.slice(0, MAX_SECTIONS).entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const s = item as Doc
    let id = cleanId(s.id) ?? `sec_${i + 1}`
    while (usedIds.has(id)) id = `${id}_${i + 1}`
    usedIds.add(id)
    const title = (typeof s.title === 'string' ? s.title.trim() : '').slice(0, MAX_TITLE) || `Section ${out.length + 1}`
    const instructions = (typeof s.instructions === 'string' ? s.instructions.trim() : '').slice(0, MAX_INSTRUCTIONS)
    const minutes = Math.round(Number(s.time_limit_minutes))
    const time_limit_minutes = s.time_limit_minutes !== null && Number.isFinite(minutes) && minutes >= 1
      ? Math.min(MAX_SECTION_MINUTES, minutes)
      : null
    const question_ids: string[] = []
    for (const q of Array.isArray(s.question_ids) ? s.question_ids.slice(0, 500) : []) {
      const qid = typeof q === 'string' || typeof q === 'number' ? String(q).slice(0, 128) : ''
      if (!qid || usedQ.has(qid) || (known && !known.has(qid))) continue
      usedQ.add(qid)
      question_ids.push(qid)
    }
    out.push({
      id,
      title,
      ...(instructions ? { instructions } : {}),
      time_limit_minutes,
      lock_after_leave: s.lock_after_leave === true,
      question_ids,
    })
  }
  return out
}

function examQuestionIds(exam: Doc): string[] {
  const list = Array.isArray(exam.questionList) ? exam.questionList : Array.isArray(exam.questions) ? exam.questions : []
  return (list as unknown[]).map((q) => (q && typeof q === 'object' ? String((q as Doc).id ?? '') : '')).filter(Boolean)
}

/**
 * The sections a candidate actually takes, in order. Questions no section
 * lists go to the last section; sections left with no questions are dropped.
 * [] = the test has no sections (single implicit section, today's behaviour).
 */
export function resolveSections(exam: Doc): ExamSection[] {
  const qids = examQuestionIds(exam)
  const sections = normalizeSections(exam.sections, qids)
  if (sections.length === 0) return []
  const assigned = new Set(sections.flatMap((s) => s.question_ids))
  const unassigned = qids.filter((id) => !assigned.has(id))
  if (unassigned.length) {
    const last = sections[sections.length - 1]
    sections[sections.length - 1] = { ...last, question_ids: [...last.question_ids, ...unassigned] }
  }
  return sections.filter((s) => s.question_ids.length > 0)
}

/** Question id → section id. */
export function sectionIndex(sections: readonly ExamSection[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const s of sections) for (const q of s.question_ids) m.set(q, s.id)
  return m
}

// ─── Attempt state ───────────────────────────────────────────────────────────

export interface SectionProgress {
  started_at?: string
  /** ISO; null = no limit at all (untimed test, section shares the time). */
  deadline?: string | null
  closed_at?: string
  closed_reason?: 'left' | 'time'
}

export interface SectionsState {
  /** Section the candidate is in; null = every section is closed. */
  current: string | null
  sections: Record<string, SectionProgress>
  /** Optimistic-concurrency counter (bumped on every write). */
  v: number
}

export type SectionStatus = 'upcoming' | 'active' | 'open' | 'locked' | 'expired'

const iso = (ms: number) => new Date(ms).toISOString()
const ms = (v: unknown): number => (typeof v === 'string' && v ? Date.parse(v) : NaN)

/** Section deadline (epoch ms) for a start, capped at the attempt deadline; null = no limit. */
export function sectionDeadlineMs(section: Pick<ExamSection, 'time_limit_minutes'>, startedAtMs: number, attemptDeadline: number | null): number | null {
  const own = section.time_limit_minutes ? startedAtMs + section.time_limit_minutes * 60_000 : NaN
  const all = [own, attemptDeadline ?? NaN].filter((n) => !Number.isNaN(n))
  return all.length ? Math.min(...all) : null
}

function startSection(state: SectionsState, section: ExamSection, startMs: number, attemptDeadline: number | null): void {
  const prev = state.sections[section.id] || {}
  if (prev.started_at) return
  const dl = sectionDeadlineMs(section, startMs, attemptDeadline)
  state.sections[section.id] = { ...prev, started_at: iso(startMs), deadline: dl === null ? null : iso(dl) }
}

function isClosed(state: SectionsState, id: string): boolean {
  return !!state.sections[id]?.closed_at
}

/** A stored state, or null when it is missing / malformed / for other sections. */
export function parseSectionsState(raw: unknown, sections: readonly ExamSection[]): SectionsState | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Doc
  const ids = new Set(sections.map((s) => s.id))
  const current = typeof r.current === 'string' && ids.has(r.current) ? r.current : null
  const out: Record<string, SectionProgress> = {}
  const src = r.sections && typeof r.sections === 'object' ? (r.sections as Record<string, Doc>) : {}
  for (const id of ids) {
    const p = src[id]
    if (!p || typeof p !== 'object') continue
    out[id] = {
      ...(typeof p.started_at === 'string' ? { started_at: p.started_at } : {}),
      ...(typeof p.deadline === 'string' || p.deadline === null ? { deadline: p.deadline as string | null } : {}),
      ...(typeof p.closed_at === 'string' ? { closed_at: p.closed_at } : {}),
      ...(p.closed_reason === 'left' || p.closed_reason === 'time' ? { closed_reason: p.closed_reason } : {}),
    }
  }
  if (r.current !== null && current === null) return null
  return { current, sections: out, v: Number(r.v) || 0 }
}

/** Fresh state: the candidate is in the first section, its clock started at `now`. */
export function initSectionsState(sections: readonly ExamSection[], now: number, attemptDeadline: number | null): SectionsState {
  const state: SectionsState = { current: sections[0]?.id ?? null, sections: {}, v: 0 }
  if (sections[0]) startSection(state, sections[0], now, attemptDeadline)
  return state
}

/** Next section the candidate may enter after `fromId` (wrapping to earlier open ones), or null. */
function nextOpenSection(state: SectionsState, sections: readonly ExamSection[], fromId: string | null): ExamSection | null {
  const i = fromId ? sections.findIndex((s) => s.id === fromId) : -1
  const order = [...sections.slice(i + 1), ...sections.slice(0, Math.max(0, i))]
  return order.find((s) => !isClosed(state, s.id)) ?? null
}

/**
 * Apply the clock: close every section whose deadline + grace has passed and,
 * when the current one closed, move on (chained: the next section starts at
 * the previous deadline). Returns a new state; `changed` says whether to save.
 */
export function advanceSections(
  input: SectionsState,
  sections: readonly ExamSection[],
  now: number,
  attemptDeadline: number | null,
  graceMs: number,
): { state: SectionsState; changed: boolean } {
  const state: SectionsState = { current: input.current, sections: { ...input.sections }, v: input.v }
  let changed = false
  for (let guard = 0; guard <= sections.length + 1; guard++) {
    // Close every started section whose time is over.
    for (const s of sections) {
      const p = state.sections[s.id]
      if (!p?.started_at || p.closed_at) continue
      const dl = ms(p.deadline)
      if (!Number.isNaN(dl) && now > dl + graceMs) {
        state.sections[s.id] = { ...p, closed_at: iso(dl), closed_reason: 'time' }
        changed = true
      }
    }
    if (!state.current || !isClosed(state, state.current)) break
    // The current section closed: move on.
    const prevDeadline = ms(state.sections[state.current]?.deadline)
    const next = nextOpenSection(state, sections, state.current)
    state.current = next?.id ?? null
    changed = true
    if (!next) break
    startSection(state, next, Number.isNaN(prevDeadline) ? now : Math.min(now, prevDeadline), attemptDeadline)
  }
  return { state, changed }
}

/**
 * The candidate asks to go to `targetId`. Applies the clock first; refuses a
 * closed section; leaving a lock-after-leave section closes it.
 */
export function enterSection(
  input: SectionsState,
  sections: readonly ExamSection[],
  targetId: string,
  now: number,
  attemptDeadline: number | null,
  graceMs: number,
): { ok: true; state: SectionsState } | { ok: false; error: string; state: SectionsState } {
  const { state } = advanceSections(input, sections, now, attemptDeadline, graceMs)
  const target = sections.find((s) => s.id === targetId)
  if (!target) return { ok: false, error: 'Section not found.', state }
  const tp = state.sections[target.id]
  if (tp?.closed_at) {
    return { ok: false, error: tp.closed_reason === 'left' ? 'This section is locked.' : 'Time is up for this section.', state }
  }
  if (state.current === target.id) return { ok: true, state }
  const from = state.current ? sections.find((s) => s.id === state.current) : null
  if (from?.lock_after_leave) {
    state.sections[from.id] = { ...(state.sections[from.id] || {}), closed_at: iso(now), closed_reason: 'left' }
  }
  startSection(state, target, now, attemptDeadline)
  state.current = target.id
  return { ok: true, state }
}

export function sectionStatus(state: SectionsState, sectionId: string): SectionStatus {
  const p = state.sections[sectionId]
  if (p?.closed_at) return p.closed_reason === 'left' ? 'locked' : 'expired'
  if (state.current === sectionId) return 'active'
  return p?.started_at ? 'open' : 'upcoming'
}

/** Questions whose answers may change right now: the current, still-open section's. */
export function editableQuestionIds(state: SectionsState, sections: readonly ExamSection[]): Set<string> {
  const cur = sections.find((s) => s.id === state.current)
  return new Set(cur && !isClosed(state, cur.id) ? cur.question_ids : [])
}

/**
 * Answers to keep: `stored` everywhere, `incoming` only for the editable
 * questions. Used by save-draft, section switches and submit.
 */
export function mergeSectionAnswers<T>(stored: Record<string, T>, incoming: Record<string, T>, editable: Set<string>): Record<string, T> {
  const out: Record<string, T> = { ...stored }
  for (const [k, v] of Object.entries(incoming)) if (editable.has(k)) out[k] = v
  return out
}

/** Candidate-facing section list (no answers in here anyway; question ids only). */
export interface CandidateSectionView {
  id: string
  title: string
  instructions?: string
  time_limit_minutes: number | null
  lock_after_leave: boolean
  question_ids: string[]
  status: SectionStatus
  started_at: string | null
  deadline: string | null
}

export function candidateSectionsView(sections: readonly ExamSection[], state: SectionsState | null): CandidateSectionView[] {
  return sections.map((s) => {
    const p = state?.sections[s.id]
    return {
      id: s.id,
      title: s.title,
      ...(s.instructions ? { instructions: s.instructions } : {}),
      time_limit_minutes: s.time_limit_minutes,
      lock_after_leave: s.lock_after_leave,
      question_ids: s.question_ids,
      status: state ? sectionStatus(state, s.id) : 'upcoming',
      started_at: p?.started_at ?? null,
      deadline: p?.deadline ?? null,
    }
  })
}

/** Questions the candidate may see: those of sections they have entered (never upcoming ones). */
export function visibleQuestionIds(sections: readonly ExamSection[], state: SectionsState): Set<string> {
  return new Set(sections.filter((s) => sectionStatus(state, s.id) !== 'upcoming').flatMap((s) => s.question_ids))
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

export interface SectionScore {
  id: string
  title: string
  score: number
  max: number
  /** 0–100, null when the section has no scored points. */
  percent: number | null
}

interface DetailLike { qId?: unknown; correct?: unknown; points?: unknown; awarded?: unknown }
interface QuestionLike { id?: unknown; type?: unknown; points?: unknown; score?: unknown }

/**
 * Per-section score from a submission's `details` (awarded points, else full
 * points when correct — same rule as the grading routes). `isScored` decides
 * which question types count toward the maximum.
 */
export function sectionScores(
  sections: readonly ExamSection[],
  questions: readonly QuestionLike[],
  details: readonly DetailLike[],
  isScored: (type: unknown) => boolean,
): SectionScore[] {
  const qById = new Map(questions.map((q) => [String(q.id), q]))
  const dById = new Map(details.map((d) => [String(d.qId), d]))
  return sections.map((s) => {
    let score = 0
    let max = 0
    for (const qid of s.question_ids) {
      const q = qById.get(qid)
      const d = dById.get(qid)
      if (q && !isScored(q.type)) continue
      const pts = Number(d?.points ?? q?.points ?? q?.score) || 0
      max += pts
      if (d) score += d.awarded !== undefined && d.awarded !== null ? Number(d.awarded) || 0 : d.correct === true ? pts : 0
    }
    return { id: s.id, title: s.title, score, max, percent: max > 0 ? Math.min(100, Math.round((score / max) * 100)) : null }
  })
}
