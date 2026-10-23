'use client'

/**
 * Hook: localized text for an API error body.
 *
 *   const apiError = useApiError()
 *   if (!res.ok) toast.error(apiError(await res.json().catch(() => null)))
 *
 * English shows the server's text unchanged; see lib/i18n/api-error.ts.
 *
 * SEO-031 / SEO-055: the `apiErrors` catalogs are in no provider. For Hindi /
 * Telugu they load here as one cached chunk once the page is idle: the user's
 * language plus the English table (to recognise routes that send only an
 * English `error`); until then errors fall back to the generic localized
 * message or the server text. English needs neither.
 */
import { useCallback, useEffect, useState } from 'react'
import type { Locale } from './config'
import type { Messages } from './catalog'
import { useMessages, useT } from './client'
import { localizeApiError } from './api-error'

type Table = Record<string, string>
interface Tables { table: Table; en: Table }
const loaded = new Map<Locale, Tables>()
const pending = new Map<Locale, Promise<Tables>>()
const unwrap = (m: unknown) => ((m as { default?: Table }).default ?? m) as Table

/** Loads one locale's apiErrors catalog with the English one (each locale is its own chunk). */
export function loadApiErrors(locale: Locale): Promise<Tables> {
  const hit = loaded.get(locale)
  if (hit) return Promise.resolve(hit)
  let p = pending.get(locale)
  if (!p) {
    p = Promise.all([
      locale === 'hi' ? import('./messages/hi/apiErrors.json') : import('./messages/te/apiErrors.json'),
      import('./messages/en/apiErrors.json'),
    ])
      .then(([m, e]) => {
        const t = { table: unwrap(m), en: unwrap(e) }
        loaded.set(locale, t)
        return t
      })
      .finally(() => pending.delete(locale))
    pending.set(locale, p)
  }
  return p
}

export function useApiError(): (body: unknown, fallback?: string) => string {
  const { locale, t } = useT()
  const messages = useMessages()
  const missing = locale !== 'en'
  const [extra, setExtra] = useState<Tables | null>(() => (missing ? loaded.get(locale) ?? null : null))

  useEffect(() => {
    if (!missing || (extra && loaded.get(locale) === extra)) return
    const hit = loaded.get(locale)
    if (hit) { setExtra(hit); return }
    let cancelled = false
    const run = () => { void loadApiErrors(locale).then((tb) => { if (!cancelled) setExtra(tb) }).catch(() => {}) }
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void }
    const id = w.requestIdleCallback ? w.requestIdleCallback(run, { timeout: 4000 }) : window.setTimeout(run, 1500)
    return () => {
      cancelled = true
      if (w.cancelIdleCallback) w.cancelIdleCallback(id)
      else window.clearTimeout(id)
    }
  }, [missing, extra, locale])

  return useCallback(
    (body: unknown, fallback?: string) => {
      const all = missing && extra ? ({ ...messages, apiErrors: extra.table, apiErrorsEn: extra.en } as Messages) : messages
      return localizeApiError(locale, all, body, fallback ?? t('errors.somethingWentWrongRetry'))
    },
    [locale, messages, t, missing, extra],
  )
}
