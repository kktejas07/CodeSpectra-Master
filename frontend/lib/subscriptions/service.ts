/**
 * Subscriptions service — the public API other features import (via
 * '@/lib/subscriptions').
 *
 * Consent model
 *  - Email: double opt-in. A request from a public form only stores `pending`
 *    and mails a 72 h confirmation link; topics/filters apply on confirm. A
 *    signed-in user's own account email is trusted (emailVerified) and applies at once.
 *  - WhatsApp: explicit consent checkbox (text + time recorded) AND proof of the
 *    number — the person replies YES/START (or messages START first). Until then
 *    the channel is `pending`. STOP at any time turns it off.
 *  - A public request can never change an existing subscriber's settings
 *    directly; it goes through the same confirmation.
 */
import { toE164 } from '@/lib/ats/phone'
import { escapeHtml } from '@/lib/safe-html'
import { getAppOrigin } from '@/lib/app-origin'
import { sendSubscriberEmail, sendSubscriberWhatsApp } from './channels'
import {
  isStopMessage, isValidTimezone, normalizeChannels, normalizeTopicFilters, normalizeTopics, START_RE,
} from './filters'
import { getSubscriptionSettings } from './settings'
import { newId, nowIso, subscribersCol } from './store'
import { signConfirmToken, verifyConfirmToken, verifyLinkToken, type LinkScope } from './tokens'
import { TOPICS } from './types'
import type {
  Channel, SubscribeInput, SubscribeResult, SubscribeTrust, SubscriberDoc, Topic, TopicFilters,
} from './types'
import { randomBytes } from 'node:crypto'

export const WHATSAPP_CONSENT_TEXT =
  'I agree to receive CodeSpectra updates on WhatsApp for the topics I picked. I can reply STOP at any time to stop.'

const isEmail = (v: unknown): v is string => typeof v === 'string' && v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
const nonce = () => randomBytes(12).toString('base64url')
const mergeTopics = (a: Topic[], b: Topic[]) => [...new Set([...a, ...b])]
const mergeFilters = (a: TopicFilters, b: TopicFilters): TopicFilters => ({ ...a, ...b })

function blank(now: string, p: Partial<SubscriberDoc>): SubscriberDoc {
  return {
    id: newId(), email: null, phone: null, user_id: null,
    email_status: 'none', email_confirmed_at: null, email_bounces: 0,
    whatsapp_status: 'none', whatsapp_consent: null, whatsapp_last_inbound_at: null,
    topics: [], filters: {}, pending: null, timezone: 'UTC', saved_events: [],
    token_nonce: nonce(), source: 'web', created_at: now, updated_at: now, ...p,
  }
}

/** Masked view safe to return to a link holder / browser. */
export function publicView(s: SubscriberDoc) {
  const maskEmail = (e: string) => e.replace(/^(.)(.*)(@.*)$/, (_m, a, b, c) => `${a}${'•'.repeat(Math.min(6, b.length))}${c}`)
  return {
    id: s.id,
    email: s.email ? maskEmail(s.email) : null,
    phone: s.phone ? `${s.phone.slice(0, 3)}•••••${s.phone.slice(-3)}` : null,
    email_status: s.email_status,
    whatsapp_status: s.whatsapp_status,
    topics: s.topics,
    filters: s.filters,
    timezone: s.timezone,
    pending: Boolean(s.pending),
    saved_events: s.saved_events,
  }
}

