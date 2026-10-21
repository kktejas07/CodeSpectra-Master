/**
 * Validation of event batches from the browser (pure, tested). The server
 * trusts nothing: types must be known AND switched on for the test, data is
 * flattened to a few whitelisted numeric / short-string fields, timestamps
 * are clamped to the attempt window, and batches are size-limited.
 */
import { CLIENT_EVENT_TYPES, EVENT_TYPES, type IntegrityEventType, type SignalId } from './types'

export const MAX_BATCH = 50

export interface CleanEvent {
  type: IntegrityEventType
  at: number
  q: string | null
  data: Record<string, number | string | boolean>
}

/** Numeric / short-string fields each type may carry. Anything else is dropped. */
const DATA_FIELDS: Partial<Record<IntegrityEventType, readonly string[]>> = {
  face_none: ['seconds'],
  face_multiple: ['count'],
  looking_away: ['seconds', 'yaw'],
  camera_blocked: ['reason'],
  tab_hidden: ['duration_ms'],
  window_blur: ['duration_ms'],
  copy: ['length'],
  paste: ['length', 'lines'],
  devtools_open: ['dw', 'dh'],
  multi_monitor: ['screens', 'extended'],
  offline: ['duration_ms'],
  session_start: ['screen_w', 'screen_h'],
  typing_summary: ['keys', 'chars', 'deletes', 'mean_ms', 'median_ms', 'sd_ms', 'pauses', 'fast_bursts', 'active_ms', 'first_at', 'last_at', 'code_len'],
  consent_given: ['version'],
}

function cleanData(type: IntegrityEventType, raw: unknown): Record<string, number | string | boolean> {
  const out: Record<string, number | string | boolean> = {}
  const allowed = DATA_FIELDS[type]
  if (!allowed || !raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  const r = raw as Record<string, unknown>
  for (const k of allowed) {
    const v = r[k]
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = Math.max(-1e13, Math.min(1e13, Math.round(v)))
    else if (typeof v === 'boolean') out[k] = v
    else if (typeof v === 'string' && /^[a-z_]{1,32}$/.test(v)) out[k] = v
  }
  return out
}

/**
 * Clean one batch. `enabled` = signals on for this test; `window` = the epoch
 * range the attempt can have events in (server clock). Events outside get
 * the server's receive time instead, flagged `clock_skew`.
 */
export function cleanEventBatch(
  raw: unknown,
  enabled: ReadonlySet<SignalId>,
  window: { from: number; to: number },
): { events: CleanEvent[]; dropped: number } {
  const list = Array.isArray(raw) ? raw.slice(0, MAX_BATCH) : []
  let dropped = Array.isArray(raw) ? Math.max(0, raw.length - MAX_BATCH) : 0
  const events: CleanEvent[] = []
  for (const item of list) {
    if (!item || typeof item !== 'object') { dropped++; continue }
    const e = item as Record<string, unknown>
    const type = e.type
    if (typeof type !== 'string' || !(CLIENT_EVENT_TYPES as string[]).includes(type)) { dropped++; continue }
    const t = type as IntegrityEventType
    const signal = EVENT_TYPES[t]
    if (signal !== null && !enabled.has(signal)) { dropped++; continue }
    const data = cleanData(t, e.data)
    let at = typeof e.at === 'number' && Number.isFinite(e.at) ? Math.round(e.at) : NaN
    if (!(at >= window.from && at <= window.to)) {
      at = window.to
      data.clock_skew = true
    }
    const q = typeof e.q === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(e.q) ? e.q : null
    events.push({ type: t, at, q, data })
  }
  return { events, dropped }
}
