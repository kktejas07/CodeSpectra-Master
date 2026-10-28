/**
 * Seller / admin notifications for the marketplace: in-app (lib/notifications),
 * email (honours the per-type and email-channel opt-outs, always carries a
 * manage/unsubscribe link) and WhatsApp only when the seller opted in.
 * Never throws; no PII in logs. Text goes out in the recipient's saved
 * language when the caller passes catalog keys (`i18n`, notify namespace);
 * the email chrome is always localized (email namespace, `mkt.mail.*`).
 */
import { escapeHtml } from '@/lib/safe-html'
import { outboundT, type OutboundText } from '@/lib/i18n/outbound'
import type { Locale } from '@/lib/i18n/config'
import type { Order } from './contract'
import type { ProductDoc, SellerDoc } from './db'

export const LOW_STOCK_DEFAULT = 5
const PREFS_PATH = '/dashboard/notifications/preferences'

const base = () => process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

/** Catalog keys for a seller / admin message (notify namespace), rendered per recipient. */
export interface NotifyI18n { title: OutboundText; message: OutboundText | OutboundText[] }

/** Pure: the email HTML (exported for tests). */
export function marketplaceEmail(title: string, message: string, link: string | null, locale: Locale = 'en'): { subject: string; html: string } {
  const b = base()
  const t = outboundT('email', locale)
  const cta = link ? `<p style="margin:24px 0"><a href="${escapeHtml(b + link)}" style="background:#2F5BE7;color:#ffffff;padding:11px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">${escapeHtml(t('mkt.mail.open'))}</a></p>` : ''
  return {
    subject: title.replace(/[\r\n]+/g, ' ').slice(0, 200),
    html: `<div style="background:#f3f4f6;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
<div style="max-width:580px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:28px 32px;color:#111827;font-size:15px;line-height:1.7">
<h1 style="font-size:19px;margin:0 0 16px;font-weight:700">${escapeHtml(title)}</h1><p style="margin:0 0 14px">${escapeHtml(message)}</p>${cta}
<p style="margin:24px 0 0;font-size:12px;color:#6b7280">${escapeHtml(t('mkt.mail.brand'))}. <a href="${escapeHtml(b + PREFS_PATH)}" style="color:#6b7280">${escapeHtml(t('mkt.mail.unsubscribe'))}</a>.</p></div></div>`,
  }
}

async function emailAllowed(userId: string, type: string): Promise<boolean> {
  try {
    const { getMongoDb } = await import('@/lib/mongodb')
    const col = (await getMongoDb()).collection('notification_preferences')
    const [t, ch] = await Promise.all([col.findOne({ user_id: userId, type }), col.findOne({ user_id: userId, type: 'email' })])
    return t?.enabled !== false && ch?.enabled !== false
  } catch {
    return false
  }
}

async function userEmail(userId: string): Promise<string | null> {
  try {
    const { getMongoDb } = await import('@/lib/mongodb')
    const u = await (await getMongoDb()).collection('user').findOne({ $or: [{ id: userId }, { _id: userId as never }] }, { projection: { email: 1 } })
    return typeof u?.email === 'string' ? u.email : null
  } catch {
    return null
  }
}

async function deliver(userId: string, to: string | null, type: string, title: string, message: string, link: string | null, i18n?: NotifyI18n) {
  const { notify, notificationText } = await import('@/lib/notifications')
  const keys = i18n ? { title_i18n: i18n.title, message_i18n: i18n.message } : {}
  await notify({ user_id: userId, type, title, message, link: link || undefined, icon: 'store', ...keys })
  if (to && (await emailAllowed(userId, type))) {
    const [{ sendEmail }, { localeForUser }] = await Promise.all([import('@/lib/send-email'), import('@/lib/i18n/recipient')])
    const locale = await localeForUser(userId)
    const text = notificationText({ type, title, message, ...keys }, locale)
    await sendEmail(to, marketplaceEmail(text.title, text.message, link, locale), undefined, { category: 'transactional' }).catch(() => {})
  }
}

