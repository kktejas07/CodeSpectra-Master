/**
 * Mentor session messages: calendar invite (.ics) to the mentor when a session is booked,
 * and updated invites to both sides when the learner reschedules. Same UID as the buyer's
 * booking invite (lib/marketplace/emails.ts bookingIcs) so calendars update in place.
 * Every e-mail carries the preferences / unsubscribe link (transactional booking mail).
 * Written in each recipient's saved interface language (catalog keys `mentor.mail.*`).
 */
import 'server-only'
import { escapeHtml } from '@/lib/safe-html'
import { getAppOrigin } from '@/lib/app-origin'
import { sendEmail } from '@/lib/send-email'
import { notify } from '@/lib/notifications'
import { getSellerById } from '@/lib/marketplace/sellers'
import { bookingIcs } from '@/lib/marketplace/emails'
import type { OrderDoc, OrderLineDoc } from '@/lib/marketplace/order-doc'
import { getMentorBySeller } from './service'
import { outboundT, type OutboundTranslator } from '@/lib/i18n/outbound'
import { localeForRecipient } from '@/lib/i18n/recipient'
import { LOCALE_META, type Locale } from '@/lib/i18n/config'

const BLUE = '#2F5BE7'

export function sessionEmail(title: string, body: string, t: OutboundTranslator = outboundT('email', 'en')): string {
  const origin = getAppOrigin()
  return `<div style="background:#f3f5fb;padding:32px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden">
<tr><td style="background:${BLUE};padding:20px 28px;color:#ffffff;font-size:17px;font-weight:700">${escapeHtml(t('mentor.mail.brand'))}</td></tr>
<tr><td style="padding:28px;color:#0f1729;font-size:15px;line-height:1.6"><h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(title)}</h1>${body}</td></tr>
<tr><td style="padding:16px 28px 24px;border-top:1px solid #e2e8f0;font-size:12px;color:#475569">
${escapeHtml(t('mentor.mail.why'))} <a href="${origin}/dashboard/notifications/preferences" style="color:${BLUE}">${escapeHtml(t('mkt.mail.manage'))}</a>.
</td></tr></table></div>`
}

function when(locale: Locale, iso: string, tz?: string | null): string {
  try {
    return new Intl.DateTimeFormat(LOCALE_META[locale].intl, { dateStyle: 'full', timeStyle: 'short', timeZone: tz || 'UTC', timeZoneName: 'short' }).format(new Date(iso))
  } catch {
    return new Date(iso).toUTCString()
  }
}

async function userEmail(userId: string): Promise<string | null> {
  const { getMongoDb } = await import('@/lib/mongodb')
  const u = await (await getMongoDb()).collection('user').findOne({ $or: [{ id: userId }, { _id: userId as never }] }, { projection: { email: 1 } })
  return typeof u?.email === 'string' ? u.email : null
}

async function sendWithIcs(to: string | null, subject: string, html: string, ics: string | null) {
  if (!to) return
  await sendEmail(to, { subject: subject.replace(/[\r\n]+/g, ' ').slice(0, 200), html }, undefined, {
    category: 'transactional',
    attachments: ics ? [{ name: 'session.ics', content_type: 'text/calendar', data: Buffer.from(ics).toString('base64') }] : undefined,
  }).catch((e) => console.error('[mentors] email failed', (e as Error)?.message))
}

const link = (href: string, label: string) => `<a href="${escapeHtml(href)}" style="color:${BLUE}">${escapeHtml(label)}</a>`