async function sendEmailConfirmation(sub: SubscriberDoc): Promise<boolean> {
  if (!sub.email || !sub.pending) return false
  const { rateLimitRedis } = await import('@/lib/upstash-rate-limit')
  const lim = await rateLimitRedis(`subs:confirm:${sub.email}`, 3, 24 * 3600_000)
  if (!lim.ok) return true // answer the same way; never let the form spam an inbox
  const token = await signConfirmToken({ id: sub.id, n: sub.token_nonce, e: sub.email, r: sub.pending.requested_at })
  const link = `${getAppOrigin()}/subscriptions/confirm?t=${encodeURIComponent(token)}`
  const topics = sub.pending.topics.map((t) => (t === 'events' ? 'hackathons and coding events' : t === 'blog' ? 'new articles' : t === 'news' ? 'the daily tech news digest' : t)).join(', ')
  const outcome = await sendSubscriberEmail(sub, {
    type: 'confirm', ref: sub.pending.requested_at, topic: null, allowPending: true,
    subject: 'Confirm your CodeSpectra updates',
    heading: 'Confirm your subscription',
    preheader: 'One click to start getting updates.',
    reason: 'You got this email because someone entered this address on CodeSpectra. If it wasn’t you, ignore it and nothing will be sent.',
    bodyHtml: `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151">Please confirm you want email updates about ${escapeHtml(topics || 'CodeSpectra')}. The link works for 72 hours.</p>
      <p style="margin:0 0 8px"><a href="${escapeHtml(link)}" style="display:inline-block;background:#2F5BE7;color:#ffffff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:600">Confirm subscription</a></p>`,
  })
  return outcome === 'sent' || outcome === 'duplicate'
}

/** Pure: may a signed-in account claim this record? Every contact on it must be one the account has verified. */
export function canLinkAccount(sub: Pick<SubscriberDoc, 'email' | 'phone'>, req: { email: string | null; phone: string | null }, trust: SubscribeTrust): boolean {
  const emailOk = !sub.email || Boolean(trust.emailVerified && req.email && sub.email === req.email)
  const phoneOk = !sub.phone || Boolean(trust.phoneVerified && req.phone && sub.phone === req.phone)
  return Boolean(sub.email || sub.phone) && emailOk && phoneOk
}

/** "Here is your manage link" for an address that is already subscribed (rate-limited, deduped per day). */
async function sendManageLink(sub: SubscriberDoc, at: string): Promise<boolean> {
  if (!sub.email) return false
  const { rateLimitRedis } = await import('@/lib/upstash-rate-limit')
  const lim = await rateLimitRedis(`subs:manage:${sub.email}`, 2, 24 * 3600_000)
  if (!lim.ok) return true
  const outcome = await sendSubscriberEmail(sub, {
    type: 'manage', ref: at.slice(0, 10), topic: null, allowPending: true,
    subject: 'Your CodeSpectra updates',
    heading: 'You’re already on our list',
    preheader: 'Use this link to change what you get.',
    reason: 'You got this email because someone entered this address on CodeSpectra. If it wasn’t you, ignore it — nothing changed.',
    bodyHtml: '<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151">Someone asked to subscribe this address, and it already has a subscription. To change your topics, channels or time zone, use the <strong>Manage preferences</strong> link below.</p>',
  })
  return outcome === 'sent' || outcome === 'duplicate'
}

async function sendWhatsAppOptin(sub: SubscriberDoc): Promise<boolean> {
  const s = await getSubscriptionSettings()
  const outcome = await sendSubscriberWhatsApp(sub, {
    type: 'optin', ref: sub.pending?.requested_at || sub.whatsapp_consent?.at || nowIso(), topic: null,
    allowPending: true, ignoreQuietHours: true,
    text: 'Reply YES to start getting CodeSpectra updates here. Reply STOP at any time to stop.',
    template: s.whatsapp_optin_template ? { name: s.whatsapp_optin_template, language: s.whatsapp_template_language, params: [] } : null,
  })
  return outcome === 'sent' || outcome === 'duplicate'
}

/**
 * Create or update a subscription.
 * `trust` carries facts only the server knows (signed-in user's own email / verified phone).
 */
