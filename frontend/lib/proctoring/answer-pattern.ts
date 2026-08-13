/**
 * Answer pattern scoring — detects suspicious behaviors:
 * - Bulk paste events
 * - Instant answers (< 3 seconds)
 * - Uniform answer timing (bot-like)
 * - High clipboard usage
 * - Suspicious speed patterns
 *
 * Returns a composite cheating score 0-100.
 */

export interface AnswerEvent {
  questionId: string
  timestamp: number
  action: 'answer' | 'paste' | 'change' | 'skip'
  timeSpent: number  // ms since question was first viewed
  answerLength?: number
  clipboardContent?: string
}

export interface CheatingScore {
  total: number           // 0-100 composite score
  flags: string[]         // Human-readable flag descriptions
  breakdown: {
    pasteScore: number    // 0-30
    speedScore: number    // 0-25
    patternScore: number  // 0-25
    clipboardScore: number // 0-20
  }
  events: AnswerEvent[]
}

const PASTE_PENALTY = 15
const INSTANT_ANSWER_THRESHOLD_MS = 3000
const INSTANT_ANSWER_PENALTY = 10
const UNIFORM_TIMING_THRESHOLD = 0.3 // CV < 0.3 = suspiciously uniform
const UNIFORM_TIMING_PENALTY = 15
const CLIPBOARD_PENALTY = 5
const BULK_PASTE_PENALTY = 20

export function calculateCheatingScore(events: AnswerEvent[]): CheatingScore {
  const flags: string[] = []
  let pasteScore = 0
  let speedScore = 0
  let patternScore = 0
  let clipboardScore = 0

  // 1. Paste events
  const pasteEvents = events.filter(e => e.action === 'paste')
  if (pasteEvents.length > 3) {
    pasteScore = Math.min(30, pasteEvents.length * BULK_PASTE_PENALTY)
    flags.push(`${pasteEvents.length} paste events detected`)
  } else if (pasteEvents.length > 0) {
    pasteScore = pasteEvents.length * PASTE_PENALTY
    flags.push(`${pasteEvents.length} paste event(s)`)
  }

  // 2. Instant answers
  const answerEvents = events.filter(e => e.action === 'answer')
  const instantAnswers = answerEvents.filter(e => e.timeSpent < INSTANT_ANSWER_THRESHOLD_MS)
  if (instantAnswers.length > 0) {
    speedScore = Math.min(25, instantAnswers.length * INSTANT_ANSWER_PENALTY)
    flags.push(`${instantAnswers.length} answer(s) in under 3 seconds`)
  }

  // 3. Uniform timing (bot detection)
  if (answerEvents.length >= 3) {
    const times = answerEvents.map(e => e.timeSpent)
    const mean = times.reduce((a, b) => a + b, 0) / times.length
    const variance = times.reduce((a, b) => a + (b - mean) ** 2, 0) / times.length
    const cv = Math.sqrt(variance) / (mean || 1) // coefficient of variation

    if (cv < UNIFORM_TIMING_THRESHOLD) {
      patternScore = UNIFORM_TIMING_PENALTY
      flags.push(`Suspiciously uniform answer timing (CV: ${cv.toFixed(2)})`)
    }
  }

  // 4. High clipboard usage
  const clipboardEvents = events.filter(e => e.action === 'paste' && e.clipboardContent && e.clipboardContent.length > 100)
  if (clipboardEvents.length > 0) {
    clipboardScore = Math.min(20, clipboardEvents.length * CLIPBOARD_PENALTY)
    flags.push(`${clipboardEvents.length} long clipboard paste(s) detected`)
  }

  const total = Math.min(100, pasteScore + speedScore + patternScore + clipboardScore)

  return {
    total,
    flags,
    breakdown: { pasteScore, speedScore, patternScore, clipboardScore },
    events,
  }
}

export function scoreToLabel(score: number): { label: string; color: string } {
  if (score >= 70) return { label: 'High Risk', color: 'text-red-500' }
  if (score >= 40) return { label: 'Medium Risk', color: 'text-amber-500' }
  if (score >= 15) return { label: 'Low Risk', color: 'text-yellow-500' }
  return { label: 'Clean', color: 'text-green-500' }
}
