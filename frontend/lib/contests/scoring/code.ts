/**
 * Pure scorers for the code formats: theory-to-code, reverse coding,
 * debug-a-thon and code golf. Test execution happens elsewhere (Piston);
 * these only turn pass counts / lengths into points.
 */

/** Points for passing `passed` of `total` hidden tests. */
export function scoreTests(passed: number, total: number, points: number): number {
  if (!(total > 0) || !(points > 0)) return 0
  const p = Math.max(0, Math.min(total, Math.floor(passed)))
  return Math.round((points * p) / total)
}

export interface DebugScoreInput {
  passed: number
  total: number
  points: number
  /** Minutes from the contest start to this submission. */
  minutesElapsed: number
  penaltyPerMinute: number
  /** Floor after the penalty, as a percent of the points earned from tests. */
  minPercent: number
}

/**
 * Debug-a-thon: share of tests turned green, minus a time penalty. The
 * penalty never takes the score below `minPercent` of what the tests earned,
 * and a submission that turns nothing green scores 0.
 */
export function scoreDebug(i: DebugScoreInput): number {
  const earned = scoreTests(i.passed, i.total, i.points)
  if (earned <= 0) return 0
  const minutes = Math.max(0, Number.isFinite(i.minutesElapsed) ? i.minutesElapsed : 0)
  const penalty = Math.max(0, Number.isFinite(i.penaltyPerMinute) ? i.penaltyPerMinute : 0) * minutes
  const floor = (earned * Math.max(0, Math.min(100, Number.isFinite(i.minPercent) ? i.minPercent : 0))) / 100
  return Math.round(Math.max(floor, earned - penalty) * 100) / 100
}

/**
 * Golf length: Unicode code points after normalising line endings and
 * dropping trailing whitespace at the very end (editors add a newline).
 */
export function golfLength(source: string): number {
  const s = String(source ?? '').replace(/\r\n?/g, '\n').replace(/\s+$/u, '')
  return [...s].length
}

/** Shortest passing solution takes full points; longer ones get best/mine of it. */
export function golfPoints(myLength: number, bestLength: number, points: number): number {
  if (!(myLength > 0) || !(bestLength > 0) || !(points > 0)) return 0
  return Math.round((points * Math.min(myLength, bestLength)) / myLength * 100) / 100
}

/** Whitespace / CRLF-insensitive output comparison (same rule as codeathons). */
export function outputMatches(actual: unknown, expected: unknown): boolean {
  const norm = (v: unknown) => String(v ?? '').replace(/\r\n/g, '\n').split('\n').map((l) => l.replace(/\s+$/, '')).join('\n').trim()
  return norm(actual) === norm(expected)
}
