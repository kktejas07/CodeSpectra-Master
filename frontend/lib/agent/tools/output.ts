/**
 * Keep model-facing tool output small (contract: < ~6KB). Long strings are
 * clipped and long arrays shortened until the JSON fits; `_truncated` tells
 * the model to page or narrow the query.
 */

export const MAX_TOOL_BYTES = 6000

export function clip(s: unknown, max = 200): string {
  const t = typeof s === 'string' ? s : s === null || s === undefined ? '' : String(s)
  const one = t.replace(/\s+/g, ' ').trim()
  return one.length > max ? `${one.slice(0, max - 1)}…` : one
}

function shrink(v: unknown, maxStr: number, maxArr: number): unknown {
  if (typeof v === 'string') return v.length > maxStr ? `${v.slice(0, maxStr - 1)}…` : v
  if (Array.isArray(v)) {
    const head = v.slice(0, maxArr).map((x) => shrink(x, maxStr, maxArr))
    return v.length > maxArr ? [...head, `… ${v.length - maxArr} more`] : head
  }
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (x === undefined) continue
      out[k] = shrink(x, maxStr, maxArr)
    }
    return out
  }
  return v
}

const size = (v: unknown) => {
  try { return JSON.stringify(v)?.length ?? 0 } catch { return Infinity }
}

/** `data` shrunk to fit `maxBytes` of JSON. */
export function fitForModel<T>(data: T, maxBytes = MAX_TOOL_BYTES): T | Record<string, unknown> {
  if (size(data) <= maxBytes) return data
  let maxStr = 400
  let maxArr = 40
  for (let i = 0; i < 8; i++) {
    const out = shrink(data, maxStr, maxArr)
    if (size(out) <= maxBytes - 40) {
      return out && typeof out === 'object' && !Array.isArray(out)
        ? { ...(out as Record<string, unknown>), _truncated: true }
        : { items: out, _truncated: true }
    }
    maxStr = Math.max(60, Math.floor(maxStr * 0.6))
    maxArr = Math.max(3, Math.floor(maxArr * 0.6))
  }
  return { _truncated: true, note: 'Result too large — narrow the query or use a smaller page size.' }
}
