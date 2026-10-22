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

    const fmt = (minor: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: inv.currency || 'INR' }).format(minor / 100)
    const amount = new Intl.NumberFormat('en-IN', { style: 'currency', currency: inv.currency || 'INR' }).format(inv.amount)
    // GST tax invoice fields (snapshot taken when the number was assigned).
    const tx = inv.tax as null | {
      buyer?: { name?: string; gstin?: string | null; state_code?: string | null; address?: string }
      supplier?: { legal_name?: string; gstin?: string; state_code?: string; address?: string; sac_code?: string; lut_reference?: string }
      tax?: { kind?: string; placeOfSupply?: string | null; taxable?: number; cgst?: number; sgst?: number; igst?: number; rateBps?: number }
    }
    const { GST_STATES } = await import('@/lib/billing/gst')
    const st = (c?: string | null) => (c ? `${GST_STATES[c] ?? ''} (${c})` : '')
    const taxRows: Array<[string, string]> = []
    if (tx?.supplier) {
      taxRows.push(['Supplier', [tx.supplier.legal_name, tx.supplier.address].filter(Boolean).join(', ')])
      if (tx.supplier.gstin) taxRows.push(['Supplier GSTIN', tx.supplier.gstin])
      if (tx.supplier.sac_code) taxRows.push(['SAC', tx.supplier.sac_code])
    }
    if (tx?.buyer?.name) taxRows.push(['Buyer', [tx.buyer.name, tx.buyer.address].filter(Boolean).join(', ')])
    if (tx?.buyer?.gstin) taxRows.push(['Buyer GSTIN', tx.buyer.gstin])
    if (tx?.tax?.kind === 'intra_state' || tx?.tax?.kind === 'inter_state') {
      const half = `${(tx.tax.rateBps ?? 1800) / 200}%`
      taxRows.push(['Place of supply', st(tx.tax.placeOfSupply)])
      taxRows.push(['Taxable value', fmt(tx.tax.taxable ?? 0)])
      if (tx.tax.kind === 'intra_state') {
        taxRows.push([`CGST ${half}`, fmt(tx.tax.cgst ?? 0)], [`SGST ${half}`, fmt(tx.tax.sgst ?? 0)])
      } else taxRows.push([`IGST ${(tx.tax.rateBps ?? 1800) / 100}%`, fmt(tx.tax.igst ?? 0)])
    } else if (tx?.tax?.kind === 'export') {
      taxRows.push(['Tax', `Export of services, zero-rated${tx.supplier?.lut_reference ? ` (LUT ${tx.supplier.lut_reference})` : ''}`])
    }
    const date = new Date(inv.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
    const rows: Array<[string, string]> = [
      ...(inv.invoiceNumber ? [['Invoice number', inv.invoiceNumber] as [string, string]] : [['Receipt number', inv.receipt || inv.id] as [string, string]]),
      ['Date', date],
      ['Billed to', user.email || ''],
      ['Item', inv.description || 'Plan purchase'],
      ...taxRows,
      ['Total (incl. tax)', amount],
      ['Status', inv.status === 'refunded' ? 'Refunded' : 'Paid'],
      ...(inv.refundedAt
        ? [['Refunded on', new Date(inv.refundedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })] as [string, string]]
        : []),
      ...(inv.paymentId ? [['Payment reference', inv.paymentId] as [string, string]] : []),
      ...(inv.paymentMethod ? [['Payment method', inv.paymentMethod] as [string, string]] : []),
    ]
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${inv.invoiceNumber ? 'Tax invoice' : 'Receipt'} ${esc(inv.invoiceNumber || inv.receipt || inv.id)}</title>
<style>body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#111;background:#fff;max-width:640px;margin:40px auto;padding:0 16px}
h1{font-size:22px;margin:0 0 4px}p{color:#555;margin:0 0 24px}table{width:100%;border-collapse:collapse}
td{padding:10px 0;border-bottom:1px solid #e5e7eb;vertical-align:top}td:first-child{color:#555;width:40%}
.print{margin-top:24px}@media print{.print{display:none}}</style></head><body>
<h1>${inv.invoiceNumber && inv.currency === 'INR' ? 'Tax invoice' : 'CodeSpectra receipt'}</h1><p>${inv.status === 'refunded' ? 'This payment was refunded.' : 'Keep this for your records.'}</p>
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
