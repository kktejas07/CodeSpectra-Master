/**
 * Variable interpolation for workflow steps (pure, client-safe).
 *
 *   "Hi {{trigger.name | default: 'there'}}"      → "Hi Asha"
 *   "{{steps.find_users.count}}"                    → 12   (a lone expression keeps its type)
 *   "{{trigger.tags | join: ', '}}"                 → "dsa, sql"
 *
 * Paths: dot / [index] notation over the run context
 *   { trigger, steps, vars, workflow, run, item, index, …legacy step ids }.
 * Filters: default, upper, lower, trim, json, join, date, number, urlencode,
 * html (escape), truncate. Unknown paths resolve to '' (never throw).
 * Prototype keys (__proto__, constructor, prototype) are never walked.
 */

export type Ctx = Record<string, unknown>

const EXPR = /\{\{\s*([^{}]+?)\s*\}\}/g
const LONE = /^\s*\{\{\s*([^{}]+?)\s*\}\}\s*$/
const BLOCKED = new Set(['__proto__', 'constructor', 'prototype'])

export function getPath(obj: unknown, path: string): unknown {
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.').map((p) => p.trim()).filter(Boolean)
  let cur: unknown = obj
  for (const p of parts) {
    if (BLOCKED.has(p)) return undefined
    if (cur === null || cur === undefined) return undefined
    if (typeof cur !== 'object') return undefined
    if (!Object.prototype.hasOwnProperty.call(cur, p)) return undefined
    cur = (cur as Record<string, unknown>)[p]
  }
  return cur
}

export function escapeHtmlText(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function stringify(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (v instanceof Date) return v.toISOString()
  try {
    return JSON.stringify(v)
  } catch {
    return ''
  }
}

/** Split "a | default: 'x, y' | upper" on pipes outside quotes. */
function splitPipes(expr: string): string[] {
  const out: string[] = []
  let cur = ''
  let q: string | null = null
  for (const ch of expr) {
    if (q) {
      if (ch === q) q = null
      cur += ch
    } else if (ch === '"' || ch === "'") {
      q = ch
      cur += ch
    } else if (ch === '|') {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

function unquote(s: string): string {
  const t = s.trim()
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1)
  return t
}

function applyFilter(value: unknown, filter: string): unknown {
  const colon = filter.indexOf(':')
  const name = (colon >= 0 ? filter.slice(0, colon) : filter).trim().toLowerCase()
  const arg = colon >= 0 ? unquote(filter.slice(colon + 1)) : ''
  switch (name) {
    case 'default':
      return value === undefined || value === null || value === '' ? arg : value
    case 'upper':
      return stringify(value).toUpperCase()
    case 'lower':
      return stringify(value).toLowerCase()
    case 'trim':
      return stringify(value).trim()
    case 'json':
      try {
        return JSON.stringify(value ?? null)
      } catch {
        return ''
      }
    case 'join':
      return Array.isArray(value) ? value.map(stringify).join(arg || ', ') : stringify(value)
    case 'number': {
      const n = Number(value)
      return Number.isFinite(n) ? n : 0
    }
    case 'date': {
      const d = value instanceof Date ? value : new Date(String(value ?? ''))
      if (Number.isNaN(d.getTime())) return stringify(value)
      if (arg === 'date') return d.toISOString().slice(0, 10)
      return d.toUTCString().replace(':00 GMT', ' UTC')
    }
    case 'urlencode':
      return encodeURIComponent(stringify(value))
    case 'html':
      return escapeHtmlText(value)
    case 'truncate': {
      const n = Math.max(1, Math.min(10_000, parseInt(arg || '100', 10) || 100))
      const s = stringify(value)
      return s.length > n ? s.slice(0, n - 1) + '…' : s
    }
    default:
      return value
  }
}

/** Evaluate one `{{ … }}` expression body against the context. */
export function evalExpr(expr: string, ctx: Ctx): unknown {
  const [path, ...filters] = splitPipes(expr)
  let v: unknown
  if (/^(['"]).*\1$/.test(path)) v = unquote(path)
  else if (/^-?\d+(\.\d+)?$/.test(path)) v = Number(path)
  else v = getPath(ctx, path)
  for (const f of filters) v = applyFilter(v, f)
  return v
}

export interface InterpolateOptions {
  /** HTML-escape every substituted value (email bodies). */
  escape?: boolean
  /** Max output length for strings (default 100k). */
  maxLength?: number
}

/**
 * Interpolate a string. A string that is exactly one expression returns the
 * raw value (number, array, object…); mixed text always returns a string.
 */
export function interpolate(input: string, ctx: Ctx, opts: InterpolateOptions = {}): unknown {
  if (typeof input !== 'string' || !input.includes('{{')) return input
  const lone = LONE.exec(input)
  if (lone && !opts.escape) return evalExpr(lone[1], ctx)
  const max = opts.maxLength ?? 100_000
  const out = input.replace(EXPR, (_m, expr: string) => {
    const s = stringify(evalExpr(expr, ctx))
    return opts.escape ? escapeHtmlText(s) : s
  })
  return out.length > max ? out.slice(0, max) : out
}

/** Interpolate to a string, always. */
export function interpolateString(input: unknown, ctx: Ctx, opts: InterpolateOptions = {}): string {
  if (input === null || input === undefined) return ''
  if (typeof input !== 'string') return stringify(input)
  return stringify(interpolate(input, ctx, opts))
}

/**
 * Deep-interpolate a config value (objects, arrays, strings). Keys are never
 * interpolated; depth is bounded so a hostile config can't blow the stack.
 */
export function interpolateDeep(value: unknown, ctx: Ctx, depth = 0): unknown {
  if (depth > 12) return value
  if (typeof value === 'string') return interpolate(value, ctx)
  if (Array.isArray(value)) return value.slice(0, 500).map((v) => interpolateDeep(v, ctx, depth + 1))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (BLOCKED.has(k)) continue
      out[k] = interpolateDeep(v, ctx, depth + 1)
    }
    return out
  }
  return value
}

/** Variable names referenced in a template string (for the builder's checks). */
export function referencedPaths(input: string): string[] {
  const out: string[] = []
  if (typeof input !== 'string') return out
  for (const m of input.matchAll(EXPR)) out.push(splitPipes(m[1])[0])
  return out
}

/** Built-in date variables (also exposed at the top level for older templates: {{ yesterday }}). */
export function builtinVars(now: Date, appUrl: string): Record<string, string> {
  const ago = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString()
  return {
    now: now.toISOString(),
    today: now.toISOString().slice(0, 10),
    yesterday: ago(1),
    sevenDaysAgo: ago(7),
    thirtyDaysAgo: ago(30),
    oneHourAgo: new Date(now.getTime() - 3_600_000).toISOString(),
    inOneHour: new Date(now.getTime() + 3_600_000).toISOString(),
    inOneDay: new Date(now.getTime() + 86_400_000).toISOString(),
    app_url: appUrl.replace(/\/+$/, ''),
  }
}
