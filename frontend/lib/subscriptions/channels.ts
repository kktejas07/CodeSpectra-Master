/**
 * Channel senders for subscribers. Every send goes through the delivery ledger
 * (idempotent per subscriber/type/ref/channel), every email carries a manage /
 * unsubscribe link, and WhatsApp respects consent, quiet hours and Meta's
 * 24-hour session rule (free text inside the window, approved template outside).
 */
import { escapeHtml } from '@/lib/safe-html'
import { getAppOrigin } from '@/lib/app-origin'
import { claimDelivery, finishDelivery } from './deliveries'
import { inQuietHours, inWhatsAppSession } from './filters'
import { getSubscriptionSettings } from './settings'
import { linkToken } from './tokens'
import type { DeliveryType, SubscriberDoc, Topic } from './types'
import { outboundT } from '@/lib/i18n/outbound'
import { toLocale } from '@/lib/i18n/config'

export type SendOutcome = 'sent' | 'failed' | 'duplicate' | 'skipped' | 'deferred'

/**
 * Shared per-person budget class of a subscriber message: confirmations are service mail; everything
 * else (alerts, reminders, digests) is a schedule the person subscribed to — 'subscribed': de-duplicated,
 * never capped or counted (AUTO-108 / CORE-050). Quiet hours, the 24 h window and unsubscribes still apply here.
 */
export function subscriberMessageClass(type: DeliveryType): 'transactional' | 'subscribed' {
  if (type === 'confirm' || type === 'optin' || type === 'test' || type === 'keyword') return 'transactional'
  return 'subscribed'
}

/**
 * Admit one subscriber message to the shared budget. Subscriber messages are never capped or counted
 * ('subscribed' / 'transactional'), so the email and the WhatsApp of one digest can't use up two slots
 * (CORE-051); de-duplication per (subscriber, type, ref, channel) is the delivery ledger's job
 * (claimDelivery below). null = held.
 */
async function admitSubscriber(sub: SubscriberDoc, type: DeliveryType, channel: 'email' | 'whatsapp'): Promise<{ commit: () => Promise<void>; release: () => Promise<void> } | null> {
  const { admitMessage } = await import('@/lib/messaging/budget')
  const a = await admitMessage({ userId: sub.user_id, email: sub.email }, { class: subscriberMessageClass(type), source: `subscriptions:${type}`, channel }).catch(() => ({ ok: true as const, commit: async () => {}, release: async () => {} }))
  return a.ok ? a : null
}

export async function manageUrl(sub: Pick<SubscriberDoc, 'id' | 'token_nonce'> & { locale?: SubscriberDoc['locale'] }, extra: Record<string, string> = {}): Promise<string> {
  const t = await linkToken(sub.id, sub.token_nonce, 'manage')
  // SEO-058: the preferences page opens in the subscriber's language.
  const lang = toLocale(sub.locale)
  const q = new URLSearchParams({ s: sub.id, t, ...(lang && lang !== 'en' ? { lang } : {}), ...extra })
  return `${getAppOrigin()}/subscriptions/manage?${q.toString()}`
}

/** Email shell (royal blue, inline styles) with the required unsubscribe footer. */
export function renderEmailShell(p: { heading: string; bodyHtml: string; preheader?: string; manageUrl: string; unsubscribeUrl: string; reason: string; locale?: string | null }): string {
  // SEO-054: footer links in the subscriber's language (English unchanged).
  const lang = toLocale(p.locale) ?? 'en'
  const et = outboundT('email', lang)
  const pre = p.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(p.preheader)}</div>` : ''
  return `<!doctype html><html lang="${lang}"><body style="margin:0;background:#f3f5fb">${pre}
<div style="padding:32px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f1729">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e3e7f1;border-radius:16px;overflow:hidden">
    <tr><td style="background:#2F5BE7;padding:20px 28px;color:#ffffff;font-size:18px;font-weight:700">CodeSpectra</td></tr>
    <tr><td style="padding:28px">
      <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:#0f1729">${escapeHtml(p.heading)}</h1>
      ${p.bodyHtml}
    </td></tr>
    <tr><td style="padding:18px 28px;border-top:1px solid #e3e7f1;font-size:12px;line-height:1.6;color:#4b5563">
      ${escapeHtml(p.reason)}<br/>
      <a href="${escapeHtml(p.manageUrl)}" style="color:#2F5BE7">${escapeHtml(et('sub.shell.manage'))}</a> ·
      <a href="${escapeHtml(p.unsubscribeUrl)}" style="color:#2F5BE7">${escapeHtml(et('sub.shell.unsubscribe'))}</a>
    </td></tr>
  </table>
