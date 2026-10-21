/**
 * Adaptive tests (pure, client-safe; tested in tests/adaptive-test.test.ts).
 *
 * A test with `adaptive: true` has no fixed question list. The server draws
 * one question at a time from the approved bank for the test's domain,
 * never repeating, and picks each next difficulty with a staircase:
 *
 *   start Medium · two correct in a row → one level up · a wrong answer → one level down
 *
 * The final score weights difficulty (Easy 1, Medium 2, Hard 3) against the
 * best possible run (every question Hard and correct), so 100 % needs the
 * candidate to climb to Hard and stay there.
 */
import type { BankDifficulty } from '@/lib/question-bot/domains'

export const ADAPTIVE_LEVELS: readonly BankDifficulty[] = ['Easy', 'Medium', 'Hard']
export const DIFFICULTY_WEIGHT: Record<BankDifficulty, number> = { Easy: 1, Medium: 2, Hard: 3 }
export const ADAPTIVE_START: BankDifficulty = 'Medium'
/** Approved questions per domain + level below which admins see a warning. */
export const THIN_BANK_MIN = 50
export const ADAPTIVE_LENGTH_DEFAULT = 15
export const ADAPTIVE_LENGTH_MAX = 60

export interface AdaptiveAnswer {
  difficulty: BankDifficulty
  correct: boolean
}

const up = (d: BankDifficulty): BankDifficulty => ADAPTIVE_LEVELS[Math.min(ADAPTIVE_LEVELS.length - 1, ADAPTIVE_LEVELS.indexOf(d) + 1)]
const down = (d: BankDifficulty): BankDifficulty => ADAPTIVE_LEVELS[Math.max(0, ADAPTIVE_LEVELS.indexOf(d) - 1)]

/**
 * Difficulty of the next question from the answers so far (staircase).
 * The level a question was served at is taken from the history itself, so a
 * fallback to a neighbouring level (thin bank) steers from where the
 * candidate actually was. Pure.
 */
export function nextDifficulty(history: readonly AdaptiveAnswer[]): BankDifficulty {
  let level: BankDifficulty = ADAPTIVE_START
  let streak = 0
  for (const h of history) {
    const at = ADAPTIVE_LEVELS.includes(h.difficulty) ? h.difficulty : level
    if (h.correct) {
      streak = at === level ? streak + 1 : 1
      level = at
      if (streak >= 2) { level = up(level); streak = 0 }
    } else {
      level = down(at)
      streak = 0
    }
  }
  return level
}

/** Levels to try, nearest first, when the wanted level has no unused question. Pure. */
export function fallbackLevels(wanted: BankDifficulty): BankDifficulty[] {
  if (wanted === 'Easy') return ['Easy', 'Medium', 'Hard']
  if (wanted === 'Hard') return ['Hard', 'Medium', 'Easy']
  return ['Medium', 'Easy', 'Hard']
}

export interface AdaptiveScore {
  /** Weighted points earned. */
  score: number
  /** Best possible weighted points for `length` questions (all Hard). */
  max: number
  percent: number
  correct: number
  answered: number
  /** Highest level reached. */
  peak: BankDifficulty
}

/** Difficulty-weighted score; unanswered questions (ran out of time / bank) count as 0. Pure. */
export function adaptiveScore(history: readonly AdaptiveAnswer[], length: number): AdaptiveScore {
  const n = Math.max(history.length, Math.floor(length) || 0)
  const max = n * DIFFICULTY_WEIGHT.Hard
  let score = 0
  let correct = 0
  let peak: BankDifficulty = 'Easy'
  for (const h of history) {
    if (ADAPTIVE_LEVELS.indexOf(h.difficulty) > ADAPTIVE_LEVELS.indexOf(peak)) peak = h.difficulty
    if (h.correct) { score += DIFFICULTY_WEIGHT[h.difficulty] ?? 0; correct++ }
  }
  return { score, max, percent: max > 0 ? Math.round((score / max) * 100) : 0, correct, answered: history.length, peak }
}

/** Levels with fewer than THIN_BANK_MIN approved questions. Pure. */
export function thinLevels(approved: Partial<Record<BankDifficulty, number>>, min = THIN_BANK_MIN): Array<{ difficulty: BankDifficulty; count: number }> {
  return ADAPTIVE_LEVELS.map((d) => ({ difficulty: d, count: Math.max(0, approved[d] || 0) })).filter((r) => r.count < min)
}

export interface AdaptiveSettings {
  adaptive: boolean
  adaptive_domain: string | null
  adaptive_length: number
}

/** Coerce the adaptive fields from an editor body. Pure. */
export function normalizeAdaptiveSettings(raw: Record<string, unknown>): { ok: true; value: AdaptiveSettings } | { ok: false; error: string } {
  const adaptive = raw.adaptive === true
  const domain = typeof raw.adaptive_domain === 'string' ? raw.adaptive_domain.trim().toLowerCase() : ''
  if (domain && !/^[a-z0-9_]{2,40}$/.test(domain)) return { ok: false, error: 'Unknown domain.' }
  if (adaptive && !domain) return { ok: false, error: 'Pick the domain the questions come from.' }
  const n = Math.floor(Number(raw.adaptive_length ?? ADAPTIVE_LENGTH_DEFAULT))
  if (!Number.isFinite(n) || n < 3 || n > ADAPTIVE_LENGTH_MAX) return { ok: false, error: `Number of questions must be 3–${ADAPTIVE_LENGTH_MAX}.` }
  return { ok: true, value: { adaptive, adaptive_domain: domain || null, adaptive_length: n } }
}

/** Does this exam doc run adaptively? Pure. */
export function isAdaptiveExam(exam: Record<string, unknown> | null | undefined): boolean {
  return !!exam && exam.adaptive === true && typeof exam.adaptive_domain === 'string' && exam.adaptive_domain.length > 0
}
