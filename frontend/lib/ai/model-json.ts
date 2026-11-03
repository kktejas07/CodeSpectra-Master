/**
 * Reading the model's JSON out of a backend completion (pure, no Mongo).
 *
 * `/internal/ai/complete` answers with an envelope:
 *   { ok: true, raw: '{"questions":[…] }', text: '…' }
 * The payload the prompt asked for lives inside `raw` as text. Code that read
 * `res.json` first got the envelope, so `parsePlan` saw no `questions` and
 * every mock interview answered 503 "The interviewer is not available right
 * now" (2026-11-03). `lib/ai/provider-fallback` now returns the payload in
 * `json`; `modelJson` also accepts the envelope so older call sites stay safe.
 */

export function extractJson(raw: string): Record<string, unknown> | null {
  if (!raw) return null
  try {
    const trimmed = raw.trim()
    const first = trimmed.charCodeAt(0)
    if (first === 123 || first === 91) return JSON.parse(trimmed)
    const match = trimmed.match(/\{[\s\S]*\}/)
    if (match) return JSON.parse(match[0])
  } catch {
    return null
  }
  return null
}

/** The model's JSON payload, never the backend envelope. */
export function modelJson(res: { json?: unknown; raw?: string; text?: string }): Record<string, unknown> | null {
  const fromText = extractJson(res.raw || res.text || '')
  if (fromText) return fromText
  const j = res.json
  if (j && typeof j === 'object' && !Array.isArray(j)) {
    const o = j as Record<string, unknown>
    // Not the envelope — this IS the model payload.
    if (!('ok' in o) && !('raw' in o)) return o
  }
  return null
}