/** After payment: the mentor gets an invite for every booked mentor session. */
export async function onSessionsBooked(order: OrderDoc, lines: OrderLineDoc[]): Promise<void> {
  for (const l of lines) {
    const b = l.fulfilment.booking
    if (!b) continue
    const mentor = await getMentorBySeller(l.seller_id)
    if (!mentor) continue // not a mentor offering — the seller flow already notifies
    const seller = await getSellerById(l.seller_id)
    const to = seller?.contact_email || (await userEmail(mentor.user_id))
    const tz = mentor.availability.timezone
    const locale = await localeForRecipient({ userId: mentor.user_id, email: to })
    const t = outboundT('email', locale)
    const sessions = `${getAppOrigin()}/dashboard/mentor?tab=sessions`
    await sendWithIcs(to, t('mentor.mail.booked.subject', { title: l.title }), sessionEmail(t('mentor.mail.booked.heading'), `<p><strong>${escapeHtml(l.title)}</strong><br>${escapeHtml(when(locale, b.start, tz))}</p><p>${escapeHtml(t(b.join_url ? 'mentor.mail.booked.joinStudio' : 'mentor.mail.booked.shareLink'))}</p><p>${link(sessions, t('mentor.mail.openSessions'))}</p><p>${escapeHtml(t('mkt.mail.icsAttached'))}</p>`, t), bookingIcs(order, l))
    await notify({ user_id: mentor.user_id, type: 'mentor.session_booked', title: 'New mentoring session', message: `${l.title.slice(0, 80)} — ${when('en', b.start, tz)}`, title_i18n: { key: 'mentor.booked.title' }, message_i18n: { key: 'mentor.booked.message', params: { title: l.title.slice(0, 80), when: when(locale, b.start, tz) } }, link: '/dashboard/mentor?tab=sessions', icon: 'calendar' }).catch(() => null)
  }
}

export async function onSessionRescheduled(order: OrderDoc, line: OrderLineDoc, fromIso: string): Promise<void> {
  const b = line.fulfilment.booking
  if (!b) return
  const ics = bookingIcs(order, line)
  const orderLink = `${getAppOrigin()}/dashboard/orders/${order.id}`
  {
    const locale = await localeForRecipient({ userId: order.buyer_id, email: order.buyer_email })
    const t = outboundT('email', locale)
    await sendWithIcs(order.buyer_email, t('mentor.mail.rescheduled.subject', { title: line.title }), sessionEmail(t('mentor.mail.rescheduled.headingLearner'), `<p><strong>${escapeHtml(line.title)}</strong><br>${escapeHtml(t('mentor.mail.newTime', { when: when(locale, b.start, order.buyer_tz) }))}<br><span style="color:#475569">${escapeHtml(t('mentor.mail.was', { when: when(locale, fromIso, order.buyer_tz) }))}</span></p><p>${link(orderLink, t('mkt.mail.viewBooking'))}</p><p>${escapeHtml(t('mentor.mail.updatedIcs'))}</p>`, t), ics)
  }
  const mentor = await getMentorBySeller(line.seller_id)
  if (!mentor) return
  const seller = await getSellerById(line.seller_id)
  const tz = mentor.availability.timezone
  const to = seller?.contact_email || (await userEmail(mentor.user_id))
  const locale = await localeForRecipient({ userId: mentor.user_id, email: to })
  const t = outboundT('email', locale)
  await sendWithIcs(to, t('mentor.mail.rescheduled.subject', { title: line.title }), sessionEmail(t('mentor.mail.rescheduled.headingMentor'), `<p><strong>${escapeHtml(line.title)}</strong><br>${escapeHtml(t('mentor.mail.newTime', { when: when(locale, b.start, tz) }))}<br><span style="color:#475569">${escapeHtml(t('mentor.mail.was', { when: when(locale, fromIso, tz) }))}</span></p><p>${escapeHtml(t('mentor.mail.updatedIcs'))}</p>`, t), ics)
  await notify({ user_id: mentor.user_id, type: 'mentor.session_rescheduled', title: 'Session rescheduled', message: `${line.title.slice(0, 80)} — now ${when('en', b.start, tz)}`, title_i18n: { key: 'mentor.rescheduled.title' }, message_i18n: { key: 'mentor.rescheduled.message', params: { title: line.title.slice(0, 80), when: when(locale, b.start, tz) } }, link: '/dashboard/mentor?tab=sessions', icon: 'calendar' }).catch(() => null)
}
