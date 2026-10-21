/**
 * Pure graders for the wave-6 question types (unit-tested in
 * tests/question-types-wave6.test.ts). No I/O: code execution (theory_to_code,
 * reverse_coding) stays in lib/ai/grade-question.ts, which runs hidden tests
 * exactly as for `coding`.
 *
 *  - typingStats / gradeTyping   typing_test   WPM + accuracy vs thresholds
 *  - gradeCaseStudy              case_study    sum of objective sub-scores
 *  - traitScores                 likert        per-trait psychometric scores
 *  - gradeInstant                dispatcher used at submit time
 */
import { compareObjectiveAnswer } from '@/lib/grading'
import { canonicalType } from '@/lib/question-types'
import { parseJsonAnswer, sanitizeSubQuestions, type TypingConfig } from '@/lib/question-extensions'

// ─── Typing ──────────────────────────────────────────────────────────────────

export interface TypingStats {
  /** Net words per minute (gross − errors per minute), standard 5-char words. */
  wpm: number
  grossWpm: number
  /** 0-100: typed characters that match the passage at the same position. */
  accuracy: number
  typedChars: number
  correctChars: number
  errors: number
  minutes: number
}

/**
 * Character-position comparison against the passage. Elapsed time below one
 * second is treated as one second so a pasted or instant answer can't divide
 * by zero.
 */
export function typingStats(passage: string, typed: string, elapsedMs: number): TypingStats {
  const p = String(passage ?? '')
  const t = String(typed ?? '')
  const minutes = Math.max(1000, Number.isFinite(elapsedMs) ? elapsedMs : 0) / 60000
  let correct = 0
  for (let i = 0; i < t.length; i++) if (t[i] === p[i]) correct++
  const errors = t.length - correct
  const grossWpm = t.length / 5 / minutes
  const wpm = Math.max(0, grossWpm - errors / minutes)
  const accuracy = t.length ? (correct / t.length) * 100 : 0
  const r1 = (n: number) => Math.round(n * 10) / 10
  return { wpm: r1(wpm), grossWpm: r1(grossWpm), accuracy: r1(accuracy), typedChars: t.length, correctChars: correct, errors, minutes }
}

/** Faster than this is not human typing: the grade goes to a person. */
export const TYPING_SUSPICIOUS_WPM = 200

export interface InstantGrade {
  awarded: number
  correct: boolean
  feedback: string
  /** Send to a person even though a score was computed. */
  requires_human_review?: boolean
}

/**
 * Full marks when both thresholds are met; otherwise points × (wpm ratio ×
 * accuracy ratio), each ratio capped at 1, rounded down. Typing less than a
 * fifth of the passage scores 0 (a few fast, accurate words are not a test).
 */
export function gradeTyping(cfg: TypingConfig | undefined, rawAnswer: string, maxPoints: number): InstantGrade {
  if (!cfg?.passage) return { awarded: 0, correct: false, feedback: 'This typing test has no passage — mark it by hand.', requires_human_review: true }
  const a = parseJsonAnswer(rawAnswer)
  const typed = typeof a.typed === 'string' ? a.typed : ''
  const s = typingStats(cfg.passage, typed, Number(a.elapsed_ms))
  const label = `${s.wpm} WPM at ${s.accuracy}% accuracy (target ${cfg.min_wpm} WPM, ${cfg.min_accuracy}%).`
  if (!typed.trim()) return { awarded: 0, correct: false, feedback: 'Nothing was typed.' }
  if (typed.length < cfg.passage.length * 0.2) return { awarded: 0, correct: false, feedback: `Too little of the passage was typed. ${label}` }
  const suspicious = s.grossWpm > TYPING_SUSPICIOUS_WPM
  const met = s.wpm >= cfg.min_wpm && s.accuracy >= cfg.min_accuracy
  const ratio = met ? 1 : Math.min(1, s.wpm / cfg.min_wpm) * Math.min(1, s.accuracy / cfg.min_accuracy)
  const awarded = Math.max(0, Math.min(maxPoints, Math.floor(ratio * maxPoints)))
  return {
    awarded,
    correct: met,
    feedback: `${met ? 'Met both targets' : 'Below target'}: ${label}${suspicious ? ' Unusually fast — check for pasting.' : ''}`,
    ...(suspicious ? { requires_human_review: true } : {}),
  }
}

// ─── Case study ──────────────────────────────────────────────────────────────

/**
 * Each sub-question is marked by the shared objective grader (partial credit
 * where it has one); the question's score is the sum, scaled to `maxPoints`
 * when the sub-points don't add up to it.
 */
