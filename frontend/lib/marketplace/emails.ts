/**
 * Buyer e-mails for the marketplace (order confirmation, payment failed, shipped, booking
 * confirmation / reminder, download ready, refund processed). Every value is HTML-escaped;
 * every mail carries a "manage e-mail preferences" link. Sent through lib/send-email.
 * `sendShippedEmail` is exported for the seller part's fulfilment flow.
 */
import 'server-only'
import { escapeHtml } from '@/lib/safe-html'
import { getAppOrigin } from '@/lib/app-origin'
import { sendEmail } from '@/lib/send-email'
import { buildIcs } from '@/lib/calendar/ics'
import { formatMinor } from './pricing'
import type { OrderDoc, OrderLineDoc } from './order-doc'

const BLUE = '#2F5BE7'

function layout(title: string, body: string): string {
  const origin = getAppOrigin()
  return `<div style="background:#f3f5fb;padding:32px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden">
<tr><td style="background:${BLUE};padding:20px 28px;color:#ffffff;font-size:17px;font-weight:700">CodeSpectra marketplace</td></tr>
<tr><td style="padding:28px;color:#0f1729;font-size:15px;line-height:1.6"><h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(title)}</h1>${body}</td></tr>
<tr><td style="padding:16px 28px 24px;border-top:1px solid #e2e8f0;font-size:12px;color:#475569">
You get this e-mail because of an order on CodeSpectra. <a href="${origin}/dashboard/notifications/preferences" style="color:${BLUE}">Manage e-mail preferences or unsubscribe</a>.
</td></tr></table></div>`
}

const button = (href: string, label: string) =>
  `<p style="margin:22px 0"><a href="${escapeHtml(href)}" style="background:${BLUE};color:#ffffff;text-decoration:none;font-weight:600;padding:11px 22px;border-radius:999px;display:inline-block">${escapeHtml(label)}</a></p>`