</div></body></html>`
}

interface EmailJob {
  type: DeliveryType
  ref: string
  topic: Topic | null
  subject: string
  heading: string
  bodyHtml: string
  preheader?: string
  reason: string
  /** Confirmation emails go to pending addresses; everything else needs an active one. */
  allowPending?: boolean
  /** false = no ledger (test sends). */
  idempotent?: boolean
}

export async function sendSubscriberEmail(sub: SubscriberDoc, job: EmailJob): Promise<SendOutcome> {
  if (!sub.email) return 'skipped'
  if (!(sub.email_status === 'active' || (job.allowPending && sub.email_status === 'pending'))) return 'skipped'
  const admit = await admitSubscriber(sub, job.type, 'email')
  if (!admit) return 'duplicate'
  const key = job.idempotent === false ? null : await claimDelivery({ subscriberId: sub.id, type: job.type, ref: job.ref, channel: 'email', topic: job.topic })
  if (job.idempotent !== false && !key) { await admit.release(); return 'duplicate' }
  const manage = await manageUrl(sub)
  const unsub = await manageUrl(sub, { action: 'unsubscribe', scope: job.topic ? `topic:${job.topic}` : 'email' })
  const html = renderEmailShell({ heading: job.heading, bodyHtml: job.bodyHtml, preheader: job.preheader, manageUrl: manage, unsubscribeUrl: unsub, reason: job.reason, locale: sub.locale })
  try {
    const { sendEmail } = await import('@/lib/send-email')
    const r = await sendEmail(sub.email, { subject: job.subject, html }, undefined, { category: 'newsletter' })
    if (key) await finishDelivery(key, { ok: r.success, error: r.error, postalMessageId: r.postalMessageId })
    await (r.success ? admit.commit() : admit.release())
    return r.success ? 'sent' : 'failed'
  } catch (e) {
    if (key) await finishDelivery(key, { ok: false, error: (e as Error).message })
    await admit.release()
    return 'failed'
  }
}

export interface WhatsAppJob {
  type: DeliveryType
  ref: string
  topic: Topic | null
  /** Free-form text (used inside the 24 h window). */
  text: string
  /** Approved template for outside the window; no template → skipped outside the window. */
  template?: { name: string; language: string; params: string[] } | null
  allowPending?: boolean
  /** Opt-in confirmations and STOP replies ignore quiet hours. */
  ignoreQuietHours?: boolean
  idempotent?: boolean
  now?: Date
}

async function transport() {
  const { getPlatformConfig, whatsappReady } = await import('@/lib/ats/screening/config')
  const { metaTransport, simulatedTransport } = await import('@/lib/ats/screening/providers/whatsapp')
  const cfg = await getPlatformConfig()
  return whatsappReady(cfg) && cfg.whatsapp.phone_number_id ? metaTransport(cfg, cfg.whatsapp.phone_number_id) : simulatedTransport()
}

export async function sendSubscriberWhatsApp(sub: SubscriberDoc, job: WhatsAppJob): Promise<SendOutcome> {
  if (!sub.phone || !sub.whatsapp_consent) return 'skipped'
  if (!(sub.whatsapp_status === 'active' || (job.allowPending && sub.whatsapp_status === 'pending'))) return 'skipped'
  const now = job.now || new Date()
  if (!job.ignoreQuietHours) {
    const s = await getSubscriptionSettings()
    if (inQuietHours(now, sub.timezone || 'UTC', s.quiet_start_hour, s.quiet_end_hour)) return 'deferred'
  }
  const inSession = inWhatsAppSession(sub.whatsapp_last_inbound_at, now)
  if (!inSession && !job.template?.name) return 'skipped'
  const admit = await admitSubscriber(sub, job.type, 'whatsapp')
  if (!admit) return 'duplicate'
  const key = job.idempotent === false ? null : await claimDelivery({ subscriberId: sub.id, type: job.type, ref: job.ref, channel: 'whatsapp', topic: job.topic })
  if (job.idempotent !== false && !key) { await admit.release(); return 'duplicate' }
  try {
    const t = await transport()
    const r = inSession
      ? await t.sendText(sub.phone, job.text)
      : await t.sendTemplate(sub.phone, { name: job.template!.name, language: job.template!.language, bodyParams: job.template!.params }, job.text)
    if (key) await finishDelivery(key, { ok: r.ok, error: r.error, providerId: r.id ?? null })
    await (r.ok ? admit.commit() : admit.release())
    return r.ok ? 'sent' : 'failed'
  } catch (e) {
    if (key) await finishDelivery(key, { ok: false, error: (e as Error).message })
    await admit.release()
    return 'failed'
  }
}
