/**
 * WhatsApp template language per recipient (pure).
 *
 * Meta only delivers a template in a language it was approved in, under the
 * same template name. The superadmin lists the languages they have approved
 * translations for (Admin → Automations → "Approved template languages",
 * `wa_template_locales`, e.g. "hi,te"); anyone else — and every template
 * before that — gets the base language (`wa_template_language`, e.g. en or
 * en_US). If Meta still says a translation is missing, the send retries once
 * in the base language (lib/automation/whatsapp.ts).
 *
 * The templates to create in Meta Business Manager: docs/i18n/whatsapp-templates.md.
 */
import { toLocale, type Locale } from './config'

/** Meta language codes for our interface languages. */
export const META_LANGUAGE: Record<Exclude<Locale, 'en'>, string> = { hi: 'hi', te: 'te' }

/** "hi, te" / ["hi","te"] → ['hi','te'] (only supported non-English locales). */
export function parseApprovedLocales(raw: unknown): Array<Exclude<Locale, 'en'>> {
  const list = Array.isArray(raw) ? raw : String(raw ?? '').split(/[,\s]+/)
  const out = new Set<Exclude<Locale, 'en'>>()
  for (const v of list) {
    const l = toLocale(v)
    if (l && l !== 'en') out.add(l)
  }
  return [...out]
}

export function whatsappTemplateLanguage(
  locale: Locale | string | null | undefined,
  cfg: { base?: string | null; approved?: unknown },
): { language: string; fallback: string | null } {
  const base = /^[a-z]{2}(_[A-Z]{2})?$/.test(String(cfg.base || '')) ? String(cfg.base) : 'en'
  const l = toLocale(locale)
  if (!l || l === 'en' || !parseApprovedLocales(cfg.approved).includes(l)) return { language: base, fallback: null }
  return { language: META_LANGUAGE[l], fallback: base }
}

/** Meta's "template not available in this language" errors (132001, or the message text). */
export function isMissingTranslationError(error: unknown): boolean {
  return /\b132001\b|translation|does not exist in/i.test(String(error ?? ''))
}
