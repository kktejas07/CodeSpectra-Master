/**
 * The one way to send WhatsApp (AUTO-060 / AUTO-061).
 *
 *   1. Consent: only to people who agreed — a platform user's WhatsApp
 *      preference or active subscription, a hiring candidate's
 *      consent.whatsapp, a seller's whatsapp_opt_in (lib/automation/whatsapp).
 *   2. Opt-outs: a STOP reply to our number opts that phone out of every
 *      WhatsApp message (whatsapp_optouts), turns off the user's WhatsApp
 *      preference and the candidate's consent. Only a later, explicit opt-in
 *      (newer than the STOP) sends again.
 *   3. Channel: the official Meta Cloud API with an approved template
 *      (Admin → Automations → WhatsApp templates). The unofficial OpenWA
 *      gateway (lib/whatsapp.ts) is used only when a superadmin explicitly
 *      enabled it (whatsapp_unofficial_enabled, or WHATSAPP_UNOFFICIAL=1 /
 *      the older ATS_WHATSAPP_UNOFFICIAL=1) — and it is still consent-gated.
 *   4. Quiet hours: skipped (not queued) for the user unless `urgent`.
 * Never throws; returns what happened.
 */
import { getMongoDb } from '@/lib/mongodb'
import type { WhatsAppRecipient } from '@/lib/automation/whatsapp'

export type WhatsAppSendOutcome =
  | { sent: true; via: 'meta' | 'unofficial' }
  | { sent: false; skipped: 'no_consent' | 'opted_out' | 'not_configured' | 'quiet_hours' | 'invalid' | 'error'; error?: string }

export type WhatsAppMessageKind = 'notification' | 'hiring' | 'newsletter' | 'marketplace'

export interface WhatsAppMessage {
  kind: WhatsAppMessageKind
  /** Short title (template value 1 for the generic templates). */
  title: string
  /** Body text (template value 2; the whole message on the unofficial gateway). */
  text: string
  /** Optional link (template value 3). */
  link?: string
  /** A specific approved template + values instead of the generic one for `kind`. */
  template?: { name: string; params: string[]; language?: string }
  /** Ignore the recipient's quiet hours. */
  urgent?: boolean
}

// ─── Phones (pure) ──────────────────────────────────────────────────────────

const DEFAULT_CC = () => (process.env.WHATSAPP_DEFAULT_COUNTRY_CODE || '91').replace(/\D/g, '') || '91'

/** Canonical digits (country code + number) used as the opt-out key. Null when not a phone. */
export function phoneKey(phone: unknown, defaultCc = DEFAULT_CC()): string | null {
  if (typeof phone !== 'string') return null
  let d = phone.replace(/[^\d+]/g, '')
  const intl = d.startsWith('+') || d.startsWith('00')
  d = d.replace(/^\+/, '').replace(/^00/, '')
  if (d.length < 7 || d.length > 15) return null
  if (!intl && (d.length <= 10 || (d.length === 11 && d.startsWith('0')))) d = defaultCc + d.replace(/^0/, '')
  return d
}

/** Spellings a stored phone may have (for matching records by phone). */
export function phoneVariants(phone: string, defaultCc = DEFAULT_CC()): string[] {
  const key = phoneKey(phone, defaultCc)
  if (!key) return []
  const out = new Set<string>([key, `+${key}`])
  if (key.startsWith(defaultCc)) {
    const local = key.slice(defaultCc.length)
    out.add(local)
    out.add(`0${local}`)
    out.add(`+${defaultCc} ${local}`)
  }
  return [...out]
}

/** Pure: is an opt-out still in force for a consent given at `consentAt`? */
export function optOutApplies(optedOutAt: string | null | undefined, consentAt: string | null | undefined): boolean {
  if (!optedOutAt) return false
  if (!consentAt) return true
  return Date.parse(consentAt) <= Date.parse(optedOutAt)
}

// ─── Settings ───────────────────────────────────────────────────────────────