export async function subscribe(input: SubscribeInput, trust: SubscribeTrust = {}, now = new Date()): Promise<SubscribeResult> {
  const channels = normalizeChannels(input.channels)
  const topics = normalizeTopics(input.topics)
  const filters = normalizeTopicFilters(input.filters)
  if (!channels.length) return { ok: false, error: 'Pick at least one channel.' }
  if (!topics.length) return { ok: false, error: 'Pick at least one topic.' }
  const email = typeof input.email === 'string' && input.email.trim() ? input.email.trim().toLowerCase() : null
  if (channels.includes('email') && !isEmail(email)) return { ok: false, error: 'Enter a valid email address.' }
  const phoneRaw = typeof input.phone === 'string' ? input.phone.trim() : ''
  const phone = phoneRaw ? toE164(phoneRaw, input.phone_country || 'IN') : null
  if (channels.includes('whatsapp')) {
    if (!phone) return { ok: false, error: 'Enter a valid WhatsApp number with country code.' }
    if (input.whatsapp_consent !== true) return { ok: false, error: 'Tick the box to agree to WhatsApp messages.' }
  }
  const userId = typeof input.user_id === 'string' && input.user_id ? input.user_id : null
  const tz = isValidTimezone(input.timezone) ? input.timezone : null
  const at = now.toISOString()

  const col = await subscribersCol()
  const byUser = userId ? await col.findOne({ user_id: userId }) : null
  const byEmail = email && channels.includes('email') ? await col.findOne({ email }) : null
  const byPhone = phone && channels.includes('whatsapp') ? await col.findOne({ phone }) : null
  const existing = byUser || byEmail || byPhone
  // Conflicts (details already subscribed separately / record uses other details) get the SAME
  // answer as a normal request, so the public form can't tell who is subscribed: the owner of the
  // existing address gets their manage link by email instead.
  const conflict = existing && (
    (byEmail && byEmail.id !== existing.id) || (byPhone && byPhone.id !== existing.id)
    || (channels.includes('email') && existing.email && existing.email !== email)
    || (channels.includes('whatsapp') && existing.phone && existing.phone !== phone)
  )
  if (conflict) {
    if (byEmail) await sendManageLink(byEmail, at).catch(() => false)
    return { ok: true, email: channels.includes('email') ? 'confirmation_sent' : 'skipped', whatsapp: channels.includes('whatsapp') ? 'confirmation_sent' : 'skipped' }
  }

  const sub: SubscriberDoc = existing ? { ...existing } : blank(at, { source: (input.source || 'web').slice(0, 40), timezone: tz || 'UTC' })
  if (tz && (!existing || trust.emailVerified)) sub.timezone = tz
  const result: SubscribeResult = { ok: true, email: 'skipped', whatsapp: 'skipped' }

  // Topics/filters change what every ACTIVE channel receives, so a request may
  // apply them at once only if it is trusted for each channel that is already
  // active (a brand-new record has none). Otherwise they wait for confirmation.
  const emailTrusted = Boolean(trust.emailVerified && email && (!sub.email || sub.email === email))
  // The signed-in owner of an existing record is trusted for it.
  const ownRecord = Boolean(userId && existing?.user_id === userId)
  const safeToApply = ownRecord || ((sub.email_status !== 'active' || emailTrusted) && (sub.whatsapp_status !== 'active' || Boolean(trust.phoneVerified)))
  const requested = { topics: mergeTopics(sub.topics, topics), filters: mergeFilters(sub.filters, filters) }
  const needsConfirm = (channels.includes('email') && !emailTrusted) || (channels.includes('whatsapp') && !trust.phoneVerified)
  if (safeToApply) {
    sub.topics = requested.topics
    sub.filters = requested.filters
  }
  sub.pending = needsConfirm || !safeToApply ? { ...requested, requested_at: at } : null

  let needEmailConfirm = false
  if (channels.includes('email') && email) {
    if (!sub.email) sub.email = email
    if (emailTrusted) {
      result.email = sub.email_status === 'active' ? 'unchanged' : 'active'
      sub.email_status = 'active'
      sub.email_confirmed_at ||= at
      sub.email_bounces = 0
    } else if (sub.email_status === 'active' && !sub.pending) {
      result.email = 'unchanged'
    } else {
      if (sub.email_status !== 'active') sub.email_status = 'pending'
      needEmailConfirm = true
    }
  }

  let needOptin = false
  if (channels.includes('whatsapp') && phone) {
    if (!sub.phone) sub.phone = phone
    sub.whatsapp_consent = { text: WHATSAPP_CONSENT_TEXT, at, via: trust.phoneVerified ? 'account' : 'web' }
    if (trust.phoneVerified) {
      result.whatsapp = sub.whatsapp_status === 'active' ? 'unchanged' : 'active'
      sub.whatsapp_status = 'active'
    } else if (sub.whatsapp_status === 'active' && !sub.pending) {
      result.whatsapp = 'unchanged'
    } else {
      if (sub.whatsapp_status !== 'active') sub.whatsapp_status = 'pending'
      needOptin = true
    }
  }

  // Link the record to the signed-in account only when that account PROVES every contact on it
  // (its verified email / verified phone) — never because someone typed an address while signed in.
  if (userId && !sub.user_id && canLinkAccount(sub, { email, phone }, trust)) sub.user_id = userId

  sub.updated_at = at
  try {
    if (existing) {
      const { id: _id, ...rest } = sub
      void _id
      await col.updateOne({ id: existing.id }, { $set: rest })
    } else {
      await col.insertOne(sub)
    }
  } catch (e) {
    if ((e as { code?: number })?.code === 11000) return { ok: false, error: 'Please try again.' }
    throw e
  }

  if (needEmailConfirm) result.email = (await sendEmailConfirmation(sub)) ? 'confirmation_sent' : 'skipped'
  if (needOptin) result.whatsapp = (await sendWhatsAppOptin(sub)) ? 'confirmation_sent' : 'skipped'
  if (needEmailConfirm && result.email === 'skipped') return { ok: false, error: 'We couldn’t send the confirmation email. Try again later.', subscriber_id: sub.id }
  // WhatsApp opt-in template may be unconfigured — the person can still message START to us.
  if (needOptin && result.whatsapp === 'skipped') result.whatsapp = 'confirmation_sent'
  result.subscriber_id = sub.id
  return result
}