export async function notifySeller(seller: SellerDoc, type: string, title: string, message: string, link: string | null, i18n?: NotifyI18n): Promise<void> {
  try {
    if (seller.is_platform) return void (await notifyAdmins(type, title, message, link, i18n))
    await deliver(seller.user_id, seller.contact_email || (await userEmail(seller.user_id)), type, title, message, link, i18n)
    if (seller.whatsapp_opt_in && seller.phone) {
      // Opt-in, STOP opt-outs and the official channel: lib/whatsapp-send (AUTO-060).
      const { sendWhatsAppWithOptIn } = await import('@/lib/whatsapp-send')
      await sendWhatsAppWithOptIn(seller.phone, true, { kind: 'marketplace', title, text: message.slice(0, 900), link: link ? `${base()}${link}` : '' }).catch(() => null)
    }
  } catch (e) {
    console.error('[marketplace] seller notify failed:', type, (e as Error)?.message)
  }
}

export async function notifyAdmins(type: string, title: string, message: string, link: string | null, i18n?: NotifyI18n): Promise<void> {
  try {
    const { getMongoDb } = await import('@/lib/mongodb')
    const admins = await (await getMongoDb()).collection('user').find({ role: 'superadmin' }, { projection: { id: 1, _id: 1, email: 1 } }).limit(50).toArray()
    for (const a of admins) await deliver(String(a.id || a._id), typeof a.email === 'string' ? a.email : null, type, title, message, link, i18n)
  } catch (e) {
    console.error('[marketplace] admin notify failed:', type, (e as Error)?.message)
  }
}

/** Pure: is a physical product low on stock? (any tracked variant or the product stock ≤ threshold) */
export function isLowStock(p: Pick<ProductDoc, 'kind' | 'stock' | 'variants' | 'low_stock_threshold'>): boolean {
  if (p.kind !== 'physical') return false
  const th = p.low_stock_threshold ?? LOW_STOCK_DEFAULT
  const tracked = p.variants?.length ? p.variants.map((v) => v.stock) : [p.stock]
  return tracked.some((s) => typeof s === 'number' && s <= th)
}

export async function checkLowStock(productIds: string[]): Promise<void> {
  if (!productIds.length) return
  const { productsCol, nowIso } = await import('./db')
  const { getSellerById } = await import('./sellers')
  const col = await productsCol()
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString()
  for (const p of await col.find({ id: { $in: productIds }, kind: 'physical' }, { projection: { _id: 0 } }).toArray()) {
    if (!isLowStock(p)) continue
    // Once a day per product at most (claim before sending).
    const claim = await col.updateOne({ id: p.id, $or: [{ low_stock_notified_at: null }, { low_stock_notified_at: { $exists: false } }, { low_stock_notified_at: { $lt: dayAgo } }] }, { $set: { low_stock_notified_at: nowIso() } })
    if (!claim.modifiedCount) continue
    const seller = await getSellerById(p.seller_id)
    if (seller) {
      await notifySeller(seller, 'mkt.low_stock', `Low stock: ${p.title.slice(0, 80)}`, 'Restock soon so buyers can keep ordering.', `/dashboard/seller?tab=products&edit=${p.id}`,
        { title: { key: 'mkt.seller.lowStock.title', params: { title: p.title.slice(0, 80) } }, message: { key: 'mkt.seller.lowStock.message' } })
    }
  }
}

/** Called once per newly recorded sale line (ledger.recordSale). */
export async function onSaleRecorded(order: Order, newLineIds: string[]): Promise<void> {
  const { getSellerById } = await import('./sellers')
  const bySeller = new Map<string, Order['lines']>()
  for (const l of order.lines) if (newLineIds.includes(l.id)) bySeller.set(l.seller_id, [...(bySeller.get(l.seller_id) ?? []), l])
  for (const [sid, lines] of bySeller) {
    const seller = await getSellerById(sid)
    if (!seller) continue
    const needsAction = lines.some((l) => l.kind === 'physical' || l.kind === 'service')
    const items = lines.map((l) => l.title).join(', ').slice(0, 200)
    await notifySeller(seller, 'mkt.new_order', `New order ${order.number}`,
      `${lines.length} item${lines.length > 1 ? 's' : ''}: ${items}.${needsAction ? ' It needs your attention.' : ''}`,
      '/dashboard/seller?tab=orders',
      {
        title: { key: 'mkt.seller.newOrder.title', params: { number: order.number } },
        message: [{ key: 'mkt.seller.newOrder.message', params: { count: lines.length, items } }, ...(needsAction ? [{ key: 'mkt.seller.newOrder.action' }] : [])],
      })
  }
  await checkLowStock([...new Set(order.lines.filter((l) => l.kind === 'physical' && newLineIds.includes(l.id)).map((l) => l.product_id))])
}