export async function unofficialWhatsAppEnabled(): Promise<boolean> {
  if (process.env.WHATSAPP_UNOFFICIAL === '1' || process.env.ATS_WHATSAPP_UNOFFICIAL === '1') return true
  try {
    const { getSystemSettings } = await import('@/lib/automation/settings')
    return (await getSystemSettings()).config.whatsapp_unofficial_enabled === true
  } catch {
    return false
  }
}

async function genericTemplate(kind: WhatsAppMessageKind): Promise<{ name: string; language: string } | null> {
  try {
    const { getSystemSettings, configValue } = await import('@/lib/automation/settings')
    const cfg = (await getSystemSettings()).config
    const name = kind === 'newsletter' ? cfg.wa_template_newsletter : kind === 'hiring' ? cfg.wa_template_hiring || cfg.wa_template_notification : cfg.wa_template_notification
    return name ? { name, language: configValue(cfg, 'wa_template_language') } : null
  } catch {
    return null
  }
}

// ─── Opt-outs ───────────────────────────────────────────────────────────────

export async function whatsappOptOut(phone: string): Promise<{ opted_out_at: string } | null> {
  const key = phoneKey(phone)
  if (!key) return null
  try {
    const row = await (await getMongoDb()).collection('whatsapp_optouts').findOne({ key, active: true }, { projection: { opted_out_at: 1 } })
    return row ? { opted_out_at: String(row.opted_out_at) } : null
  } catch {
    return null
  }
}

/** Is this phone opted out for a consent given at `consentAt` (null = consent time unknown)? */
export async function isWhatsAppOptedOut(phone: string, consentAt?: string | null): Promise<boolean> {
  const o = await whatsappOptOut(phone)
  return !!o && optOutApplies(o.opted_out_at, consentAt ?? null)
}

/**
 * Apply an inbound STOP / START (AUTO-061) for every record with that phone:
 * STOP records the opt-out, switches the WhatsApp preference off for matching
 * users and clears consent on matching candidates and sellers. START lifts
 * the phone-level opt-out (preferences / consent stay off until the person
 * opts in again). Throws on database errors so the webhook is redelivered.
 */
export async function applyWhatsAppKeyword(m: { from: string; text?: string | null; at?: string }): Promise<'stopped' | 'started' | 'ignored'> {
  const { isStopMessage, START_RE } = await import('@/lib/subscriptions/filters')
  const text = String(m.text || '')
  const stop = isStopMessage(text)
  const start = !stop && START_RE.test(text)
  if (!stop && !start) return 'ignored'
  const key = phoneKey(m.from.startsWith('+') ? m.from : `+${m.from}`)
  if (!key) return 'ignored'
  const db = await getMongoDb()
  const at = m.at || new Date().toISOString()
  const optouts = db.collection('whatsapp_optouts')
  await optouts.createIndex({ key: 1 }, { unique: true }).catch(() => undefined)
  if (start) {
    await optouts.updateOne({ key }, { $set: { active: false, opted_in_at: at } })
    return 'started'
  }
  await optouts.updateOne({ key }, { $set: { key, active: true, opted_out_at: at, source: 'stop_keyword' } }, { upsert: true })
  const variants = phoneVariants(`+${key}`)
  const phoneMatch = { $in: variants }
  const users = await db.collection('user').find({ $or: [{ phone: phoneMatch }, { mobile: phoneMatch }, { phone_number: phoneMatch }, { whatsapp: phoneMatch }] }, { projection: { id: 1, _id: 1 } }).limit(50).toArray()
  const userIds = users.map((u) => String(u.id || u._id))
  await db.collection('notification_preferences').updateMany(
    { type: 'whatsapp', $or: [{ phone: phoneMatch }, ...(userIds.length ? [{ user_id: { $in: userIds } }] : [])] },
    { $set: { enabled: false, opted_out_at: at, updated_at: at } },
  )
  await db.collection('ats_candidates').updateMany({ phone: phoneMatch, 'consent.whatsapp': true }, { $set: { 'consent.whatsapp': false, 'consent.whatsapp_opted_out_at': at, updated_at: at } })
  await db.collection('mkt_sellers').updateMany({ phone: phoneMatch, whatsapp_opt_in: true }, { $set: { whatsapp_opt_in: false, whatsapp_opted_out_at: at } })
  return 'stopped'
}