/** Apply a pending request: email confirmation link (POST from /subscriptions/confirm). */
export async function confirmEmail(token: unknown, now = new Date()): Promise<{ ok: boolean; error?: string; already?: boolean; subscriber?: ReturnType<typeof publicView> }> {
  const d = await verifyConfirmToken(token)
  if (!d) return { ok: false, error: 'This link is invalid or has expired. Subscribe again to get a new one.' }
  const col = await subscribersCol()
  const sub = await col.findOne({ id: d.id, email: d.e, token_nonce: d.n })
  if (!sub) return { ok: false, error: 'This link is no longer valid.' }
  if (!sub.pending || sub.pending.requested_at !== d.r) {
    if (sub.email_status === 'active' && !sub.pending) return { ok: true, already: true, subscriber: publicView(sub) }
    return { ok: false, error: 'A newer confirmation email replaced this one. Use the latest link.' }
  }
  const at = now.toISOString()
  const set: Partial<SubscriberDoc> = {
    email_status: 'active', email_confirmed_at: sub.email_confirmed_at || at, email_bounces: 0,
    topics: sub.pending.topics, filters: sub.pending.filters, pending: null, updated_at: at,
  }
  // Single use: only the exact pending request this link was issued for.
  const r = await col.updateOne({ id: sub.id, 'pending.requested_at': d.r }, { $set: set })
  if (!r.modifiedCount) return { ok: false, error: 'This link was already used.' }
  return { ok: true, subscriber: publicView({ ...sub, ...set } as SubscriberDoc) }
}

/** Load a subscriber from a manage / unsubscribe link. */
export async function getByLink(id: unknown, token: unknown, scope: LinkScope = 'manage'): Promise<SubscriberDoc | null> {
  if (typeof id !== 'string' || !id || id.length > 64) return null
  const sub = await (await subscribersCol()).findOne({ id }, { projection: { _id: 0 } })
  if (!sub) return null
  return (await verifyLinkToken(sub.id, sub.token_nonce, scope, token)) ? (sub as SubscriberDoc) : null
}

