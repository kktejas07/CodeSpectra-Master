/**
 * Buyer e-mails for the marketplace (order confirmation, payment failed, shipped, booking
 * confirmation / reminder, download ready, refund processed). Every value is HTML-escaped;
 * every mail carries a "manage e-mail preferences" link. Sent through lib/send-email, in
 * the buyer's saved interface language (lib/i18n/recipient, catalog keys `mkt.mail.*`).
 * `sendShippedEmail` is exported for the seller part's fulfilment flow.
 */
import 'server-only'
import { escapeHtml } from '@/lib/safe-html'
import { getAppOrigin } from '@/lib/app-origin'
import { sendEmail } from '@/lib/send-email'
import { buildIcs } from '@/lib/calendar/ics'
import { outboundT, type OutboundTranslator } from '@/lib/i18n/outbound'
import { localeForRecipient } from '@/lib/i18n/recipient'
import { LOCALE_META, type Locale } from '@/lib/i18n/config'
import { formatMinor } from './pricing'
import type { OrderDoc, OrderLineDoc } from './order-doc'

const BLUE = '#2F5BE7'

interface Mail { t: OutboundTranslator; locale: Locale }

async function mailFor(o: { buyer_id?: string | null; buyer_email?: string | null }): Promise<Mail> {
  const locale = await localeForRecipient({ userId: o.buyer_id ?? null, email: o.buyer_email ?? null })
  return { t: outboundT('email', locale), locale }
}

/** Plain-text subject (no line breaks). */
const subj = (s: string) => s.replace(/[\r\n]+/g, ' ').slice(0, 200)

function layout(m: Mail, title: string, body: string): string {
  const origin = getAppOrigin()
  return `<div style="background:#f3f5fb;padding:32px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden">
<tr><td style="background:${BLUE};padding:20px 28px;color:#ffffff;font-size:17px;font-weight:700">${escapeHtml(m.t('mkt.mail.brand'))}</td></tr>
<tr><td style="padding:28px;color:#0f1729;font-size:15px;line-height:1.6"><h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(title)}</h1>${body}</td></tr>
<tr><td style="padding:16px 28px 24px;border-top:1px solid #e2e8f0;font-size:12px;color:#475569">
${escapeHtml(m.t('mkt.mail.why'))} <a href="${origin}/dashboard/notifications/preferences" style="color:${BLUE}">${escapeHtml(m.t('mkt.mail.manage'))}</a>.
</td></tr></table></div>`
}

const button = (href: string, label: string) =>
  `<p style="margin:22px 0"><a href="${escapeHtml(href)}" style="background:${BLUE};color:#ffffff;text-decoration:none;font-weight:600;padding:11px 22px;border-radius:999px;display:inline-block">${escapeHtml(label)}</a></p>`

