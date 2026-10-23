'use client'

/**
 * Hook: localized text for an API error body.
 *
 *   const apiError = useApiError()
 *   if (!res.ok) toast.error(apiError(await res.json().catch(() => null)))
 *
 * English shows the server's text unchanged; see lib/i18n/api-error.ts.
 *
 * SEO-031: the Hindi / Telugu `apiErrors` catalog (460 keys, ~62 KB) is not
 * in the public pages' provider. When the active catalogs lack it, it loads
 * here as its own cached chunk once the page is idle; until then errors fall
 * back to the generic localized message or the server text.
 */
import { useCallback, useEffect, useState } from 'react'
import type { Locale } from './config'
import type { Messages } from './catalog'
import { useMessages, useT } from './client'
import { localizeApiError } from './api-error'

type Table = Record<string, string>
const loaded = new Map<Locale, Table>()
const pending = new Map<Locale, Promise<Table>>()

/** Loads one locale's apiErrors catalog (each locale is its own chunk). */
export function loadApiErrors(locale: Locale): Promise<Table> {
  const hit = loaded.get(locale)
  if (hit) return Promise.resolve(hit)
  let p = pending.get(locale)
  if (!p) {
    p = (locale === 'hi' ? import('./messages/hi/apiErrors.json') : import('./messages/te/apiErrors.json'))
      .then((m) => {
        const table = ((m as { default?: Table }).default ?? m) as Table
        loaded.set(locale, table)
        return table
      })
      .finally(() => pending.delete(locale))
    pending.set(locale, p)
  }
  return p
}

export function useApiError(): (body: unknown, fallback?: string) => string {
  const { locale, t } = useT()
  const messages = useMessages()
  const missing = locale !== 'en' && !(messages as Record<string, unknown>).apiErrors
  const [extra, setExtra] = useState<Table | null>(() => (missing ? loaded.get(locale) ?? null : null))

  useEffect(() => {
    if (!missing || extra) return
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
      const all = missing && extra ? ({ ...messages, apiErrors: extra } as Messages) : messages
      return localizeApiError(locale, all, body, fallback ?? t('errors.somethingWentWrongRetry'))
    },
    [locale, messages, t, missing, extra],
  )
}
