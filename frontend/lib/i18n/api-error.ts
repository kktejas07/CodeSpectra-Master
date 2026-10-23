/**
 * Show an API error in the user's language (pure, client-safe).
 *
 *   const msg = localizeApiError(locale, messages, await res.json().catch(() => null), t('errors.somethingWentWrongRetry'))
 *
 * English: the server's own `error` text, unchanged (so English users see
 * exactly what they saw before codes existed). Hindi / Telugu: the catalog
 * text for `code` (with `params`), else for the message when it is a known
 * catalog message (needs `messages.apiErrorsEn`), else the server's English
 * text, else `fallback`.
 * In components use `useApiError()` (lib/i18n/use-api-error.ts).
 */
import { interpolate, type Messages } from './catalog'
import type { Locale } from './config'

/*
 * SEO-055: no static import of the English catalog (lib/api-errors.ts) — with
 * a code for (almost) every route error it is ~90 KB, too much for every page.
 * The client loads the English table (for message → code) next to the user's
 * language in one lazy chunk (useApiError); callers pass it as
 * `messages.apiErrorsEn`. Without it, only explicit codes translate.
 */
type Table = Record<string, string>
const norm = (s: string) => s.trim().replace(/[’']/g, "'").replace(/\.$/, '').toLowerCase()
const indexes = new WeakMap<Table, Map<string, string>>()

/** Message → code for placeholder-free English messages (same rules as lib/api-errors codeForMessage). */
function codeIndex(en: Table): Map<string, string> {
  let m = indexes.get(en)
  if (!m) {
    m = new Map()
    for (const [k, v] of Object.entries(en)) {
      if (/\{\w+\}/.test(v)) continue
      const n = norm(v)
      if (!m.has(n)) m.set(n, k)
    }
    indexes.set(en, m)
  }
  return m
}

export interface ApiErrorLike {
  error?: unknown
  message?: unknown
  code?: unknown
  params?: unknown
}

function paramsOf(v: unknown): Record<string, string | number> | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined
  const out: Record<string, string | number> = {}
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) if (typeof x === 'string' || typeof x === 'number') out[k] = x
  return out
}

/** The server's English message from a JSON error body (`error`, or `message` as some routes use). */
export function serverErrorText(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return typeof body === 'string' && body ? body : undefined
  const b = body as ApiErrorLike
  if (typeof b.error === 'string' && b.error) return b.error
  if (typeof b.message === 'string' && b.message) return b.message
  return undefined
}

export function localizeApiError(locale: Locale, messages: Messages | undefined, body: unknown, fallback: string): string {
  const server = serverErrorText(body)
  if (locale === 'en') return server ?? fallback
  const b = (body && typeof body === 'object' ? body : {}) as ApiErrorLike
  const table = messages?.apiErrors
  const en = (messages as Record<string, Table | undefined> | undefined)?.apiErrorsEn
  const tryKey = (code: unknown, params?: Record<string, string | number>) => {
    if (typeof code !== 'string' || !table || !Object.prototype.hasOwnProperty.call(table, code) || !table[code]) return undefined
    const text = interpolate(locale, table[code], params)
    // A placeholder left unfilled (server sent the code without params) → don't show "{seconds}".
    return /\{\w+\}/.test(text) ? undefined : text
  }
  return tryKey(b.code, paramsOf(b.params)) ?? tryKey(server && en ? codeIndex(en).get(norm(server)) : undefined) ?? server ?? fallback
}