function linesTable(m: Mail, order: OrderDoc, lines: OrderLineDoc[] = order.lines): string {
  const rows = lines.map((l) => `<tr><td style="padding:6px 0">${escapeHtml(`${l.qty} × ${l.title}${l.variant_name ? ` (${l.variant_name})` : ''}`)}</td><td style="padding:6px 0;text-align:right;white-space:nowrap">${escapeHtml(formatMinor((l.gross ?? l.unit_price * l.qty), order.currency))}</td></tr>`).join('')
  const row = (k: string, v: number, bold = false) => `<tr><td style="padding:4px 0;color:#475569${bold ? ';font-weight:700;color:#0f1729' : ''}">${k}</td><td style="padding:4px 0;text-align:right${bold ? ';font-weight:700' : ''}">${escapeHtml(formatMinor(v, order.currency))}</td></tr>`
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;border-top:1px solid #e2e8f0;margin-top:8px">${rows}
${row(escapeHtml(m.t('mkt.mail.subtotal')), order.subtotal)}${order.discount_total ? row(escapeHtml(m.t('mkt.mail.discount')), -order.discount_total) : ''}${order.shipping_total ? row(escapeHtml(m.t('mkt.mail.shipping')), order.shipping_total) : ''}${order.tax_total ? row(escapeHtml(m.t(order.prices_include_tax ? (order.currency === 'INR' ? 'mkt.mail.includesGst' : 'mkt.mail.includesTax') : (order.currency === 'INR' ? 'mkt.mail.gst' : 'mkt.mail.salesTax'))), order.tax_total) : ''}${row(escapeHtml(m.t('mkt.mail.total')), order.grand_total, true)}</table>`
}

const orderUrl = (o: OrderDoc) => `${getAppOrigin()}/dashboard/orders/${o.id}`

function when(locale: Locale, iso: string, tz?: string | null): string {
  try {
    return new Intl.DateTimeFormat(LOCALE_META[locale].intl, { dateStyle: 'full', timeStyle: 'short', timeZone: tz || 'UTC', timeZoneName: 'short' }).format(new Date(iso))
  } catch {
    return new Date(iso).toUTCString()
  }
}

async function send(to: string, subject: string, html: string, attachments?: { name: string; content_type: string; data: string }[]) {
  if (!to) return
  await sendEmail(to, { subject, html }, undefined, { category: 'transactional', attachments }).catch((e) => console.error('[marketplace] email failed', (e as Error)?.message))
}

export async function sendOrderConfirmation(o: OrderDoc) {
  const m = await mailFor(o)
  const n = { number: o.number }
  await send(o.buyer_email, subj(m.t('mkt.mail.confirmed.subject', n)), layout(m, m.t('mkt.mail.confirmed.heading', n), `<p>${escapeHtml(m.t('mkt.mail.confirmed.body'))}</p>${linesTable(m, o)}${button(orderUrl(o), m.t('mkt.mail.viewOrder'))}`))
}

export async function sendPaymentFailed(o: OrderDoc) {
  const m = await mailFor(o)
  await send(o.buyer_email, subj(m.t('mkt.mail.failed.subject', { number: o.number })), layout(m, m.t('mkt.mail.failed.heading'), `<p>${escapeHtml(m.t('mkt.mail.failed.body', { number: o.number }))}</p>${button(`${getAppOrigin()}/marketplace/cart`, m.t('mkt.mail.backToCart'))}`))
}

export async function sendShippedEmail(o: OrderDoc, line: OrderLineDoc) {
  const m = await mailFor(o)
  const f = line.fulfilment
  const track = f.tracking_url ? button(f.tracking_url, m.t('mkt.mail.track')) : ''
  const body = f.carrier ? m.t('mkt.mail.shipped.bodyCarrier', { title: line.title, number: o.number, carrier: f.carrier }) : m.t('mkt.mail.shipped.body', { title: line.title, number: o.number })
  await send(o.buyer_email, subj(m.t('mkt.mail.shipped.subject', { title: line.title })), layout(m, m.t('mkt.mail.shipped.heading'), `<p>${escapeHtml(body)}</p>${f.tracking_no ? `<p>${escapeHtml(m.t('mkt.mail.trackingNo'))} <strong>${escapeHtml(f.tracking_no)}</strong></p>` : ''}${track}${button(orderUrl(o), m.t('mkt.mail.viewOrder'))}`))
}

export function bookingIcs(o: OrderDoc, line: OrderLineDoc): string | null {
  const b = line.fulfilment.booking
  if (!b) return null
  return buildIcs([{ title: line.title, start: b.start, end: b.end, description: `CodeSpectra order ${o.number}`, url: b.join_url || orderUrl(o), location: b.join_url || undefined, uid: `mkt-${o.id}-${line.id}@codespectra` }], 'CodeSpectra bookings')
}

export async function sendBookingConfirmation(o: OrderDoc, line: OrderLineDoc, buyerTz?: string | null) {
  const b = line.fulfilment.booking
  if (!b) return
  const m = await mailFor(o)
  const ics = bookingIcs(o, line)
  const join = b.join_url ? button(b.join_url, m.t('mkt.mail.joinLink')) : `<p>${escapeHtml(m.t('mkt.mail.booked.linkLater'))}</p>`
  await send(o.buyer_email, subj(m.t('mkt.mail.booked.subject', { title: line.title })), layout(m, m.t('mkt.mail.booked.heading'), `<p><strong>${escapeHtml(line.title)}</strong><br>${escapeHtml(when(m.locale, b.start, buyerTz))}</p>${join}<p>${escapeHtml(m.t('mkt.mail.icsAttached'))}</p>${button(orderUrl(o), m.t('mkt.mail.viewBooking'))}`),
    ics ? [{ name: 'booking.ics', content_type: 'text/calendar', data: Buffer.from(ics).toString('base64') }] : undefined)
}

export async function sendBookingReminder(to: string, o: Pick<OrderDoc, 'id' | 'number'> & { buyer_id?: string | null }, title: string, start: string, joinUrl?: string | null) {
  const m = await mailFor({ buyer_id: o.buyer_id, buyer_email: to })
  await send(to, subj(m.t('mkt.mail.reminder.subject', { title })), layout(m, m.t('mkt.mail.reminder.heading'), `<p>${escapeHtml(m.t('mkt.mail.reminder.body', { title, when: when(m.locale, start) }))}</p>${joinUrl ? button(joinUrl, m.t('mkt.mail.joinSession')) : ''}${button(`${getAppOrigin()}/dashboard/orders/${o.id}`, m.t('mkt.mail.viewBooking'))}`))
}

export async function sendDownloadReady(o: OrderDoc, lines: OrderLineDoc[]) {
  const m = await mailFor(o)
  await send(o.buyer_email, subj(m.t('mkt.mail.downloads.subject', { number: o.number })), layout(m, m.t('mkt.mail.downloads.heading'), `<p>${lines.map((l) => escapeHtml(l.title)).join('<br>')}</p><p>${escapeHtml(m.t('mkt.mail.downloads.body'))}</p>${button(orderUrl(o), m.t('mkt.mail.goToDownloads'))}`))
}

export async function sendRefundProcessed(o: OrderDoc, amount: number, lines: OrderLineDoc[]) {
  const m = await mailFor(o)
  const money = formatMinor(amount, o.currency)
  await send(o.buyer_email, subj(m.t('mkt.mail.refund.subject', { amount: money })), layout(m, m.t('mkt.mail.refund.heading'), `<p>${escapeHtml(m.t('mkt.mail.refund.body', { amount: money, items: lines.map((l) => l.title).join(', '), number: o.number }))}</p>${button(orderUrl(o), m.t('mkt.mail.viewOrder'))}`))
}
