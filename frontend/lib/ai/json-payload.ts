/**
 * Getting the model's object out of a completion.
 *
 * Three separate pipelines hit this the same way (2026-10-29):
 *   - Learn: `res.json` was `{}` and the real JSON sat in `text` → 12 failed runs
 *   - Arena: the payload was the transport envelope
 *            `{ ok, raw, json, usage, provider, model }`, one level down
 *   - Challenges: same envelope, plus model wrappers
 *
 * So there is one implementation, and it walks down instead of guessing a
 * single level. No `server-only` here: backfill scripts load it under tsx.
 */

export function parseJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = (fenced ? fenced[1] : text).trim()
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start === -1 || end <= start) throw new Error('No JSON object in model output')
  return JSON.parse(body.slice(start, end + 1))
}

/** Keys that carry payload inside a transport envelope or a model wrapper. */
const PAYLOAD_KEYS = ['json', 'data', 'challenge', 'problem', 'result', 'payload', 'output', 'content', 'response', 'post', 'article', 'message', 'text']

/**
 * Recursively find the payload object. A payload is recognisable by having the
 * keys the caller needs — pass `has` to describe them (default: `title`).
 * Returns null when nothing matches, so callers fail loudly instead of
 * validating the envelope.
 */
export function unwrapPayloadJson(
  raw: unknown,
  has: (o: Record<string, unknown>) => boolean = (o) => typeof o.title === 'string',
  depth = 0,
): Record<string, unknown> | null {
  if (depth > 6) return null
  if (typeof raw === 'string') {
    if (!raw.trim()) return null
    try { return unwrapPayloadJson(JSON.parse(raw), has, depth + 1) } catch { return null }
  }
  if (!raw || typeof raw !== 'object') return null
  const obj = Array.isArray(raw) ? raw[0] : raw
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null

  const rec = obj as Record<string, unknown>
  if (has(rec)) return rec

  for (const key of PAYLOAD_KEYS) {
    if (!(key in rec)) continue
    const inner = unwrapPayloadJson(rec[key], has, depth + 1)
    if (inner) return inner
  }

  const keys = Object.keys(rec)
  if (keys.length === 1) return unwrapPayloadJson(rec[keys[0]], has, depth + 1)
  return null
}

/** The JSON from a completed call: prefer the parsed field, then raw/text. */
export function jsonFromCompletion(res: { json?: unknown; raw?: string; text?: string }): unknown {
  if (res.json && typeof res.json === 'object' && Object.keys(res.json as object).length > 0) return res.json
  for (const candidate of [res.raw, res.text]) {
    if (!candidate) continue
    try { return parseJsonObject(candidate) } catch { /* try the next */ }
  }
  throw new Error('No JSON object in model output')
}

/** Envelope + wrappers handled; returns the payload or null. */
export function postPayload(
  res: { json?: unknown; raw?: string; text?: string },
  has?: (o: Record<string, unknown>) => boolean,
): Record<string, unknown> | null {
  let json: unknown
  try { json = jsonFromCompletion(res) } catch { return null }
  return unwrapPayloadJson(json, has)
}