export function gradeCaseStudy(rawSubs: unknown, rawAnswer: string, maxPoints: number): InstantGrade & { parts: { id: string; awarded: number; points: number }[] } {
  const subs = sanitizeSubQuestions(rawSubs)
  if (!subs.length) return { awarded: 0, correct: false, feedback: 'This case study has no sub-questions — mark it by hand.', requires_human_review: true, parts: [] }
  const a = parseJsonAnswer(rawAnswer)
  let earned = 0
  let total = 0
  const parts = subs.map((s) => {
    const v = a[s.id]
    const given = Array.isArray(v) ? v.map((x) => String(x ?? '')).join(', ') : typeof v === 'string' || typeof v === 'number' ? String(v) : ''
    const cmp = given.trim() ? compareObjectiveAnswer({ type: s.type, options: s.options, answer: s.answer, tolerance: s.tolerance }, given) : { ratio: 0 }
    const got = Math.round(cmp.ratio * s.points * 100) / 100
    earned += got
    total += s.points
    return { id: s.id, awarded: got, points: s.points }
  })
  const scaled = total > 0 ? (earned / total) * maxPoints : 0
  const awarded = Math.max(0, Math.min(maxPoints, Math.round(scaled)))
  const right = parts.filter((p) => p.awarded >= p.points).length
  return { awarded, correct: awarded >= maxPoints, feedback: `${right} of ${parts.length} part(s) fully correct (${Math.round(earned * 10) / 10}/${total} sub-points).`, parts }
}

// ─── Psychometric traits ─────────────────────────────────────────────────────

export interface TraitScore {
  trait: string
  /** Answered items that carry this trait. */
  items: number
  /** Mean item score after reverse-keying, on the items' own scale. */
  mean: number
  /** 0-100: the mean placed between each item's min and max. */
  percent: number
}

/**
 * Per-trait scores from Likert answers. Reverse-scored items flip as
 * `min + max − value`. Unanswered or out-of-range answers are skipped.
 * Never part of the pass mark (Likert stays unscored).
 */
export function traitScores(
  questions: readonly { id?: unknown; type?: unknown; trait?: unknown; reverse_scored?: unknown; scale?: { min?: unknown; max?: unknown } }[],
  answers: Record<string, unknown>,
): TraitScore[] {
  const acc = new Map<string, { sum: number; pct: number; n: number }>()
  for (const q of questions) {
    if (canonicalType(q.type) !== 'likert') continue
    const trait = typeof q.trait === 'string' ? q.trait.trim() : ''
    if (!trait) continue
    const min = Number(q.scale?.min ?? 1)
    const max = Number(q.scale?.max ?? 5)
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) continue
    const v = Number(String(answers[String(q.id)] ?? '').trim())
    if (!String(answers[String(q.id)] ?? '').trim() || !Number.isFinite(v) || v < min || v > max) continue
    const value = q.reverse_scored === true ? min + max - v : v
    const cur = acc.get(trait) ?? { sum: 0, pct: 0, n: 0 }
    cur.sum += value
    cur.pct += ((value - min) / (max - min)) * 100
    cur.n += 1
    acc.set(trait, cur)
  }
  return [...acc.entries()]
    .map(([trait, c]) => ({ trait, items: c.n, mean: Math.round((c.sum / c.n) * 100) / 100, percent: Math.round(c.pct / c.n) }))
    .sort((x, y) => x.trait.localeCompare(y.trait))
}

// ─── Dispatcher ──────────────────────────────────────────────────────────────

/**
 * Submit-time marking for the wave-6 types that need no person and no code
 * run (case_study, typing_test). Null = not one of them (the caller keeps its
 * existing path).
 */
export function gradeInstant(q: Record<string, unknown>, rawAnswer: string, maxPoints: number): InstantGrade | null {
  const t = canonicalType(q.type)
  if (t === 'case_study') {
    if (!Array.isArray(q.sub_questions) || !q.sub_questions.length) return null
    const g = gradeCaseStudy(q.sub_questions, rawAnswer, maxPoints)
    return { awarded: g.awarded, correct: g.correct, feedback: g.feedback, ...(g.requires_human_review ? { requires_human_review: true } : {}) }
  }
  if (t === 'typing_test') return gradeTyping(q.typing as TypingConfig | undefined, rawAnswer, maxPoints)
  return null
}

/** Human-marked types: what the auto-grader records before a person looks. */
export function humanOnlyGrade(type: unknown): InstantGrade | null {
  const t = canonicalType(type)
  if (t === 'file_upload') return { awarded: 0, correct: false, feedback: 'File answer — needs a person to mark it.', requires_human_review: true }
  if (t === 'video_response') return { awarded: 0, correct: false, feedback: 'Video answer — needs a person to watch and mark it.', requires_human_review: true }
  return null
}

/** system_design answer → plain text for the AI marker (diagram kept as text). */
export function systemDesignText(rawAnswer: string): string {
  const a = parseJsonAnswer(rawAnswer)
  if (!Object.keys(a).length) return rawAnswer
  const text = typeof a.text === 'string' ? a.text : ''
  const diagram = typeof a.diagram === 'string' ? a.diagram.trim() : ''
  return diagram ? `${text}\n\nDIAGRAM (text / mermaid):\n${diagram}` : text
}
