/**
 * Interface languages (pure, client-safe). English is the source language and
 * the fallback for every missing key. URLs carry no locale prefix: the locale
 * comes from the user's profile setting, then the `cs_locale` cookie, then
 * Accept-Language (lib/i18n/negotiate.ts).
 */
export const LOCALES = ['en', 'hi', 'te'] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'en'

/** Cookie read by the server on signed-in / auth / test pages (1 year, Lax, not secret). */
export const LOCALE_COOKIE = 'cs_locale'
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export interface LocaleMeta {
  /** Name in the language itself (what the switcher shows). */
  native: string
  /** English name (screen-reader hint, admin lists). */
  english: string
  /** BCP-47 tag for Intl formatting (Indian region: lakh grouping, INR). */
  intl: string
  /** Speech recognition / synthesis tag (browser Web Speech API, Deepgram). */
  speech: 'en-IN' | 'hi-IN' | 'te-IN'
  /** Open Graph locale. */
  og: string
}

export const LOCALE_META: Record<Locale, LocaleMeta> = {
  en: { native: 'English', english: 'English', intl: 'en-IN', speech: 'en-IN', og: 'en_US' },
  hi: { native: 'हिन्दी', english: 'Hindi', intl: 'hi-IN', speech: 'hi-IN', og: 'hi_IN' },
  te: { native: 'తెలుగు', english: 'Telugu', intl: 'te-IN', speech: 'te-IN', og: 'te_IN' },
}

export function isLocale(v: unknown): v is Locale {
  return typeof v === 'string' && (LOCALES as readonly string[]).includes(v)
}

/** Lenient parse: "hi-IN", "TE", " en " → a supported locale, else null. */
export function toLocale(v: unknown): Locale | null {
  if (typeof v !== 'string') return null
  const base = v.trim().toLowerCase().split(/[-_]/)[0]
  return isLocale(base) ? base : null
}

/** Language name for an AI prompt ("Reply in Hindi"). */
export function localeLanguageName(locale: Locale): string {
  return LOCALE_META[locale].english
}
