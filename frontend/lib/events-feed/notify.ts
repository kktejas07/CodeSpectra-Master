/**
 * Subscriber notifications for the events feed.
 *  - Instant alerts (WhatsApp): new published events matching a subscriber's
 *    filters, first seen in the last 48 h, max 3 per person per run; quiet
 *    hours defer to the next run. Email subscribers get these in the digest.
 *  - Weekly digest (email): new this week + registration closing within 7 days.
 *  - Deadline reminders (email + WhatsApp): 48 h before registration closes, for
 *    events the person saved.
 * Every send is idempotent per (subscriber, type, ref, channel) via the
 * subscriptions delivery ledger.
 */
import { escapeHtml } from '@/lib/safe-html'
import { getAppOrigin } from '@/lib/app-origin'
import { matchesEventFilters, type FilterableEvent } from '@/lib/subscriptions/filters'
import type { SubscriberDoc } from '@/lib/subscriptions/types'
import { formatRange, KIND_LABELS, MODE_LABELS, withUtm } from './public'
import { fillTemplate, type EventsFeedSettings } from './settings'
import type { FeedEventDoc } from './types'

const DAY = 24 * 3600_000
export const ALERT_WINDOW_MS = 48 * 3600_000
export const MAX_ALERTS_PER_RUN = 3
export const REMINDER_LEAD_MS = 48 * 3600_000

export const filterable = (e: FeedEventDoc): FilterableEvent => ({
  kind: e.kind, mode: e.mode, country: e.location?.country || null, themes: e.themes || [], prize_usd_minor: e.prize?.usd_minor ?? null,
})

const upcoming = (e: FeedEventDoc, now: Date) => e.status === 'published' && (!e.ends_at || Date.parse(e.ends_at) >= now.getTime())

