/**
 * Show an API error in the user's language (pure, client-safe).
 *
 *   const msg = localizeApiError(locale, messages, await res.json().catch(() => null), t('errors.somethingWentWrongRetry'))
 *
 * English: the server's own `error` text, unchanged (so English users see
 * exactly what they saw before codes existed). Hindi / Telugu: the catalog
 * text for `code` (with `params`), else for the message when it is a known
 * catalog message, else the server's English text, else `fallback`.
 * In components use `useApiError()` (lib/i18n/use-api-error.ts).
 */
import { codeForMessage, isApiErrorCode } from '@/lib/api-errors'
import { interpolate, type Messages } from './catalog'
import type { Locale } from './config'

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
  const tryKey = (code: unknown, params?: Record<string, string | number>) => {
    if (!isApiErrorCode(code) || !table?.[code]) return undefined
    const text = interpolate(locale, table[code], params)
    // A placeholder left unfilled (server sent the code without params) → don't show "{seconds}".
    return /\{\w+\}/.test(text) ? undefined : text
  }
  return tryKey(b.code, paramsOf(b.params)) ?? tryKey(codeForMessage(server)) ?? server ?? fallback
}
