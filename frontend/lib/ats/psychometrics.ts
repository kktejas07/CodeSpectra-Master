/**
 * Classical test theory item statistics (pure; tests/hiring-insights.test.ts).
 *
 *   difficulty (p-value)  mean item score / item max — share of the marks
 *                          candidates earned (1 = everyone got it, 0 = nobody).
 *   discrimination         corrected point-biserial: Pearson r between the
 *                          item score and the total score WITHOUT that item
 *                          (so an item doesn't correlate with itself). For a
 *                          0/1 item this is the point-biserial correlation.
 *
 * The server aggregates sufficient statistics per question in one Mongo
 * pipeline (n, Σx, Σx², ΣT, ΣT², ΣxT with x = item score, T = total score)
 * and `itemStatsFromSums` turns them into the numbers — no per-candidate rows
 * leave the database. `itemStats` does the same from raw arrays (tests, small
 * sets) and must agree with it.
 *
 * Flags follow common rules of thumb: p > 0.9 too easy, p < 0.2 too hard,
 * r < 0.2 weak, r < 0 negative (strong candidates do worse — check the key).
 * Fewer than MIN_ITEM_N responses: numbers are shown but not flagged.
 */

export const MIN_ITEM_N = 20

export interface ItemSums {
  n: number
  sx: number
  sxx: number
  sT: number
  sTT: number
  sxT: number
}

export type ItemFlag = 'too_easy' | 'too_hard' | 'weak_discrimination' | 'negative_discrimination' | 'few_responses'

export interface ItemStats {
  n: number
  /** 0–1, or null when the item max is unknown / no responses. */
  p: number | null
  /** −1…1, or null when there is no variance. */
  r: number | null
  mean: number | null
  flags: ItemFlag[]
}

const round = (v: number, d = 3) => Math.round(v * 10 ** d) / 10 ** d

/** Pearson r from sums; null without variance. */
export function pearsonFromSums(n: number, sx: number, sy: number, sxx: number, syy: number, sxy: number): number | null {
  if (n < 2) return null
  const cov = sxy - (sx * sy) / n
  const vx = sxx - (sx * sx) / n
  const vy = syy - (sy * sy) / n
  if (vx <= 1e-12 || vy <= 1e-12) return null
  return Math.max(-1, Math.min(1, cov / Math.sqrt(vx * vy)))
}

export function flagsFor(n: number, p: number | null, r: number | null): ItemFlag[] {
  if (n < MIN_ITEM_N) return ['few_responses']
  const f: ItemFlag[] = []
  if (p !== null && p > 0.9) f.push('too_easy')
  if (p !== null && p < 0.2) f.push('too_hard')
  if (r !== null && r < 0) f.push('negative_discrimination')
  else if (r !== null && r < 0.2) f.push('weak_discrimination')
  return f
}

/** Item stats from sufficient statistics; `max` = the item's marks. */
export function itemStatsFromSums(s: ItemSums, max: number): ItemStats {
  if (!s.n) return { n: 0, p: null, r: null, mean: null, flags: ['few_responses'] }
  const mean = s.sx / s.n
  const p = max > 0 ? Math.max(0, Math.min(1, mean / max)) : null
  // Corrected total R = T − x:  ΣR = ΣT − Σx,  ΣR² = ΣT² − 2ΣxT + Σx²,  ΣxR = ΣxT − Σx².
  const sR = s.sT - s.sx
  const sRR = s.sTT - 2 * s.sxT + s.sxx
  const sxR = s.sxT - s.sxx
  const r = pearsonFromSums(s.n, s.sx, sR, s.sxx, sRR, sxR)
  return { n: s.n, p: p === null ? null : round(p), r: r === null ? null : round(r), mean: round(mean, 2), flags: flagsFor(s.n, p, r) }
}

export function sumsOf(items: readonly number[], totals: readonly number[]): ItemSums {
  const s: ItemSums = { n: 0, sx: 0, sxx: 0, sT: 0, sTT: 0, sxT: 0 }
  const n = Math.min(items.length, totals.length)
  for (let i = 0; i < n; i++) {
    const x = items[i], T = totals[i]
    if (!Number.isFinite(x) || !Number.isFinite(T)) continue
    s.n++; s.sx += x; s.sxx += x * x; s.sT += T; s.sTT += T * T; s.sxT += x * T
  }
  return s
}

/** Raw-array version (tests / small sets). */
export function itemStats(items: readonly number[], totals: readonly number[], max: number): ItemStats {
  return itemStatsFromSums(sumsOf(items, totals), max)
}

/** Uncorrected point-biserial for a 0/1 item: (M1 − M0)/s · √(p q). */
export function pointBiserial(correct: readonly boolean[], totals: readonly number[]): number | null {
  const n = Math.min(correct.length, totals.length)
  if (n < 2) return null
  let n1 = 0, s1 = 0, s0 = 0, sum = 0, sq = 0
  for (let i = 0; i < n; i++) {
    const T = totals[i]
    sum += T; sq += T * T
    if (correct[i]) { n1++; s1 += T } else s0 += T
  }
  const n0 = n - n1
  if (!n1 || !n0) return null
  const mean = sum / n
  const sd = Math.sqrt(Math.max(0, sq / n - mean * mean))
  if (sd <= 1e-12) return null
  const p = n1 / n
  return Math.max(-1, Math.min(1, ((s1 / n1 - s0 / n0) / sd) * Math.sqrt(p * (1 - p))))
}

/** Histogram of 0–100 percentages in `bins` equal buckets (100 falls in the last). */
export function histogram(pcts: readonly number[], bins = 10): Array<{ from: number; to: number; count: number }> {
  const w = 100 / bins
  const out = Array.from({ length: bins }, (_, i) => ({ from: Math.round(i * w), to: Math.round((i + 1) * w), count: 0 }))
  for (const v of pcts) {
    if (!Number.isFinite(v)) continue
    const i = Math.min(bins - 1, Math.max(0, Math.floor(v / w)))
    out[i].count++
  }
  return out
}

export function describe(xs: readonly number[]): { n: number; mean: number | null; median: number | null; sd: number | null } {
  const v = xs.filter(Number.isFinite)
  if (!v.length) return { n: 0, mean: null, median: null, sd: null }
  const s = [...v].sort((a, b) => a - b)
  const mean = v.reduce((a, b) => a + b, 0) / v.length
  const m = Math.floor(s.length / 2)
  const median = s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
  const sd = v.length > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (v.length - 1)) : null
  return { n: v.length, mean: round(mean, 1), median: round(median, 1), sd: sd === null ? null : round(sd, 1) }
}
