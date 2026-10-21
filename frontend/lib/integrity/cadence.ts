/**
 * Typing cadence (pure, client-safe). The editor side records only WHEN a key
 * went down and its class (character / delete / other) — never which key —
 * and this turns those timings into a small summary that is sent to the
 * server. No content ever leaves the browser.
 */

export type KeyClass = 'char' | 'delete' | 'other'

export interface KeySample {
  /** performance.now() / epoch ms — only differences matter. */
  t: number
  k: KeyClass
}

export interface CadenceSummary {
  keys: number
  chars: number
  deletes: number
  /** Mean / median / standard deviation of gaps between keys (ms), pauses excluded. */
  mean_ms: number
  median_ms: number
  sd_ms: number
  /** Gaps longer than `pauseMs` (thinking pauses). */
  pauses: number
  /** Runs of ≥ 8 keys with every gap < 60 ms (machine-like or autotype bursts). */
  fast_bursts: number
  /** Time spent typing (sum of gaps below `pauseMs`). */
  active_ms: number
  first_at: number | null
  last_at: number | null
}

export const PAUSE_MS = 5_000

export function summariseCadence(samples: readonly KeySample[], pauseMs = PAUSE_MS): CadenceSummary {
  const s = samples.filter((x) => x && Number.isFinite(x.t)).slice().sort((a, b) => a.t - b.t)
  const chars = s.filter((x) => x.k === 'char').length
  const deletes = s.filter((x) => x.k === 'delete').length
  const gaps: number[] = []
  let pauses = 0
  let fastRun = 0
  let fastBursts = 0
  for (let i = 1; i < s.length; i++) {
    const g = s[i].t - s[i - 1].t
    if (g >= pauseMs) { pauses++; fastRun = 0; continue }
    gaps.push(g)
    if (g < 60) {
      fastRun++
      if (fastRun === 7) fastBursts++ // 7 fast gaps = 8 keys
    } else fastRun = 0
  }
  const mean = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0
  const sorted = gaps.slice().sort((a, b) => a - b)
  const median = sorted.length ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2) : 0
  const sd = gaps.length ? Math.sqrt(gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / gaps.length) : 0
  return {
    keys: s.length,
    chars,
    deletes,
    mean_ms: Math.round(mean),
    median_ms: Math.round(median),
    sd_ms: Math.round(sd),
    pauses,
    fast_bursts: fastBursts,
    active_ms: Math.round(gaps.reduce((a, b) => a + b, 0)),
    first_at: s.length ? s[0].t : null,
    last_at: s.length ? s[s.length - 1].t : null,
  }
}

/** Combine several summaries for one question (weighted by gaps). */
export function mergeCadence(list: readonly Partial<CadenceSummary>[]): CadenceSummary {
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  let keys = 0, chars = 0, deletes = 0, pauses = 0, bursts = 0, active = 0, wMean = 0, wSd = 0, wMed = 0, w = 0
  let first: number | null = null
  let last: number | null = null
  for (const c of list) {
    const k = n(c.keys)
    keys += k; chars += n(c.chars); deletes += n(c.deletes); pauses += n(c.pauses); bursts += n(c.fast_bursts); active += n(c.active_ms)
    const gw = Math.max(0, k - 1)
    wMean += n(c.mean_ms) * gw; wSd += n(c.sd_ms) * gw; wMed += n(c.median_ms) * gw; w += gw
    if (typeof c.first_at === 'number') first = first === null ? c.first_at : Math.min(first, c.first_at)
    if (typeof c.last_at === 'number') last = last === null ? c.last_at : Math.max(last, c.last_at)
  }
  return {
    keys, chars, deletes, pauses, fast_bursts: bursts, active_ms: Math.round(active),
    mean_ms: w ? Math.round(wMean / w) : 0, sd_ms: w ? Math.round(wSd / w) : 0, median_ms: w ? Math.round(wMed / w) : 0,
    first_at: first, last_at: last,
  }
}

/** Classify a KeyboardEvent without reading which key it was beyond its class. */
export function keyClassOf(e: { key?: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }): KeyClass {
  if (e.ctrlKey || e.metaKey || e.altKey) return 'other'
  const key = e.key || ''
  if (key === 'Backspace' || key === 'Delete') return 'delete'
  return key.length === 1 || key === 'Enter' || key === 'Tab' ? 'char' : 'other'
}
