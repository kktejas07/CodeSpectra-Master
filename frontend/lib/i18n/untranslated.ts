/**
 * Keys whose Hindi / Telugu text is deliberately the same as English: brand
 * and tool names, and tech terms Indian students say in English. The catalog
 * completeness test (tests/i18n-catalog.test.ts) fails on any other key that
 * is missing from hi / te or merely copied from English.
 */
export const INTENTIONALLY_ENGLISH: ReadonlySet<string> = new Set([
  'nav.label:Cloudflare',
  'nav.label:CDN & edge',
  'nav.label:Cron jobs',
  'nav.label:RAG',
  'nav.label:Ai',
  'assessment.qtype:regex_config',
  'assessment.languagesList',
  'learn.category:dsa',
  'learn.category:cloud',
  'learn.category:technologies',
])

/** Keys allowed to be absent from a locale (falls back to English at runtime). Keep empty unless a string truly can't be translated yet. */
export const ALLOWED_MISSING: Record<'hi' | 'te', ReadonlySet<string>> = {
  hi: new Set(),
  te: new Set(),
}
