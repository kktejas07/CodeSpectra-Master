/**
 * Mentor session messages: calendar invite (.ics) to the mentor when a session is booked,
 * and updated invites to both sides when the learner reschedules. Same UID as the buyer's
 * booking invite (lib/marketplace/emails.ts bookingIcs) so calendars update in place.
 * Every e-mail carries the preferences / unsubscribe link (transactional booking mail).
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

const BLUE = '#2F5BE7'

export function sessionEmail(title: string, body: string): string {
  const origin = getAppOrigin()
  return `<div style="background:#f3f5fb;padding:32px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden">
<tr><td style="background:${BLUE};padding:20px 28px;color:#ffffff;font-size:17px;font-weight:700">CodeSpectra mentors</td></tr>
<tr><td style="padding:28px;color:#0f1729;font-size:15px;line-height:1.6"><h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(title)}</h1>${body}</td></tr>
<tr><td style="padding:16px 28px 24px;border-top:1px solid #e2e8f0;font-size:12px;color:#475569">
You get this e-mail because of a mentoring session on CodeSpectra. <a href="${origin}/dashboard/notifications/preferences" style="color:${BLUE}">Manage e-mail preferences or unsubscribe</a>.
</td></tr></table></div>`
}

function when(iso: string, tz?: string | null): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { dateStyle: 'full', timeStyle: 'short', timeZone: tz || 'UTC', timeZoneName: 'short' }).format(new Date(iso))
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
  await sendEmail(to, { subject, html }, undefined, {
    category: 'transactional',
    attachments: ics ? [{ name: 'session.ics', content_type: 'text/calendar', data: Buffer.from(ics).toString('base64') }] : undefined,
  }).catch((e) => console.error('[mentors] email failed', (e as Error)?.message))
}

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
    const link = `${getAppOrigin()}/dashboard/mentor?tab=sessions`
    await sendWithIcs(to, `New session booked: ${l.title}`, sessionEmail('A learner booked a session', `<p><strong>${escapeHtml(l.title)}</strong><br>${escapeHtml(when(b.start, tz))}</p><p>${b.join_url ? 'Join from your mentor studio when the session starts.' : 'Share the meeting link with the learner from your seller dashboard.'}</p><p><a href="${escapeHtml(link)}" style="color:${BLUE}">Open your sessions</a></p><p>A calendar invite (.ics) is attached.</p>`), bookingIcs(order, l))
    await notify({ user_id: mentor.user_id, type: 'mentor.session_booked', title: 'New mentoring session', message: `${l.title.slice(0, 80)} — ${when(b.start, tz)}`, title_i18n: { key: 'mentor.booked.title' }, message_i18n: { key: 'mentor.booked.message', params: { title: l.title.slice(0, 80), when: when(b.start, tz) } }, link: '/dashboard/mentor?tab=sessions', icon: 'calendar' }).catch(() => null)
  }
}

export async function onSessionRescheduled(order: OrderDoc, line: OrderLineDoc, fromIso: string): Promise<void> {
  const b = line.fulfilment.booking
  if (!b) return
  const ics = bookingIcs(order, line)
  const orderLink = `${getAppOrigin()}/dashboard/orders/${order.id}`
  await sendWithIcs(order.buyer_email, `Rescheduled: ${line.title}`, sessionEmail('Your session has a new time', `<p><strong>${escapeHtml(line.title)}</strong><br>New time: ${escapeHtml(when(b.start, order.buyer_tz))}<br><span style="color:#475569">Was: ${escapeHtml(when(fromIso, order.buyer_tz))}</span></p><p><a href="${escapeHtml(orderLink)}" style="color:${BLUE}">View your booking</a></p><p>An updated calendar invite is attached.</p>`), ics)
  const mentor = await getMentorBySeller(line.seller_id)
  if (!mentor) return
  const seller = await getSellerById(line.seller_id)
  const tz = mentor.availability.timezone
  await sendWithIcs(seller?.contact_email || (await userEmail(mentor.user_id)), `Rescheduled: ${line.title}`, sessionEmail('A learner moved their session', `<p><strong>${escapeHtml(line.title)}</strong><br>New time: ${escapeHtml(when(b.start, tz))}<br><span style="color:#475569">Was: ${escapeHtml(when(fromIso, tz))}</span></p><p>An updated calendar invite is attached.</p>`), ics)
  await notify({ user_id: mentor.user_id, type: 'mentor.session_rescheduled', title: 'Session rescheduled', message: `${line.title.slice(0, 80)} — now ${when(b.start, tz)}`, title_i18n: { key: 'mentor.rescheduled.title' }, message_i18n: { key: 'mentor.rescheduled.message', params: { title: line.title.slice(0, 80), when: when(b.start, tz) } }, link: '/dashboard/mentor?tab=sessions', icon: 'calendar' }).catch(() => null)
}
