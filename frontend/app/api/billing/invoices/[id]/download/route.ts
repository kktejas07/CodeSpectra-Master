import { NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/api-auth'
import type { IdRouteContext } from '@/lib/app-route-context'
import { getUserInvoice } from '@/lib/billing/invoice'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function esc(v: unknown): string {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

/** Printable HTML receipt (save / print as PDF from the browser). */
export async function GET(_req: Request, { params }: IdRouteContext) {
  const { id } = await params
  try {
    const user = await getAPIUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })
    const inv = await getUserInvoice(user.id, id)
    if (!inv) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

    const amount = new Intl.NumberFormat('en-IN', { style: 'currency', currency: inv.currency || 'INR' }).format(inv.amount)
    const date = new Date(inv.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
    const rows: Array<[string, string]> = [
      ['Receipt number', inv.receipt || inv.id],
      ['Date', date],
      ['Billed to', user.email || ''],
      ['Item', inv.description || 'Plan purchase'],
      ['Amount', amount],
      ['Status', inv.status === 'refunded' ? 'Refunded' : 'Paid'],
      ...(inv.refundedAt
        ? [['Refunded on', new Date(inv.refundedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })] as [string, string]]
        : []),
      ...(inv.paymentId ? [['Payment reference', inv.paymentId] as [string, string]] : []),
      ...(inv.paymentMethod ? [['Payment method', inv.paymentMethod] as [string, string]] : []),
    ]
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Receipt ${esc(inv.receipt || inv.id)}</title>
<style>body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#111;background:#fff;max-width:640px;margin:40px auto;padding:0 16px}
h1{font-size:22px;margin:0 0 4px}p{color:#555;margin:0 0 24px}table{width:100%;border-collapse:collapse}
td{padding:10px 0;border-bottom:1px solid #e5e7eb;vertical-align:top}td:first-child{color:#555;width:40%}
.print{margin-top:24px}@media print{.print{display:none}}</style></head><body>
<h1>CodeSpectra receipt</h1><p>${inv.status === 'refunded' ? 'This payment was refunded.' : 'Keep this for your records.'}</p>
<table>${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>
<button class="print" onclick="window.print()">Print or save as PDF</button>
</body></html>`
    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'private, no-store',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'",
      },
    })
  } catch (error) {
    console.error('[CodeSpectra] Invoice download error:', error)
    return NextResponse.json({ error: 'Could not build the receipt' }, { status: 500 })
  }
}