// ─── Sending ────────────────────────────────────────────────────────────────

/** Send to an already consented recipient (see lib/automation/whatsapp recipients). */
export async function sendWhatsAppConsented(rcpt: WhatsAppRecipient | null, msg: WhatsAppMessage, opts: { userId?: string | null; now?: Date } = {}): Promise<WhatsAppSendOutcome> {
  try {
    if (!rcpt) return { sent: false, skipped: 'no_consent' }
    if (await isWhatsAppOptedOut(rcpt.phone, rcpt.consented_at ?? null)) return { sent: false, skipped: 'opted_out' }
    const tpl = msg.template ?? (await genericTemplate(msg.kind).then((g) => (g ? { name: g.name, language: g.language, params: [msg.title, msg.text, msg.link || ''].map((v) => String(v || '').slice(0, 200)) } : null)))
    if (tpl) {
      const { sendWhatsAppTemplate } = await import('@/lib/automation/whatsapp')
      const r = await sendWhatsAppTemplate(rcpt, tpl, { userId: msg.urgent ? null : opts.userId ?? null, now: opts.now })
      if (r.ok) return { sent: true, via: 'meta' }
      if ('skipped' in r && r.skipped === 'quiet_hours') return { sent: false, skipped: 'quiet_hours' }
      if ('skipped' in r && r.skipped === 'invalid') return { sent: false, skipped: 'invalid', error: r.error }
      if (!('skipped' in r && r.skipped === 'not_configured')) return { sent: false, skipped: 'error', error: 'error' in r ? r.error : undefined }
    }
    if (!(await unofficialWhatsAppEnabled())) return { sent: false, skipped: 'not_configured' }
    if (!msg.urgent && opts.userId) {
      const { getQuietHours, quietWindowEnd } = await import('@/lib/notifications-delivery')
      const qh = await getQuietHours(opts.userId)
      if (qh && quietWindowEnd(qh, opts.now || new Date())) return { sent: false, skipped: 'quiet_hours' }
    }
    const body = [msg.title ? `*${msg.title}*` : '', msg.text, msg.link || ''].filter(Boolean).join('\n\n').slice(0, 1000)
    const { sendWhatsAppText } = await import('@/lib/whatsapp')
    const r = await sendWhatsAppText(rcpt.phone, body)
    return r.success ? { sent: true, via: 'unofficial' } : { sent: false, skipped: 'error', error: r.error }
  } catch (e) {
    return { sent: false, skipped: 'error', error: (e as Error)?.message }
  }
}

/** A platform user (consent from their WhatsApp preference or subscription). */
export async function sendWhatsAppToUser(userId: string, msg: WhatsAppMessage, opts: { now?: Date } = {}): Promise<WhatsAppSendOutcome> {
  const { whatsappRecipientForUser } = await import('@/lib/automation/whatsapp')
  const rcpt = await whatsappRecipientForUser(userId).catch(() => null)
  return sendWhatsAppConsented(rcpt, msg, { userId, now: opts.now })
}

/** A hiring candidate record (consent.whatsapp must be true). */
export async function sendWhatsAppToCandidate(candidate: { phone?: string | null; consent?: { whatsapp?: boolean; whatsapp_at?: string | null } | null } | null, msg: WhatsAppMessage): Promise<WhatsAppSendOutcome> {
  if (!candidate?.phone || candidate.consent?.whatsapp !== true) return { sent: false, skipped: 'no_consent' }
  return sendWhatsAppConsented({ phone: candidate.phone, source: 'candidate', consented_at: candidate.consent?.whatsapp_at ?? null }, msg)
}

/** A record that carries its own explicit opt-in (e.g. a seller's whatsapp_opt_in). */
export async function sendWhatsAppWithOptIn(phone: string | null | undefined, optedIn: boolean, msg: WhatsAppMessage, consentAt?: string | null): Promise<WhatsAppSendOutcome> {
  if (!phone || !optedIn) return { sent: false, skipped: 'no_consent' }
  return sendWhatsAppConsented({ phone, source: 'preferences', consented_at: consentAt ?? null }, msg)
}
