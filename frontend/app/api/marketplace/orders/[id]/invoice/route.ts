/** GET /api/marketplace/orders/[id]/invoice — printable HTML tax invoice (paid orders, owner only). */
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import type { IdRouteContext } from '@/lib/app-route-context'
import { getBuyerOrder } from '@/lib/marketplace/orders'
import { buildInvoiceHtml } from '@/lib/marketplace/invoice'
import { sellersCol } from '@/lib/marketplace/db'
import { sellerInvoiceGstin } from '@/lib/marketplace/sellers'
import { PRINT_PAGE_CSP } from '@/lib/csp/print-page'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: IdRouteContext) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { id } = await params
  const order = await getBuyerOrder(gate.user.id, id)
  if (!order || order.status === 'pending_payment' || order.payment.status === 'pending' || order.payment.status === 'failed') {
    return NextResponse.json({ error: 'Invoice not available', code: 'mkt_invoice_unavailable' }, { status: 404 })
  }
  const ids = [...new Set(order.lines.map((l) => l.seller_id))]
  const rows = await (await sellersCol()).find({ id: { $in: ids } }, { projection: { _id: 0, id: 1, display_name: 1, kyc: 1, kyc_secret: 1 } }).toArray()
  // A GST tax invoice must show the supplier's FULL GSTIN (only here; masked everywhere else).
  const sellers = Object.fromEntries(await Promise.all(rows.map(async (s) => [s.id, { name: s.display_name, gstin: await sellerInvoiceGstin(s) }] as const)))
  const html = buildInvoiceHtml(order, sellers, {
    name: process.env.MKT_INVOICE_LEGAL_NAME || 'CodeSpectra',
    address: process.env.MKT_INVOICE_ADDRESS || undefined,
    gstin: process.env.MKT_INVOICE_GSTIN || null,
  })
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex', 'Content-Security-Policy': PRINT_PAGE_CSP } })
}