/** Pure: what an unsubscribe of `scope` changes. */
export function unsubscribePatch(sub: Pick<SubscriberDoc, 'email_status' | 'whatsapp_status' | 'topics'>, scope: LinkScope): Partial<SubscriberDoc> {
  const off = <T extends string>(s: T) => (s === 'none' || s === 'bounced' ? s : ('unsubscribed' as T))
  if (scope === 'email') return { email_status: off(sub.email_status) }
  if (scope === 'whatsapp') return { whatsapp_status: off(sub.whatsapp_status) }
  if (scope.startsWith('topic:')) {
    const t = scope.slice(6)
    const topics = sub.topics.filter((x) => x !== t)
    return topics.length ? { topics } : { topics, email_status: off(sub.email_status), whatsapp_status: off(sub.whatsapp_status) }
  }
  return { email_status: off(sub.email_status), whatsapp_status: off(sub.whatsapp_status), topics: [], pending: null }
}

export async function unsubscribe(id: unknown, token: unknown, scope: LinkScope = 'all'): Promise<{ ok: boolean; error?: string; subscriber?: ReturnType<typeof publicView> }> {
  const sub = await getByLink(id, token, 'manage')
  if (!sub) return { ok: false, error: 'This link is invalid. Use the link in your latest email.' }
  const patch = { ...unsubscribePatch(sub, scope), updated_at: nowIso() }
  await (await subscribersCol()).updateOne({ id: sub.id }, { $set: patch })
  return { ok: true, subscriber: publicView({ ...sub, ...patch }) }
}

/** Preferences from a manage link. Turning WhatsApp on restarts the YES confirmation. */
export async function updatePreferences(
  id: unknown, token: unknown,
  body: { topics?: unknown; filters?: unknown; email?: unknown; whatsapp?: unknown; timezone?: unknown; whatsapp_consent?: unknown },
): Promise<{ ok: boolean; error?: string; subscriber?: ReturnType<typeof publicView> }> {
  const sub = await getByLink(id, token, 'manage')
  if (!sub) return { ok: false, error: 'This link is invalid. Use the link in your latest email.' }
  const set: Partial<SubscriberDoc> = { updated_at: nowIso() }
  if (body.topics !== undefined) set.topics = normalizeTopics(body.topics)
  if (body.filters !== undefined) set.filters = normalizeTopicFilters(body.filters)
  if (isValidTimezone(body.timezone)) set.timezone = body.timezone
  // The link was mailed to this address, so holding it proves ownership of the email.
  if (body.email === true && sub.email && sub.email_status !== 'active') { set.email_status = 'active'; set.email_bounces = 0; set.email_confirmed_at = sub.email_confirmed_at || nowIso() }
  if (body.email === false && sub.email_status !== 'none') set.email_status = 'unsubscribed'
  let optin = false
  if (body.whatsapp === false && sub.whatsapp_status !== 'none') set.whatsapp_status = 'unsubscribed'
  if (body.whatsapp === true && sub.phone && sub.whatsapp_status !== 'active') {
    if (body.whatsapp_consent !== true) return { ok: false, error: 'Tick the box to agree to WhatsApp messages.' }
    set.whatsapp_status = 'pending'
    set.whatsapp_consent = { text: WHATSAPP_CONSENT_TEXT, at: nowIso(), via: 'web' }
    optin = true
  }
  await (await subscribersCol()).updateOne({ id: sub.id }, { $set: set })
  const next = { ...sub, ...set } as SubscriberDoc
  if (optin) await sendWhatsAppOptin(next)
  return { ok: true, subscriber: publicView(next) }
}

/**
 * Signed-in user saves / unsaves an event for a deadline reminder. Uses their
 * account email (trusted). Creates a reminders-only record if they have none.
 */
