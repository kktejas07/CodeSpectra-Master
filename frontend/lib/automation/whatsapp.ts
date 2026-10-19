/**
 * WhatsApp for automations: official Meta Cloud API *templates* only, and
 * only to people who agreed to WhatsApp messages.
 *
 * Consent sources (any one):
 *   - platform user: notification_preferences { type: 'whatsapp', enabled: true, phone }
 *     or an active, consented subscription (lib/subscriptions: `subscriptions` collection)
 *   - hiring candidate: ats_candidates.consent.whatsapp === true (with a phone)
 * Quiet hours are respected through the caller (system automations run
 * during the day; workflows can add a wait step).
 */
import { getMongoDb } from '@/lib/mongodb'

export interface WhatsAppRecipient {
  phone: string
  source: 'preferences' | 'subscription' | 'candidate'
  /** When the person agreed (an opt-out by STOP after this wins; AUTO-061). */
  consented_at?: string | null
}

/** A recipient whose phone replied STOP after agreeing is no recipient (AUTO-061). */
async function notOptedOut(r: WhatsAppRecipient | null): Promise<WhatsAppRecipient | null> {
  if (!r) return null
  const { isWhatsAppOptedOut } = await import('@/lib/whatsapp-send')
  return (await isWhatsAppOptedOut(r.phone, r.consented_at ?? null)) ? null : r
}

export async function whatsappRecipientForUser(userId: string): Promise<WhatsAppRecipient | null> {
  if (!userId) return null
  const db = await getMongoDb()
  const pref = await db.collection('notification_preferences').findOne({ user_id: userId, type: 'whatsapp' }, { projection: { enabled: 1, phone: 1, updated_at: 1, created_at: 1 } }).catch(() => null)
  if (pref?.enabled === true) {
    const phone = typeof pref.phone === 'string' && pref.phone ? pref.phone : null
    const user = phone ? null : await db.collection('user').findOne({ $or: [{ id: userId }, { _id: userId as never }] }, { projection: { phone: 1, mobile: 1, phone_number: 1 } }).catch(() => null)
    const p = phone || String(user?.phone || user?.mobile || user?.phone_number || '')
    const r = p ? await notOptedOut({ phone: p, source: 'preferences', consented_at: (pref.updated_at || pref.created_at || null) as string | null }) : null
    if (r) return r
  }
  const sub = await db
    .collection('subscriptions')
    .findOne({ user_id: userId, whatsapp_status: 'active', whatsapp_consent: { $ne: null }, phone: { $type: 'string' } }, { projection: { phone: 1, whatsapp_consent: 1 } })
    .catch(() => null)
  if (sub?.phone) return notOptedOut({ phone: String(sub.phone), source: 'subscription', consented_at: (sub.whatsapp_consent?.at as string) || null })
  return null
}

export async function whatsappRecipientForCandidate(candidateId: string, tenantId: string | null): Promise<WhatsAppRecipient | null> {
  if (!candidateId) return null
  const db = await getMongoDb()
  const c = await db
    .collection('ats_candidates')
    .findOne({ id: candidateId, ...(tenantId ? { tenant_id: tenantId } : {}) }, { projection: { phone: 1, consent: 1 } })
    .catch(() => null)
  if (c?.consent?.whatsapp === true && typeof c.phone === 'string' && c.phone) return notOptedOut({ phone: c.phone, source: 'candidate', consented_at: (c.consent?.whatsapp_at as string) || null })
  return null
}

export type WhatsAppOutcome = { ok: true; id: string | null } | { ok: false; skipped: 'no_consent' | 'not_configured' | 'invalid' | 'quiet_hours'; error?: string } | { ok: false; error: string }

/**
 * Send an approved template. `params` fill the template body's {{1}}, {{2}}…
 * Pass `opts.userId` to respect that user's quiet hours (the message is skipped, not queued:
 * a WhatsApp reminder is only useful on time; email copies are deferred instead).
 */
export async function sendWhatsAppTemplate(rcpt: WhatsAppRecipient | null, template: { name: string; language?: string; params?: string[] }, opts: { userId?: string | null; now?: Date } = {}): Promise<WhatsAppOutcome> {
  if (!rcpt) return { ok: false, skipped: 'no_consent' }
  if (opts.userId) {
    const { getQuietHours, quietWindowEnd } = await import('@/lib/notifications-delivery')
    const qh = await getQuietHours(opts.userId)
    if (qh && quietWindowEnd(qh, opts.now || new Date())) return { ok: false, skipped: 'quiet_hours' }
  }
  const name = String(template.name || '').trim()
  if (!/^[a-z0-9_]{1,512}$/.test(name)) return { ok: false, skipped: 'invalid', error: 'Template names use lowercase letters, digits and _' }
  const { getPlatformConfig, whatsappReady } = await import('@/lib/ats/screening/config')
  const cfg = await getPlatformConfig()
  if (!whatsappReady(cfg) || !cfg.whatsapp.phone_number_id) return { ok: false, skipped: 'not_configured' }
  const { metaTransport } = await import('@/lib/ats/screening/providers/whatsapp')
  const t = metaTransport(cfg, cfg.whatsapp.phone_number_id)
  const lang = /^[a-z]{2}(_[A-Z]{2})?$/.test(template.language || '') ? template.language! : cfg.whatsapp.template_language || 'en'
  const params = (template.params || []).map((p) => String(p ?? '').slice(0, 200)).slice(0, 10)
  const r = await t.sendTemplate(rcpt.phone, { name, language: lang, bodyParams: params }, params.join(' '))
  return r.ok ? { ok: true, id: r.id ?? null } : { ok: false, error: r.error || 'WhatsApp send failed' }
}