function linesTable(order: OrderDoc, lines: OrderLineDoc[] = order.lines): string {
  const rows = lines.map((l) => `<tr><td style="padding:6px 0">${escapeHtml(`${l.qty} × ${l.title}${l.variant_name ? ` (${l.variant_name})` : ''}`)}</td><td style="padding:6px 0;text-align:right;white-space:nowrap">${escapeHtml(formatMinor((l.gross ?? l.unit_price * l.qty), order.currency))}</td></tr>`).join('')
  const row = (k: string, v: number, bold = false) => `<tr><td style="padding:4px 0;color:#475569${bold ? ';font-weight:700;color:#0f1729' : ''}">${k}</td><td style="padding:4px 0;text-align:right${bold ? ';font-weight:700' : ''}">${escapeHtml(formatMinor(v, order.currency))}</td></tr>`
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;border-top:1px solid #e2e8f0;margin-top:8px">${rows}
${row('Subtotal', order.subtotal)}${order.discount_total ? row('Discount', -order.discount_total) : ''}${order.shipping_total ? row('Shipping', order.shipping_total) : ''}${order.tax_total ? row(order.prices_include_tax ? (order.currency === 'INR' ? 'Includes GST' : 'Includes tax') : (order.currency === 'INR' ? 'GST' : 'Sales tax'), order.tax_total) : ''}${row('Total', order.grand_total, true)}</table>`
}

const orderUrl = (o: OrderDoc) => `${getAppOrigin()}/dashboard/orders/${o.id}`

function when(iso: string, tz?: string | null): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { dateStyle: 'full', timeStyle: 'short', timeZone: tz || 'UTC', timeZoneName: 'short' }).format(new Date(iso))
  } catch {
    return new Date(iso).toUTCString()
  }
}

async function send(to: string, subject: string, html: string, attachments?: { name: string; content_type: string; data: string }[]) {
  if (!to) return
  await sendEmail(to, { subject, html }, undefined, { category: 'transactional', attachments }).catch((e) => console.error('[marketplace] email failed', (e as Error)?.message))
}

export async function sendOrderConfirmation(o: OrderDoc) {
  await send(o.buyer_email, `Order ${o.number} confirmed`, layout(`Thanks — order ${o.number} is confirmed`, `<p>We received your payment. Here is what you bought:</p>${linesTable(o)}${button(orderUrl(o), 'View your order')}`))
}

export async function sendPaymentFailed(o: OrderDoc) {
  await send(o.buyer_email, `Payment for order ${o.number} did not go through`, layout('Your payment did not go through', `<p>We could not take the payment for order ${escapeHtml(o.number)}, so nothing was charged and the items were released. Your cart is still saved — you can try again any time.</p>${button(`${getAppOrigin()}/marketplace/cart`, 'Back to your cart')}`))
}

export async function sendShippedEmail(o: OrderDoc, line: OrderLineDoc) {
  const f = line.fulfilment
  const track = f.tracking_url ? button(f.tracking_url, 'Track your parcel') : ''
  await send(o.buyer_email, `Shipped: ${line.title}`, layout('Your item is on its way', `<p>${escapeHtml(line.title)} from order ${escapeHtml(o.number)} has shipped${f.carrier ? ` with ${escapeHtml(f.carrier)}` : ''}.</p>${f.tracking_no ? `<p>Tracking number: <strong>${escapeHtml(f.tracking_no)}</strong></p>` : ''}${track}${button(orderUrl(o), 'View your order')}`))
}

export function bookingIcs(o: OrderDoc, line: OrderLineDoc): string | null {
  const b = line.fulfilment.booking
  if (!b) return null
  return buildIcs([{ title: line.title, start: b.start, end: b.end, description: `CodeSpectra order ${o.number}`, url: b.join_url || orderUrl(o), location: b.join_url || undefined, uid: `mkt-${o.id}-${line.id}@codespectra` }], 'CodeSpectra bookings')
}

export async function sendBookingConfirmation(o: OrderDoc, line: OrderLineDoc, buyerTz?: string | null) {
  const b = line.fulfilment.booking
  if (!b) return
  const ics = bookingIcs(o, line)
  const join = b.join_url ? button(b.join_url, 'Join link') : '<p>The host will share the meeting link before the session — it will appear on your order page.</p>'
  await send(o.buyer_email, `Booked: ${line.title}`, layout('Your session is booked', `<p><strong>${escapeHtml(line.title)}</strong><br>${escapeHtml(when(b.start, buyerTz))}</p>${join}<p>A calendar invite (.ics) is attached.</p>${button(orderUrl(o), 'View your booking')}`),
    ics ? [{ name: 'booking.ics', content_type: 'text/calendar', data: Buffer.from(ics).toString('base64') }] : undefined)
}

export async function sendBookingReminder(to: string, o: Pick<OrderDoc, 'id' | 'number'>, title: string, start: string, joinUrl?: string | null) {
  await send(to, `Reminder: ${title} starts soon`, layout('Your session starts soon', `<p><strong>${escapeHtml(title)}</strong> starts ${escapeHtml(when(start))}.</p>${joinUrl ? button(joinUrl, 'Join the session') : ''}${button(`${getAppOrigin()}/dashboard/orders/${o.id}`, 'View your booking')}`))
}

export async function sendDownloadReady(o: OrderDoc, lines: OrderLineDoc[]) {
  await send(o.buyer_email, `Your downloads are ready (order ${o.number})`, layout('Your downloads are ready', `<p>${lines.map((l) => escapeHtml(l.title)).join('<br>')}</p><p>Download links are on your order page. For your security each link works for a few minutes and the number of downloads may be limited.</p>${button(orderUrl(o), 'Go to downloads')}`))
}

export async function sendRefundProcessed(o: OrderDoc, amount: number, lines: OrderLineDoc[]) {
  await send(o.buyer_email, `Refund of ${formatMinor(amount, o.currency)} processed`, layout('Your refund is on its way', `<p>We refunded <strong>${escapeHtml(formatMinor(amount, o.currency))}</strong> for ${lines.map((l) => escapeHtml(l.title)).join(', ')} (order ${escapeHtml(o.number)}). It usually reaches your account in 5–7 working days.</p>${button(orderUrl(o), 'View your order')}`))
}
