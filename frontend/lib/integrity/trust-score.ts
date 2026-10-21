/**
 * Per-attempt trust score (pure, client-safe, tested in tests/integrity.test.ts).
 *
 *   score = 100 − Σ penalty(type), floored at 0
 *
 * For each event type:
 *  - bursts: events of the same type closer than `burstMs` count once
 *    (a flickering detector is one incident, not ten);
 *  - decay: the n-th incident of a type weighs `weight × decay^(n−1)`, so
 *    repeats matter less and less (diminishing returns);
 *  - extras: time away (tab/window) and pasted length add a little on top;
 *  - caps: one type can never take more than its `cap` points.
 *
 * Bands are review hints only — nothing here fails a candidate.
 */
import { EVENT_LABELS, EVENT_TYPES, isEventType, type IntegrityEventType, type SignalId } from './types'

export interface TrustEvent {
  type: string
  /** Epoch ms. */
  at: number
  data?: Record<string, unknown> | null
  q?: string | null
  snapshot_id?: string | null
}

export interface TypeRule {
  /** Points for the first incident. */
  weight: number
  /** Multiplier for each repeat (0–1). */
  decay: number
  /** Most points this type can take in total. */
  cap: number
}

export const DEFAULT_RULES: Partial<Record<IntegrityEventType, TypeRule>> = {
  face_none: { weight: 6, decay: 0.7, cap: 20 },
  face_multiple: { weight: 12, decay: 0.7, cap: 30 },
  camera_blocked: { weight: 10, decay: 0.5, cap: 10 },
  looking_away: { weight: 3, decay: 0.6, cap: 12 },
  tab_hidden: { weight: 5, decay: 0.7, cap: 25 },
  window_blur: { weight: 2, decay: 0.6, cap: 10 },
  fullscreen_exit: { weight: 4, decay: 0.6, cap: 15 },
  paste: { weight: 2, decay: 0.8, cap: 25 },
  copy: { weight: 1, decay: 0.5, cap: 4 },
  devtools_open: { weight: 4, decay: 0.5, cap: 8 },
  multi_monitor: { weight: 6, decay: 0.3, cap: 6 },
  network_change: { weight: 3, decay: 0.5, cap: 9 },
  offline: { weight: 1, decay: 0.5, cap: 4 },
}

export interface TrustOptions {
  rules?: Partial<Record<IntegrityEventType, Partial<TypeRule>>>
  /** Same-type events closer than this merge into one incident. */
  burstMs?: number
  /** Extra point per this many ms away (tab_hidden / window_blur `duration_ms`). */
  awayMsPerPoint?: number
  /** Most extra points one away-incident can add. */
  awayExtraCap?: number
}

export type TrustBand = 'clear' | 'review' | 'flag'

export interface TimelineEntry {
  at: number
  type: string
  signal: SignalId | null
  label: string
  /** Points this event took (0 for merged / capped / system events). */
  penalty: number
  severity: 'info' | 'low' | 'medium' | 'high'
  q: string | null
  data: Record<string, unknown>
  snapshot_id: string | null
}

export interface TrustResult {
  score: number
  band: TrustBand
  penalty: number
  incidents: number
  by_type: Record<string, { count: number; incidents: number; penalty: number; capped: boolean }>
  timeline: TimelineEntry[]
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

/** Extra points for one incident beyond its decayed weight. */
function extraFor(type: string, data: Record<string, unknown>, o: Required<Pick<TrustOptions, 'awayMsPerPoint' | 'awayExtraCap'>>): number {
  if (type === 'tab_hidden' || type === 'window_blur') {
    return Math.min(o.awayExtraCap, Math.floor(Math.max(0, num(data.duration_ms)) / o.awayMsPerPoint))
  }
  if (type === 'paste') {
    const len = Math.max(0, num(data.length))
    return len >= 200 ? 4 : len >= 50 ? 1 : 0
  }
  if (type === 'face_multiple') return Math.min(6, Math.max(0, num(data.count) - 2) * 3)
  return 0
}

export function bandFor(score: number): TrustBand {
  return score >= 80 ? 'clear' : score >= 60 ? 'review' : 'flag'
}

function severityFor(penalty: number, isSystem: boolean): TimelineEntry['severity'] {
  if (isSystem || penalty <= 0) return 'info'
  return penalty >= 8 ? 'high' : penalty >= 3 ? 'medium' : 'low'
}

export function computeTrustScore(events: readonly TrustEvent[], opts: TrustOptions = {}): TrustResult {
  const burstMs = opts.burstMs ?? 10_000
  const extra = { awayMsPerPoint: opts.awayMsPerPoint ?? 30_000, awayExtraCap: opts.awayExtraCap ?? 5 }
  const sorted = [...events].filter((e) => e && typeof e.type === 'string' && Number.isFinite(e.at)).sort((a, b) => a.at - b.at)
  const state = new Map<string, { lastAt: number; incidents: number; penalty: number; count: number; capped: boolean }>()
  const timeline: TimelineEntry[] = []
  let total = 0
  let incidents = 0

  for (const e of sorted) {
    const known = isEventType(e.type)
    const signal = known ? EVENT_TYPES[e.type as IntegrityEventType] : null
    const base = known ? DEFAULT_RULES[e.type as IntegrityEventType] : undefined
    const rule: TypeRule | undefined = base || opts.rules?.[e.type as IntegrityEventType]
      ? { ...(base ?? { weight: 0, decay: 0.5, cap: 0 }), ...(opts.rules?.[e.type as IntegrityEventType] ?? {}) }
      : undefined
    const data = (e.data && typeof e.data === 'object' ? e.data : {}) as Record<string, unknown>
    const st = state.get(e.type) ?? { lastAt: -Infinity, incidents: 0, penalty: 0, count: 0, capped: false }
    st.count++
    let p = 0
    if (rule && rule.weight > 0) {
      const merged = e.at - st.lastAt < burstMs
      st.lastAt = e.at
      if (!merged) {
        st.incidents++
        incidents++
        const decayed = rule.weight * Math.pow(Math.min(1, Math.max(0, rule.decay)), st.incidents - 1)
        const raw = decayed + extraFor(e.type, data, extra)
        const room = Math.max(0, rule.cap - st.penalty)
        p = Math.min(raw, room)
        if (raw > room) st.capped = true
        st.penalty += p
        total += p
      }
    }
    state.set(e.type, st)
    const rounded = Math.round(p * 10) / 10
    timeline.push({
      at: e.at,
      type: e.type,
      signal,
      label: known ? EVENT_LABELS[e.type as IntegrityEventType] : e.type,
      penalty: rounded,
      severity: severityFor(rounded, !rule || rule.weight <= 0),
      q: typeof e.q === 'string' ? e.q : null,
      data,
      snapshot_id: typeof e.snapshot_id === 'string' ? e.snapshot_id : null,
    })
  }

  const penalty = Math.min(100, total)
  const score = Math.max(0, Math.round(100 - penalty))
  const by_type: TrustResult['by_type'] = {}
  for (const [type, st] of state) by_type[type] = { count: st.count, incidents: st.incidents, penalty: Math.round(st.penalty * 10) / 10, capped: st.capped }
  return { score, band: bandFor(score), penalty: Math.round(penalty * 10) / 10, incidents, by_type, timeline }
}