/** ISO-8601 week key ("2026-W43") of `now` in `tz`. */
export function isoWeekKey(now: Date, tz = 'UTC'): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now).split('-').map(Number)
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]))
  const dow = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dow)
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1)
  const week = Math.ceil(((d.getTime() - yearStart) / DAY + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

/** Pure: events eligible for an instant alert. */
export function alertCandidates(events: FeedEventDoc[], now: Date): FeedEventDoc[] {
  const t = now.getTime()
  return events.filter((e) => upcoming(e, now) && Date.parse(e.first_seen_at) >= t - ALERT_WINDOW_MS && (!e.starts_at || Date.parse(e.starts_at) > t))
}

/** Pure: what goes into one subscriber's weekly digest. */
export function selectDigest(events: FeedEventDoc[], sub: Pick<SubscriberDoc, 'filters'>, now: Date, opts: { maxNew?: number; maxClosing?: number } = {}) {
  const t = now.getTime()
  const mine = events.filter((e) => upcoming(e, now) && matchesEventFilters(filterable(e), sub.filters?.events))
  const byStart = (a: FeedEventDoc, b: FeedEventDoc) => (a.featured !== b.featured ? (a.featured ? -1 : 1) : (Date.parse(a.starts_at || '') || Infinity) - (Date.parse(b.starts_at || '') || Infinity))
  const fresh = mine.filter((e) => Date.parse(e.first_seen_at) >= t - 7 * DAY).sort(byStart).slice(0, opts.maxNew ?? 8)
  const freshIds = new Set(fresh.map((e) => e.id))
  const closing = mine
    .filter((e) => !freshIds.has(e.id) && e.registration_deadline && Date.parse(e.registration_deadline) >= t && Date.parse(e.registration_deadline) <= t + 7 * DAY)
    .sort((a, b) => Date.parse(a.registration_deadline!) - Date.parse(b.registration_deadline!))
    .slice(0, opts.maxClosing ?? 5)
  return { fresh, closing }
}

/** Pure: saved events whose registration closes within the next 48 h. */
export function remindersDue(events: FeedEventDoc[], saved: string[], now: Date): FeedEventDoc[] {
  const t = now.getTime()
  const ids = new Set(saved)
  return events.filter((e) => ids.has(e.id) && upcoming(e, now) && e.registration_deadline && Date.parse(e.registration_deadline) > t && Date.parse(e.registration_deadline) <= t + REMINDER_LEAD_MS)
}

export const eventPageUrl = (id: string) => `${getAppOrigin()}/events/${id}`

function cardHtml(e: FeedEventDoc): string {
  const where = e.mode === 'online' ? 'Online' : [e.location?.city, e.location?.country].filter(Boolean).join(', ') || MODE_LABELS[e.mode]
  const deadline = e.registration_deadline ? ` · Registration closes ${new Date(e.registration_deadline).toUTCString().slice(5, 16)}` : ''
  return `<div style="border:1px solid #e3e7f1;border-radius:12px;padding:14px 16px;margin:0 0 12px">
    <div style="font-size:12px;color:#4b5563;margin-bottom:4px">${escapeHtml(KIND_LABELS[e.kind])} · ${escapeHtml(where)}${e.featured ? ' · Featured' : ''}</div>
    <a href="${escapeHtml(eventPageUrl(e.id))}" style="font-size:16px;font-weight:600;color:#0f1729;text-decoration:none">${escapeHtml(e.title)}</a>
    <div style="font-size:13px;color:#374151;margin:6px 0">${escapeHtml(e.description_summary)}</div>
    <div style="font-size:12px;color:#4b5563">${escapeHtml(formatRange(e.starts_at, e.ends_at, 'UTC'))} (UTC)${escapeHtml(deadline)}${e.prize?.text ? ` · ${escapeHtml(e.prize.text)}` : ''}</div>
    <a href="${escapeHtml(withUtm(e.url, e.internal, 'email'))}" style="display:inline-block;margin-top:8px;font-size:13px;color:#2F5BE7;font-weight:600">Register on the organiser’s site →</a>
  </div>`
}

export function digestHtml(intro: string, fresh: FeedEventDoc[], closing: FeedEventDoc[]): string {
  const sec = (title: string, list: FeedEventDoc[]) => (list.length ? `<h2 style="font-size:16px;margin:20px 0 10px;color:#0f1729">${escapeHtml(title)}</h2>${list.map(cardHtml).join('')}` : '')
  return `<p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#374151">${escapeHtml(intro)}</p>
    ${sec('New this week', fresh)}${sec('Registration closing soon', closing)}
    <p style="margin:16px 0 0;font-size:13px"><a href="${escapeHtml(getAppOrigin())}/events" style="color:#2F5BE7">See all events</a></p>`
}

export function reminderHtml(e: FeedEventDoc): string {
  return `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#374151">You saved this event. Registration closes in less than 48 hours.</p>${cardHtml(e)}`
}

export interface NotifyReport { sent: number; failed: number; skipped: number; deferred: number; duplicate: number }
const emptyReport = (): NotifyReport => ({ sent: 0, failed: 0, skipped: 0, deferred: 0, duplicate: 0 })

async function loadUpcoming(now: Date): Promise<FeedEventDoc[]> {
  const { feedCol } = await import('./store')
  const rows = await (await feedCol()).find({ status: 'published' }, { projection: { _id: 0 } }).limit(20_000).toArray()
  return (rows as FeedEventDoc[]).filter((e) => upcoming(e, now))
}

export async function runAlerts(now: Date, settings: EventsFeedSettings): Promise<NotifyReport> {
  const rep = emptyReport()
  if (!settings.alerts_enabled) return rep
  const events = alertCandidates(await loadUpcoming(now), now)
  if (!events.length) return rep
  const { recipientsFor, sendSubscriberWhatsApp } = await import('@/lib/subscriptions')
  for (const sub of await recipientsFor('events', 'whatsapp')) {
    let sentThisRun = 0
    for (const e of events.filter((x) => matchesEventFilters(filterable(x), sub.filters?.events))) {
      if (sentThisRun >= MAX_ALERTS_PER_RUN) break
      const dates = formatRange(e.starts_at, e.ends_at, sub.timezone || 'UTC')
      const link = eventPageUrl(e.id)
      const out = await sendSubscriberWhatsApp(sub, {
        type: 'alert', ref: e.id, topic: 'events', now,
        text: `New ${KIND_LABELS[e.kind].toLowerCase()}: ${e.title}\n${dates}${e.prize?.text ? ` · ${e.prize.text}` : ''}\n${link}\n\nReply STOP to stop these messages.`,
        template: settings.whatsapp_template_alert ? { name: settings.whatsapp_template_alert, language: (await lang()), params: [e.title, dates, link] } : null,
      })
      rep[out]++
      if (out === 'sent') sentThisRun++
      if (out === 'deferred') break // quiet hours: try again next run
    }
  }
  return rep
}

async function lang(): Promise<string> {
  const { getSubscriptionSettings } = await import('@/lib/subscriptions/settings')
  return (await getSubscriptionSettings()).whatsapp_template_language
}

export async function runDigest(now: Date, settings: EventsFeedSettings, weekKey: string): Promise<NotifyReport> {
  const rep = emptyReport()
  if (!settings.digest_enabled) return rep
  const events = await loadUpcoming(now)
  const { recipientsFor, sendSubscriberEmail } = await import('@/lib/subscriptions')
  for (const sub of await recipientsFor('events', 'email')) {
    const { fresh, closing } = selectDigest(events, sub, now)
    if (!fresh.length && !closing.length) { rep.skipped++; continue }
    const out = await sendSubscriberEmail(sub, {
      type: 'digest', ref: weekKey, topic: 'events',
      subject: fillTemplate(settings.digest_subject, { count: String(fresh.length + closing.length), week: weekKey }),
      heading: 'Hackathons and coding events this week',
      preheader: `${fresh.length} new, ${closing.length} closing soon`,
      bodyHtml: digestHtml(settings.digest_intro, fresh, closing),
      reason: 'You get this weekly email because you subscribed to CodeSpectra event updates.',
    })
    rep[out]++
  }
  return rep
}

export async function runReminders(now: Date, settings: EventsFeedSettings): Promise<NotifyReport> {
  const rep = emptyReport()
  if (!settings.reminders_enabled) return rep
  const t = now.getTime()
  const { feedCol } = await import('./store')
  const due = (await (await feedCol()).find({
    status: 'published',
    registration_deadline: { $gt: now.toISOString(), $lte: new Date(t + REMINDER_LEAD_MS).toISOString() },
  }, { projection: { _id: 0 } }).limit(5000).toArray()) as FeedEventDoc[]
  if (!due.length) return rep
  const { subscribersCol } = await import('@/lib/subscriptions/store')
  const { sendSubscriberEmail, sendSubscriberWhatsApp } = await import('@/lib/subscriptions')
  const subs = (await (await subscribersCol()).find({ saved_events: { $in: due.map((e) => e.id) } }, { projection: { _id: 0 } }).limit(50_000).toArray()) as SubscriberDoc[]
  const language = settings.whatsapp_template_reminder ? await lang() : 'en'
  for (const sub of subs) {
    for (const e of remindersDue(due, sub.saved_events, now)) {
      const subject = fillTemplate(settings.reminder_subject, { title: e.title })
      rep[await sendSubscriberEmail(sub, {
        type: 'reminder', ref: e.id, topic: null, subject, heading: 'Registration closes soon', bodyHtml: reminderHtml(e),
        reason: 'You get this because you asked us to remind you about this event.',
      })]++
      const deadline = new Date(e.registration_deadline!).toLocaleString('en-US', { timeZone: sub.timezone || 'UTC', dateStyle: 'medium', timeStyle: 'short' })
      const link = eventPageUrl(e.id)
      rep[await sendSubscriberWhatsApp(sub, {
        type: 'reminder', ref: e.id, topic: null, now,
        text: `Reminder: registration for ${e.title} closes ${deadline}.\n${link}\n\nReply STOP to stop these messages.`,
        template: settings.whatsapp_template_reminder ? { name: settings.whatsapp_template_reminder, language, params: [e.title, deadline, link] } : null,
      })]++
    }
  }
  return rep
}

/** Admin "send test": renders a real digest / alert to one address or number, outside the ledger. */
export async function sendTest(kind: 'digest' | 'alert' | 'reminder', to: { email?: string; phone?: string }, settings: EventsFeedSettings, now = new Date()): Promise<{ email?: string; whatsapp?: string }> {
  const events = await loadUpcoming(now)
  const fake: SubscriberDoc = {
    id: 'test', email: to.email || null, phone: to.phone || null, user_id: null, email_status: 'active', email_confirmed_at: null, email_bounces: 0,
    whatsapp_status: 'active', whatsapp_consent: to.phone ? { text: 'admin test', at: now.toISOString(), via: 'web' } : null, whatsapp_last_inbound_at: null,
    topics: ['events'], filters: {}, pending: null, timezone: settings.digest_timezone, saved_events: [], token_nonce: 'test', source: 'admin-test',
    created_at: now.toISOString(), updated_at: now.toISOString(),
  }
  const { sendSubscriberEmail, sendSubscriberWhatsApp } = await import('@/lib/subscriptions')
  const out: { email?: string; whatsapp?: string } = {}
  const e = events[0]
  if (to.email) {
    const { fresh, closing } = selectDigest(events, fake, new Date(now.getTime()))
    out.email = await sendSubscriberEmail(fake, {
      type: 'test', ref: now.toISOString(), topic: 'events', idempotent: false,
      subject: `[Test] ${kind === 'digest' ? settings.digest_subject : kind === 'alert' ? fillTemplate(settings.alert_subject, { title: e?.title || 'Sample event' }) : fillTemplate(settings.reminder_subject, { title: e?.title || 'Sample event' })}`,
      heading: kind === 'digest' ? 'Hackathons and coding events this week' : kind === 'alert' ? 'New event' : 'Registration closes soon',
      bodyHtml: kind === 'digest' ? digestHtml(settings.digest_intro, fresh.length ? fresh : events.slice(0, 3), closing) : e ? (kind === 'reminder' ? reminderHtml(e) : cardHtml(e)) : '<p>No events yet.</p>',
      reason: 'This is a test sent from the admin panel.',
    })
  }
  if (to.phone && e) {
    const dates = formatRange(e.starts_at, e.ends_at, 'UTC')
    const tplName = kind === 'reminder' ? settings.whatsapp_template_reminder : settings.whatsapp_template_alert
    out.whatsapp = await sendSubscriberWhatsApp(fake, {
      type: 'test', ref: now.toISOString(), topic: 'events', idempotent: false, ignoreQuietHours: true, now,
      text: `[Test] ${e.title}\n${dates}\n${eventPageUrl(e.id)}`,
      template: tplName ? { name: tplName, language: await lang(), params: [e.title, dates, eventPageUrl(e.id)] } : null,
    })
  }
  return out
}