export async function setSavedEvent(user: { id: string; email: string }, eventId: string, save: boolean, now = new Date()): Promise<{ ok: boolean; saved_events: string[] }> {
  const col = await subscribersCol()
  const email = user.email?.trim().toLowerCase() || null
  let sub: SubscriberDoc | null = await col.findOne({ user_id: user.id })
  if (!sub && email) sub = await col.findOne({ email })
  const at = now.toISOString()
  if (!sub) {
    if (!save) return { ok: true, saved_events: [] }
    if (!isEmail(email)) return { ok: false, saved_events: [] }
    const fresh = blank(at, { email, user_id: user.id, email_status: 'active', email_confirmed_at: at, source: 'save-event' })
    fresh.saved_events = [eventId]
    try { await col.insertOne(fresh) } catch (e) { if ((e as { code?: number })?.code !== 11000) throw e }
    return { ok: true, saved_events: fresh.saved_events }
  }
  const saved = save ? [...new Set([...(sub.saved_events || []), eventId])].slice(-200) : (sub.saved_events || []).filter((x) => x !== eventId)
  const set: Partial<SubscriberDoc> = { saved_events: saved, updated_at: at }
  if (!sub.user_id) set.user_id = user.id
  // Saving with their own account email re-enables a lapsed email channel (not a bounced one).
  if (save && sub.email === email && (sub.email_status === 'none' || sub.email_status === 'pending')) { set.email_status = 'active'; set.email_confirmed_at = at }
  await col.updateOne({ id: sub.id }, { $set: set })
  return { ok: true, saved_events: saved }
}

export async function getForUser(userId: string): Promise<SubscriberDoc | null> {
  return (await (await subscribersCol()).findOne({ user_id: userId }, { projection: { _id: 0 } })) as SubscriberDoc | null
}

/**
 * Inbound WhatsApp text (from the Meta webhook). Every message from a
 * subscriber refreshes the 24 h session window. STOP turns WhatsApp off;
 * YES/START confirms a pending opt-in (or re-subscribes a number that opted out).
 * `replied` = another handler (e.g. hiring screening) already answered.
 */
export async function handleWhatsAppInbound(m: { from: string; text?: string | null; at?: string }, opts: { replied?: boolean } = {}): Promise<'stopped' | 'started' | 'touched' | 'ignored'> {
  const phone = toE164(m.from.startsWith('+') ? m.from : `+${m.from}`)
  if (!phone) return 'ignored'
  const col = await subscribersCol()
  const sub = await col.findOne({ phone })
  if (!sub) return 'ignored'
  const at = m.at || nowIso()
  const text = String(m.text || '')
  const reply = async (s: SubscriberDoc, body: string) => {
    if (opts.replied) return
    await sendSubscriberWhatsApp(s, { type: 'keyword', ref: at, topic: null, text: body, allowPending: true, ignoreQuietHours: true, idempotent: false })
  }
  if (isStopMessage(text)) {
    const set = { whatsapp_status: 'unsubscribed' as const, whatsapp_last_inbound_at: at, updated_at: nowIso() }
    // Not caught: if this write fails the webhook answers 500 and Meta redelivers the STOP.
    await col.updateOne({ id: sub.id }, { $set: set })
    // One confirmation is allowed after STOP (sent while the channel is still marked as consented).
    await reply({ ...sub, whatsapp_status: 'pending', whatsapp_last_inbound_at: at }, 'You’re unsubscribed from CodeSpectra WhatsApp updates. Reply START to subscribe again.').catch(() => undefined)
    return 'stopped'
  }
  if (START_RE.test(text) && sub.whatsapp_status !== 'active') {
    const set: Partial<SubscriberDoc> = {
      whatsapp_status: 'active', whatsapp_last_inbound_at: at, updated_at: nowIso(),
      whatsapp_consent: sub.whatsapp_consent && sub.whatsapp_status === 'pending' ? sub.whatsapp_consent : { text: WHATSAPP_CONSENT_TEXT, at, via: 'keyword' },
    }
    if (sub.pending && sub.email_status !== 'pending') { set.topics = sub.pending.topics; set.filters = sub.pending.filters; set.pending = null }
    else if (sub.pending && !sub.topics.length) { set.topics = sub.pending.topics; set.filters = sub.pending.filters }
    await col.updateOne({ id: sub.id }, { $set: set })
    await reply({ ...sub, ...set } as SubscriberDoc, 'You’re subscribed. We’ll message you about new events that match your choices. Reply STOP at any time to stop.')
    return 'started'
  }
  await col.updateOne({ id: sub.id }, { $set: { whatsapp_last_inbound_at: at } })
  return 'touched'
}

