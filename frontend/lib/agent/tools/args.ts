/**
 * Argument parsing for agent tools (pure). Every helper throws ToolInputError
 * with a message the model can act on ("`limit` must be a whole number from 1
 * to 50"). Tools never trust ids of tenants or users from here — those come
 * from the caller.
 */
import { ToolInputError } from '@/lib/agent/contract'

export type Raw = Record<string, unknown>

const ID_RE = /^[A-Za-z0-9_-]{1,128}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** The raw args object; rejects keys the tool doesn't know (typos surface early). */
export function argsObject(raw: unknown, allowed: readonly string[]): Raw {
  if (raw === undefined || raw === null) raw = {}
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw) } catch { throw new ToolInputError('Arguments must be a JSON object.') }
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new ToolInputError('Arguments must be a JSON object.')
  const r = raw as Raw
  const unknown = Object.keys(r).filter((k) => !allowed.includes(k))
  if (unknown.length) {
    throw new ToolInputError(`Unknown argument${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}. Allowed: ${allowed.filter((k) => !k.startsWith('_')).join(', ') || 'none'}.`)
  }
  return r
}

const present = (v: unknown) => v !== undefined && v !== null && v !== ''

export function optString(r: Raw, key: string, opts: { max?: number; min?: number } = {}): string | undefined {
  const v = r[key]
  if (!present(v)) return undefined
  if (typeof v !== 'string' && typeof v !== 'number') throw new ToolInputError(`\`${key}\` must be text.`)
  const s = String(v).trim()
  if (!s) return undefined
  const max = opts.max ?? 500
  if (s.length > max) throw new ToolInputError(`\`${key}\` is too long (max ${max} characters).`)
  if (opts.min && s.length < opts.min) throw new ToolInputError(`\`${key}\` is too short (at least ${opts.min} characters).`)
  return s
}

export function reqString(r: Raw, key: string, opts: { max?: number; min?: number } = {}): string {
  const s = optString(r, key, opts)
  if (s === undefined) throw new ToolInputError(`\`${key}\` is required.`)
  return s
}

export function optId(r: Raw, key: string): string | undefined {
  const s = optString(r, key, { max: 128 })
  if (s === undefined) return undefined
  if (!ID_RE.test(s)) throw new ToolInputError(`\`${key}\` doesn't look like an id (letters, digits, - and _ only).`)
  return s
}

export function reqId(r: Raw, key: string): string {
  const s = optId(r, key)
  if (s === undefined) throw new ToolInputError(`\`${key}\` is required.`)
  return s
}

export function optInt(r: Raw, key: string, min: number, max: number): number | undefined {
  const v = r[key]
  if (!present(v)) return undefined
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isInteger(n) || n < min || n > max) throw new ToolInputError(`\`${key}\` must be a whole number from ${min} to ${max}.`)
  return n
}

export function reqInt(r: Raw, key: string, min: number, max: number): number {
  const n = optInt(r, key, min, max)
  if (n === undefined) throw new ToolInputError(`\`${key}\` is required (a whole number from ${min} to ${max}).`)
  return n
}

export function optNumber(r: Raw, key: string, min: number, max: number): number | undefined {
  const v = r[key]
  if (!present(v)) return undefined
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n) || n < min || n > max) throw new ToolInputError(`\`${key}\` must be a number from ${min} to ${max}.`)
  return n
}

export function optBool(r: Raw, key: string): boolean | undefined {
  const v = r[key]
  if (v === undefined || v === null) return undefined
  if (typeof v === 'boolean') return v
  if (v === 'true') return true
  if (v === 'false') return false
  throw new ToolInputError(`\`${key}\` must be true or false.`)
}

export function optEnum<T extends string>(r: Raw, key: string, values: readonly T[]): T | undefined {
  const v = r[key]
  if (!present(v)) return undefined
  const s = String(v).trim().toLowerCase()
  const hit = values.find((x) => x.toLowerCase() === s)
  if (!hit) throw new ToolInputError(`\`${key}\` must be one of: ${values.join(', ')}.`)
  return hit
}

export function optStringArray(r: Raw, key: string, opts: { maxItems?: number; maxLen?: number } = {}): string[] | undefined {
  const v = r[key]
  if (!present(v)) return undefined
  const arr = typeof v === 'string' ? v.split(',') : v
  if (!Array.isArray(arr)) throw new ToolInputError(`\`${key}\` must be a list of text values.`)
  const maxItems = opts.maxItems ?? 50
  const maxLen = opts.maxLen ?? 200
  if (arr.length > maxItems) throw new ToolInputError(`\`${key}\` can hold at most ${maxItems} items.`)
  const out: string[] = []
  for (const x of arr) {
    if (typeof x !== 'string' && typeof x !== 'number') throw new ToolInputError(`\`${key}\` must be a list of text values.`)
    const s = String(x).trim()
    if (!s) continue
    if (s.length > maxLen) throw new ToolInputError(`An item in \`${key}\` is too long (max ${maxLen} characters).`)
    if (!out.includes(s)) out.push(s)
  }
  return out
}

export function optIdArray(r: Raw, key: string, maxItems = 200): string[] | undefined {
  const arr = optStringArray(r, key, { maxItems, maxLen: 128 })
  if (!arr) return undefined
  const bad = arr.find((s) => !ID_RE.test(s))
  if (bad) throw new ToolInputError(`\`${key}\` has an invalid id: "${bad.slice(0, 40)}".`)
  return arr
}

/** ISO date/time (or anything Date parses). Returns ISO string. */
export function optDate(r: Raw, key: string): string | undefined {
  const v = r[key]
  if (!present(v)) return undefined
  if (typeof v !== 'string' && typeof v !== 'number') throw new ToolInputError(`\`${key}\` must be a date, e.g. 2026-11-01T09:00:00Z.`)
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) throw new ToolInputError(`\`${key}\` is not a valid date (use ISO 8601, e.g. 2026-11-01T09:00:00Z).`)
  return d.toISOString()
}

export function isEmail(s: string): boolean {
  return s.length <= 254 && EMAIL_RE.test(s)
}

export function optObject(r: Raw, key: string): Raw | undefined {
  const v = r[key]
  if (v === undefined || v === null) return undefined
  if (typeof v !== 'object' || Array.isArray(v)) throw new ToolInputError(`\`${key}\` must be an object.`)
  return v as Raw
}

export function optObjectArray(r: Raw, key: string, maxItems: number): Raw[] | undefined {
  const v = r[key]
  if (v === undefined || v === null) return undefined
  if (!Array.isArray(v)) throw new ToolInputError(`\`${key}\` must be a list.`)
  if (v.length > maxItems) throw new ToolInputError(`\`${key}\` can hold at most ${maxItems} items.`)
  return v.map((x, i) => {
    if (!x || typeof x !== 'object' || Array.isArray(x)) throw new ToolInputError(`\`${key}[${i}]\` must be an object.`)
    return x as Raw
  })
}

/** Page / limit pair with sane caps. */
export function paging(r: Raw, defLimit = 20, maxLimit = 50): { page: number; limit: number } {
  return { page: optInt(r, 'page', 1, 1000) ?? 1, limit: optInt(r, 'limit', 1, maxLimit) ?? defLimit }
}

export function reqDateArg(r: Raw, key: string): string {
  const d = optDate(r, key)
  if (d === undefined) throw new ToolInputError(`\`${key}\` is required (ISO 8601, e.g. 2026-11-01T09:00:00Z).`)
  return d
}
