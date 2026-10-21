/**
 * "Was this code written with AI help?" — SIGNALS, never a verdict (pure,
 * tested). Each signal says what was seen and how strongly; `level` only
 * tells a reviewer how much there is to look at.
 *
 * Inputs per (candidate, question): paste events (from the proctoring
 * signals), the typing-rhythm summary (timings only), time to solution vs
 * the question's difficulty, and — optionally — a model classifier's
 * probability (spend-capped, see similarity-job.ts).
 */

export interface AiSignalInput {
  code_length: number
  /** Characters pasted into this answer (sum of paste events). */
  pasted_chars: number
  paste_events: number
  /** Typing summary (merged); null when typing rhythm was off. */
  typed_chars: number | null
  mean_gap_ms?: number | null
  sd_gap_ms?: number | null
  fast_bursts?: number | null
  /** Time on the question / task (ms); null when unknown. */
  time_ms: number | null
  difficulty?: string | null
  /** Answer was correct / passed all tests. */
  solved: boolean
  /** 0–1 from the optional classifier. */
  classifier?: number | null
}

export interface AiSignal {
  id: 'paste_share' | 'low_typing' | 'uniform_rhythm' | 'fast_bursts' | 'fast_solution' | 'classifier'
  label: string
  detail: string
  /** 0–1. */
  strength: number
}

export interface AiSignalResult {
  signals: AiSignal[]
  /** Highest-strength-weighted combination, 0–1 (for sorting only). */
  combined: number
  level: 'none' | 'low' | 'medium' | 'high'
}

/** Minutes a solid candidate typically needs, by difficulty. */
export const EXPECTED_MINUTES: Record<string, number> = { easy: 10, medium: 20, hard: 35, beginner: 10, intermediate: 20, advanced: 35, expert: 45 }

const clamp = (x: number) => Math.max(0, Math.min(1, x))
const pct = (x: number) => `${Math.round(x * 100)}%`

export function aiSignals(i: AiSignalInput): AiSignalResult {
  const out: AiSignal[] = []
  const len = Math.max(0, i.code_length)
  if (len >= 40) {
    // 1. Most of the answer arrived by paste.
    if (i.pasted_chars > 0) {
      const share = clamp(i.pasted_chars / len)
      if (share >= 0.3) out.push({ id: 'paste_share', label: 'Mostly pasted', detail: `About ${pct(share)} of the answer was pasted in ${i.paste_events} paste${i.paste_events === 1 ? '' : 's'}.`, strength: clamp((share - 0.3) / 0.6 + 0.3) })
    }
    // 2. Far fewer keys typed than characters in the answer (and not explained by paste).
    if (i.typed_chars !== null && i.typed_chars !== undefined) {
      const explained = i.typed_chars + i.pasted_chars
      const gap = clamp(1 - explained / len)
      if (gap >= 0.5) out.push({ id: 'low_typing', label: 'Little typing', detail: `Only ${i.typed_chars} characters were typed for a ${len}-character answer.`, strength: clamp(gap) })
    }
  }
  // 3. Very even rhythm (humans vary; replayed / autotyped input does not).
  if (typeof i.mean_gap_ms === 'number' && typeof i.sd_gap_ms === 'number' && (i.typed_chars ?? 0) >= 80 && i.mean_gap_ms > 0) {
    const cv = i.sd_gap_ms / i.mean_gap_ms
    if (cv < 0.35) out.push({ id: 'uniform_rhythm', label: 'Very even typing', detail: `Typing gaps barely vary (variation ${cv.toFixed(2)}; people are usually above 0.5).`, strength: clamp((0.35 - cv) / 0.35 + 0.2) })
  }
  // 4. Bursts faster than a person types.
  if ((i.fast_bursts ?? 0) >= 3) out.push({ id: 'fast_bursts', label: 'Typing bursts', detail: `${i.fast_bursts} bursts of 8+ keys faster than 60 ms apart.`, strength: clamp((i.fast_bursts as number) / 10) })
  // 5. Solved much faster than the difficulty suggests.
  if (i.solved && typeof i.time_ms === 'number' && i.time_ms > 0 && len >= 80) {
    const exp = EXPECTED_MINUTES[String(i.difficulty || 'medium').toLowerCase()] ?? EXPECTED_MINUTES.medium
    const ratio = i.time_ms / (exp * 60_000)
    if (ratio < 0.25) out.push({ id: 'fast_solution', label: 'Very fast solve', detail: `Solved in ${Math.max(1, Math.round(i.time_ms / 60_000))} min; about ${exp} min is typical for this difficulty.`, strength: clamp((0.25 - ratio) / 0.25 + 0.2) })
  }
  // 6. Optional classifier.
  if (typeof i.classifier === 'number' && Number.isFinite(i.classifier) && i.classifier >= 0.5) {
    out.push({ id: 'classifier', label: 'Model estimate', detail: `A model rated this ${pct(i.classifier)} likely to be AI-written. Models are often wrong — treat as a hint.`, strength: clamp((i.classifier - 0.5) * 2) })
  }
  return combineSignals(out)
}

/** Noisy-OR so several weak signals add up, but one weak one stays weak. Pure. */
export function combineSignals(list: readonly AiSignal[]): AiSignalResult {
  const r = (x: number) => Math.round(x * 100) / 100
  const signals = list.map((s) => ({ ...s, strength: r(s.strength) }))
  const combined = r(1 - signals.reduce((acc, s) => acc * (1 - s.strength * 0.8), 1))
  const level: AiSignalResult['level'] = !signals.length ? 'none' : combined >= 0.75 && signals.length >= 2 ? 'high' : combined >= 0.45 ? 'medium' : 'low'
  return { signals, combined, level }
}