/** Postal bounce / failure for an email we sent to a subscriber. */
export async function handleEmailBounce(postalMessageId: number, status: 'bounced' | 'failed'): Promise<boolean> {
  const { deliveriesCol } = await import('./store')
  const deliv = await (await deliveriesCol()).findOne({ postal_message_id: postalMessageId })
  if (!deliv) return false
  await (await deliveriesCol()).updateOne({ key: deliv.key }, { $set: { status: status === 'bounced' ? 'bounced' : 'failed', updated_at: nowIso() } })
  const col = await subscribersCol()
  const sub = await col.findOne({ id: deliv.subscriber_id })
  if (!sub) return true
  const bounces = (sub.email_bounces || 0) + 1
  // Hard bounce → stop at once; soft failures → after 3.
  const stop = status === 'bounced' || bounces >= 3
  await col.updateOne({ id: sub.id }, { $set: { email_bounces: bounces, ...(stop && sub.email_status !== 'none' ? { email_status: 'bounced' as const } : {}), updated_at: nowIso() } })
  return true
}

/** Recipients for a topic on a channel (active only). */
export async function recipientsFor(topic: Topic, channel: Channel, limit = 50_000): Promise<SubscriberDoc[]> {
  const q: Record<string, unknown> = channel === 'email' ? { topics: topic, email_status: 'active' } : { topics: topic, whatsapp_status: 'active' }
  return (await (await subscribersCol()).find(q, { projection: { _id: 0 } }).limit(limit).toArray()) as SubscriberDoc[]
}

export async function subscriberStats() {
  const rows = (await (await subscribersCol()).find({}, { projection: { _id: 0, email_status: 1, whatsapp_status: 1, topics: 1 } }).limit(200_000).toArray()) as SubscriberDoc[]
  const count = (pred: (s: SubscriberDoc) => boolean) => rows.filter(pred).length
  return {
    total: rows.length,
    email: { active: count((s) => s.email_status === 'active'), pending: count((s) => s.email_status === 'pending'), unsubscribed: count((s) => s.email_status === 'unsubscribed'), bounced: count((s) => s.email_status === 'bounced') },
    whatsapp: { active: count((s) => s.whatsapp_status === 'active'), pending: count((s) => s.whatsapp_status === 'pending'), unsubscribed: count((s) => s.whatsapp_status === 'unsubscribed') },
    topics: Object.fromEntries((TOPICS as readonly Topic[]).map((t) => [t, count((s) => s.topics.includes(t))])),
  }
}

const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v)
  // Neutralise spreadsheet formulas.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function subscribersCsv(rows: SubscriberDoc[]): string {
  const head = ['id', 'email', 'email_status', 'phone', 'whatsapp_status', 'topics', 'filters', 'timezone', 'created_at']
  const lines = rows.map((s) => [s.id, s.email, s.email_status, s.phone, s.whatsapp_status, s.topics.join('|'), JSON.stringify(s.filters || {}), s.timezone, s.created_at].map(csvCell).join(','))
  return [head.join(','), ...lines].join('\n') + '\n'
}

export async function listSubscribers(opts: { limit?: number; topic?: string } = {}): Promise<SubscriberDoc[]> {
  const q: Record<string, unknown> = {}
  if (opts.topic) q.topics = opts.topic
  return (await (await subscribersCol()).find(q, { projection: { _id: 0 } }).sort({ created_at: -1 }).limit(Math.min(100_000, opts.limit || 200)).toArray()) as SubscriberDoc[]
}
