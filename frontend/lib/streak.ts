/**
 * Streak maths from real activity days (pure — no DB).
 *
 * A "day" is a UTC date key `YYYY-MM-DD`. The current streak counts
 * consecutive active days ending today; if today has no activity yet, it
 * counts back from yesterday so the streak doesn't read 0 every morning
 * before the user has solved anything. A gap of one full day resets it.
 */

export function dayKey(d: Date | string): string {
  if (typeof d === 'string') return d.slice(0, 10)
  return d.toISOString().slice(0, 10)
}

function prevKey(key: string): string {
  const d = new Date(`${key}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return dayKey(d)
}

const KEY_RE = /^\d{4}-\d{2}-\d{2}$/

export interface StreakResult {
  current: number
  longest: number
  activeToday: boolean
}

export function computeStreak(days: Iterable<string>, today: string): StreakResult {
  const set = new Set<string>()
  for (const d of days) {
    const k = typeof d === 'string' ? d.slice(0, 10) : ''
    // Ignore malformed keys and anything after "today" (clock skew / bad data).
    if (KEY_RE.test(k) && k <= today) set.add(k)
  }

  const activeToday = set.has(today)
  let current = 0
  let cursor = activeToday ? today : prevKey(today)
  while (set.has(cursor)) {
    current++
    cursor = prevKey(cursor)
  }

  let longest = 0
  let run = 0
  let last: string | null = null
  for (const k of [...set].sort()) {
    run = last !== null && prevKey(k) === last ? run + 1 : 1
    if (run > longest) longest = run
    last = k
  }

  return { current, longest, activeToday }
}
