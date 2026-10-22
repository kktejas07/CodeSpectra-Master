/**
 * WhatsApp transport shared by practice (lib/wa-practice) and guardian reports
 * (lib/guardian): the official Meta Cloud API when configured (Admin → Hiring →
 * screening / WhatsApp settings), otherwise the simulated twin (dev + tests).
 * Templates go out in the recipient's language when that language is approved
 * (Admin → Automations → approved template languages), with one retry in the
 * base language when Meta reports a missing translation.
 * Callers check consent + opt-outs first; nothing here logs phone numbers.
 */
import 'server-only'
import type { Locale } from '@/lib/i18n/config'
import type { SendResult, WhatsAppTransport } from '@/lib/ats/screening/providers/whatsapp'

export async function waTransport(): Promise<WhatsAppTransport> {
  const { getPlatformConfig, whatsappReady } = await import('@/lib/ats/screening/config')
  const { metaTransport, simulatedTransport } = await import('@/lib/ats/screening/providers/whatsapp')
  const cfg = await getPlatformConfig()
  return whatsappReady(cfg) && cfg.whatsapp.phone_number_id ? metaTransport(cfg, cfg.whatsapp.phone_number_id) : simulatedTransport()
}

async function templateLanguage(locale: Locale): Promise<{ language: string; fallback: string | null }> {
  try {
    const { getSystemSettings, configValue } = await import('@/lib/automation/settings')
    const { whatsappTemplateLanguage } = await import('@/lib/i18n/whatsapp-language')
    const cfg = (await getSystemSettings()).config
    return whatsappTemplateLanguage(locale, { base: configValue(cfg, 'wa_template_language'), approved: cfg.wa_template_locales })
  } catch {
    return { language: 'en', fallback: null }
  }
}

/** An approved template (`{{n}}` body params + optional quick-reply payloads) in the recipient's language. */
export async function sendLocalizedTemplate(
  phone: string,
  t: { name: string; locale: Locale; params: string[]; quickReplyPayloads?: string[]; preview: string },
): Promise<SendResult> {
  const tr = await waTransport()
  const lang = await templateLanguage(t.locale)
  const params = t.params.map((p) => String(p ?? '').slice(0, 60))
  let r = await tr.sendTemplate(phone, { name: t.name, language: lang.language, bodyParams: params, quickReplyPayloads: t.quickReplyPayloads }, t.preview)
  if (!r.ok && lang.fallback && lang.fallback !== lang.language) {
    const { isMissingTranslationError } = await import('@/lib/i18n/whatsapp-language')
    if (isMissingTranslationError(r.error)) r = await tr.sendTemplate(phone, { name: t.name, language: lang.fallback, bodyParams: params, quickReplyPayloads: t.quickReplyPayloads }, t.preview)
  }
  return r
}
