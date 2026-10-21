/**
 * Locale resolution (pure). Order: explicit profile setting → cookie →
 * Accept-Language → English. Unit-tested in tests/i18n-locale.test.ts.
 */
import { DEFAULT_LOCALE, toLocale, type Locale } from './config'

/** Best supported locale from an Accept-Language header (q-values honoured), or null. */
export function matchAcceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) return null
  const ranked = header
    .split(',')
    .slice(0, 20)
    .map((part, i) => {
      const [tag, ...params] = part.trim().split(';')
      const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='))
      const weight = q ? Number(q.slice(2)) : 1
      return { tag: tag.trim(), q: Number.isFinite(weight) ? weight : 0, i }
    })
    .filter((r) => r.tag && r.tag !== '*' && r.q > 0)
    .sort((a, b) => b.q - a.q || a.i - b.i)
  for (const r of ranked) {
    const l = toLocale(r.tag)
    if (l) return l
  }
  return null
}

export function resolveLocale(input: {
  profile?: unknown
  cookie?: unknown
  acceptLanguage?: string | null
}): Locale {
  return toLocale(input.profile) ?? toLocale(input.cookie) ?? matchAcceptLanguage(input.acceptLanguage) ?? DEFAULT_LOCALE
}
