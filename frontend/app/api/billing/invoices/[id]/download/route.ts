import { NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/api-auth'
import { getServiceSupabase } from '@/lib/admin-service-client'
import type { IdRouteContext } from '@/lib/app-route-context'

/** Printable HTML receipt (save / print as PDF from the browser). */
export async function GET(_req: Request, { params }: IdRouteContext) {
  const { id } = await params
  try {
    const user = await getAPIUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServiceSupabase()
    if (!supabase) {
      return NextResponse.json(
        { error: 'Server is missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY.' },
        { status: 503 }
      )
    }

    const { data: row, error } = await supabase
      .from('user_invoices')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (error) throw error
    if (!row) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const pdfUrl = row.pdf_url as string | null
    if (pdfUrl && (pdfUrl.startsWith('https://') || pdfUrl.startsWith('http://'))) {
      return NextResponse.redirect(pdfUrl)
    }

    const amount = (Math.round(Number(row.amount_cents) || 0) / 100).toFixed(2)
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Invoice ${row.id}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 640px; margin: 40px auto; color: #111; }
    h1 { font-size: 1.5rem; }
    table { width: 100%; border-collapse: collapse; margin-top: 24px; }
    th, td { text-align: left; padding: 8px; border-bottom: 1px solid #ddd; }
    .muted { color: #666; font-size: 0.9rem; }
  </style>
</head>
<body>
  <h1>CodeSpectra — Receipt</h1>
  <p class="muted">Invoice ID: ${row.id}</p>
  <p class="muted">Bill to: ${user.email}</p>
  <p class="muted">Date: ${new Date(row.created_at as string).toLocaleString()}</p>
  <table>
    <thead><tr><th>Description</th><th>Amount (${row.currency})</th></tr></thead>
    <tbody>
      <tr><td>${(row.description as string) || 'Subscription'}</td><td>$${amount}</td></tr>
    </tbody>
  </table>
  <p class="muted" style="margin-top:32px">Status: <strong>${row.status}</strong></p>
  <p class="muted">Use your browser Print dialog → “Save as PDF” for a PDF copy.</p>
</body>
</html>`

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `attachment; filename="codespectra-invoice-${String(row.id).slice(0, 8)}.html"`,
      },
    })
  } catch (error) {
    console.error('[CodeSpectra] Invoice download error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
