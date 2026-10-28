/**
 * Admin marketplace reports (GMV, commission earned, refunds, top sellers /
 * products) over a date range, plus CSV export (pure toCsv, unit tested).
 */
import type { Currency } from './contract'

const SOLD = ['paid', 'partially_fulfilled', 'fulfilled', 'partially_refunded', 'refunded']

export interface ReportRange { from: string; to: string }

export function parseRange(fromRaw: string | null, toRaw: string | null, now = new Date()): ReportRange {
  const ok = (s: string | null) => !!s && /^\d{4}-\d{2}-\d{2}/.test(s) && !Number.isNaN(Date.parse(s))
  const to = ok(toRaw) ? new Date(Date.parse(toRaw!) + (toRaw!.length === 10 ? 86_400_000 - 1 : 0)) : now
  const from = ok(fromRaw) ? new Date(fromRaw!) : new Date(to.getTime() - 30 * 86_400_000)
  return { from: from.toISOString(), to: to.toISOString() }
}

/** Pure: RFC 4180 CSV; cells starting with = + - @ are prefixed to stop spreadsheet formula injection. */
export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  const cols = columns ?? [...new Set(rows.flatMap((r) => Object.keys(r)))]
  const cell = (v: unknown) => {
    let s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\r\n')
}

export async function buildReport(range: ReportRange) {
  const { ordersCol, ledgerCol, sellersCol } = await import('./db')
  const orders = await ordersCol()
  const ledger = await ledgerCol()
  const inRange = { $gte: range.from, $lte: range.to }
  const [gmv, commission, refunds, topSellers, topProducts] = await Promise.all([
    orders.aggregate<{ _id: Currency; gmv: number; orders: number; tax: number; shipping: number }>([
      { $match: { status: { $in: SOLD }, created_at: inRange } },
      { $group: { _id: '$currency', gmv: { $sum: '$grand_total' }, orders: { $sum: 1 }, tax: { $sum: '$tax_total' }, shipping: { $sum: '$shipping_total' } } },
    ]).toArray(),
    ledger.aggregate<{ _id: Currency; amount: number }>([
      { $match: { seller_id: null, type: 'commission', created_at: inRange } },
      { $group: { _id: '$currency', amount: { $sum: '$amount' } } },
    ]).toArray(),
    ledger.aggregate<{ _id: Currency; amount: number; count: number }>([
      { $match: { type: 'refund', created_at: inRange } },
      { $group: { _id: '$currency', amount: { $sum: { $multiply: ['$amount', -1] } }, count: { $sum: 1 } } },
    ]).toArray(),
    ledger.aggregate<{ _id: { seller: string; currency: Currency }; sales: number; lines: number }>([
      { $match: { type: 'sale', seller_id: { $ne: null }, created_at: inRange } },
      { $group: { _id: { seller: '$seller_id', currency: '$currency' }, sales: { $sum: '$amount' }, lines: { $sum: 1 } } },
      { $sort: { sales: -1 } }, { $limit: 20 },
    ]).toArray(),
    orders.aggregate<{ _id: { product: string; currency: Currency }; title: string; units: number; revenue: number }>([
      { $match: { status: { $in: SOLD }, created_at: inRange } },
      { $unwind: '$lines' },
      { $group: { _id: { product: '$lines.product_id', currency: '$currency' }, title: { $first: '$lines.title' }, units: { $sum: '$lines.qty' }, revenue: { $sum: '$lines.line_total' } } },
      { $sort: { revenue: -1 } }, { $limit: 20 },
    ]).toArray(),
  ])
  const names = new Map((await (await sellersCol()).find({ id: { $in: topSellers.map((s) => s._id.seller) } }, { projection: { id: 1, display_name: 1 } }).toArray()).map((s) => [s.id, s.display_name]))
  return {
    range,
    totals: gmv.map((g) => ({
      currency: g._id, gmv: g.gmv, orders: g.orders, tax: g.tax, shipping: g.shipping,
      commission: commission.find((c) => c._id === g._id)?.amount ?? 0,
      refunds: refunds.find((r) => r._id === g._id)?.amount ?? 0,
    })),
    top_sellers: topSellers.map((s) => ({ seller_id: s._id.seller, name: names.get(s._id.seller) ?? s._id.seller, currency: s._id.currency, sales: s.sales, lines: s.lines })),
    top_products: topProducts.map((p) => ({ product_id: p._id.product, title: p.title, currency: p._id.currency, units: p.units, revenue: p.revenue })),
  }
}

export async function reportCsv(range: ReportRange, kind: 'summary' | 'sellers' | 'products' | 'orders'): Promise<string> {
  if (kind === 'orders') {
    const { ordersCol } = await import('./db')
    const rows = await (await ordersCol()).find({ created_at: { $gte: range.from, $lte: range.to } }, { projection: { _id: 0, number: 1, created_at: 1, status: 1, currency: 1, subtotal: 1, shipping_total: 1, tax_total: 1, discount_total: 1, grand_total: 1, 'payment.gateway': 1, 'payment.status': 1 } }).sort({ created_at: -1 }).limit(20_000).toArray()
    return toCsv(rows.map((o) => ({ number: o.number, created_at: o.created_at, status: o.status, currency: o.currency, subtotal: o.subtotal, shipping: o.shipping_total, tax: o.tax_total, discount: o.discount_total, total: o.grand_total, gateway: o.payment?.gateway, payment_status: o.payment?.status })))
  }
  const r = await buildReport(range)
  if (kind === 'sellers') return toCsv(r.top_sellers)
  if (kind === 'products') return toCsv(r.top_products)
  return toCsv(r.totals)
}
