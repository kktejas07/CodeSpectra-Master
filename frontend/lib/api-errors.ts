/**
 * Stable error codes for API responses (pure, client-safe).
 *
 * Every error body keeps its English `error` string (older clients and the
 * English UI show it unchanged) and adds `code` (+ `params` for messages with
 * numbers or names), so the UI can show the message in the user's language:
 *
 *   { "error": "Too many attempts. Try again in 30s.", "code": "auth_too_many_attempts", "params": { "seconds": 30 } }
 *
 * The codes and their English text live in lib/i18n/messages/en/apiErrors.json
 * (Hindi / Telugu next to it). A body without a code still gets one when its
 * `error` is exactly a catalog message without placeholders (codeForMessage),
 * so shared helpers (route-auth results, domain errors) map without touching
 * every throw site. Client side: lib/i18n/api-error.ts.
 */
import en from '@/lib/i18n/messages/en/apiErrors.json'

export type ApiErrorCode = keyof typeof en
export type ApiErrorParams = Record<string, string | number>
export interface ApiErrorBody {
  error: string
  code?: ApiErrorCode | string
  params?: ApiErrorParams
}

const EN = en as Record<string, string>

const norm = (s: string) => s.trim().replace(/[’']/g, "'").replace(/\.$/, '').toLowerCase()

const BY_MESSAGE: ReadonlyMap<string, ApiErrorCode> = (() => {
  const m = new Map<string, ApiErrorCode>()
  for (const [k, v] of Object.entries(EN)) {
    if (/\{\w+\}/.test(v)) continue
    const n = norm(v)
    if (!m.has(n)) m.set(n, k as ApiErrorCode)
  }
  return m
})()

export function isApiErrorCode(v: unknown): v is ApiErrorCode {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(EN, v)
}

/** Code for an exact (case / final period / apostrophe-insensitive) catalog message without placeholders. */
export function codeForMessage(message: unknown): ApiErrorCode | undefined {
  return typeof message === 'string' && message ? BY_MESSAGE.get(norm(message)) : undefined
}

/** English text for a code (placeholders filled), e.g. for a new route's `error`. */
export function englishApiError(code: ApiErrorCode, params?: ApiErrorParams): string {
  const tpl = EN[code] ?? code
  return params ? tpl.replace(/\{(\w+)\}/g, (m, k: string) => (params[k] === undefined ? m : String(params[k]))) : tpl
}

/**
 * Error body: `error` stays as given (English); `code` is the explicit one or
 * inferred from the message; `params` only when there are any.
 */
export function apiErrorBody(error: string, code?: ApiErrorCode | string | null, params?: ApiErrorParams | null): ApiErrorBody {
  const c = code || codeForMessage(error)
  return { error, ...(c ? { code: c } : {}), ...(params && Object.keys(params).length ? { params } : {}) }
}

/** Body for a code, English rendered from the catalog. */
export function apiErrorFor(code: ApiErrorCode, params?: ApiErrorParams): ApiErrorBody {
  return apiErrorBody(englishApiError(code, params), code, params)
}

/** Add an inferred `code` to an existing `{ error }` body (no-op when it has one or isn't an error body). */
export function withErrorCode<T extends Record<string, unknown>>(body: T): T & { code?: string } {
  if (!body || typeof body.error !== 'string' || body.code) return body
  const c = codeForMessage(body.error)
  return c ? { ...body, code: c } : body
}
