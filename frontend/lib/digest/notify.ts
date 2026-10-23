/**
 * Daily digest to subscribers of topic 'digest' (server only).
 *
 *  - Opt-in only: email needs double opt-in (active), WhatsApp needs consent +
 *    YES (active). Each message is in the recipient's language (their account
 *    language, else English).
 *  - Idempotent per (subscriber, date, channel) through the delivery ledger
 *    (type 'daily_digest', ref = date). Emails carry manage + one-click
 *    unsubscribe (subscriptions shell); WhatsApp ends with "Reply STOP",
 *    respects quiet hours and the 24 h window (approved template outside it —
 *    the tech-news digest template, if one is set — else skipped).
 */
import 'server-only'
import { getAppOrigin } from '@/lib/app-origin'
import { digestEmailHtml, digestPageUrl, digestWhatsAppText, renderDigest, type DigestTemplates } from './templates'
import type { DigestDoc, DigestLocale } from './types'

export interface NotifyReport { sent: number; failed: number; skipped: number; duplicate: number; deferred: number }

const SUBJECT: Record<DigestLocale, (n: number) => string> = {
  en: (n) => `Today’s digest: ${n} hackathons, contests and tech news picks`,
  hi: (n) => `आज का डाइजेस्ट: ${n} hackathons, contests और टेक खबरें`,
  te: (n) => `ఈ రోజు డైజెస్ట్: ${n} hackathons, contests, టెక్ వార్తలు`,
}
const REASON: Record<DigestLocale, string> = {
  en: 'You get this daily email because you subscribed to the CodeSpectra daily digest.',
  hi: 'आपने CodeSpectra डेली डाइजेस्ट सब्सक्राइब किया है, इसलिए आपको यह ईमेल मिलता है।',
  te: 'మీరు CodeSpectra డైలీ డైజెస్ట్‌కి సబ్‌స్క్రైబ్ చేసినందున ఈ ఈమెయిల్ వస్తుంది.',
}

export async function notifyDigestSubscribers(doc: DigestDoc, templates: DigestTemplates, now = new Date()): Promise<NotifyReport> {
  const rep: NotifyReport = { sent: 0, failed: 0, skipped: 0, duplicate: 0, deferred: 0 }
  if (doc.status !== 'published' || !doc.items.length) return rep
  const [{ recipientsFor, sendSubscriberEmail, sendSubscriberWhatsApp, getSubscriptionSettings }, { localeForUser, localeForEmail }] = await Promise.all([import('@/lib/subscriptions'), import('@/lib/i18n/recipient')])
  const origin = getAppOrigin()
  const rendered = new Map<DigestLocale, ReturnType<typeof renderDigest>>()
  const view = (l: DigestLocale) => rendered.get(l) ?? rendered.set(l, renderDigest(doc, l, templates)).get(l)!
  const langOf = async (s: { user_id: string | null; email: string | null }): Promise<DigestLocale> => {
    const l = s.user_id ? await localeForUser(s.user_id) : await localeForEmail(s.email)
    return l === 'hi' || l === 'te' ? l : 'en'
  }
  for (const sub of await recipientsFor('digest', 'email')) {
    const lang = await langOf(sub)
    const r = view(lang)
    rep[await sendSubscriberEmail(sub, {
      type: 'daily_digest', ref: doc.date, topic: 'digest',
      subject: SUBJECT[lang](r.count), heading: r.heading,
      preheader: r.sections.flatMap((s) => s.items).slice(0, 3).map((i) => i.title).join(' · '),
      bodyHtml: digestEmailHtml(r, origin), reason: REASON[lang],
    })]++
  }
  let template: { name: string; language: string } | null = null
  try {
    const [{ getSignalSettings }] = await Promise.all([import('@/lib/signals/store')])
    const name = (await getSignalSettings()).whatsapp_template_digest
    if (name) template = { name, language: (await getSubscriptionSettings()).whatsapp_template_language }
  } catch { template = null }
  for (const sub of await recipientsFor('digest', 'whatsapp')) {
    const lang = await langOf(sub)
    const r = view(lang)
    rep[await sendSubscriberWhatsApp(sub, {
      type: 'daily_digest', ref: doc.date, topic: 'digest', now,
      text: digestWhatsAppText(r, origin),
      template: template ? { ...template, params: [r.sections.flatMap((s) => s.items).slice(0, 3).map((i) => i.title).join(' · ').slice(0, 900), digestPageUrl(origin, doc.date, lang)] } : null,
    })]++
  }
  return rep
}
