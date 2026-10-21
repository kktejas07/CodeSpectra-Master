import { NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/api-auth'
import type { IdRouteContext } from '@/lib/app-route-context'
import { getUserInvoice } from '@/lib/billing/invoice'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** One of the caller's invoices (paid/refunded order), built from billing_orders + billing_payments. */
export async function GET(_req: Request, { params }: IdRouteContext) {
  const { id } = await params
  try {
    const user = await getAPIUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })
    const invoice = await getUserInvoice(user.id, id)
    if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    return NextResponse.json(invoice)
  } catch (error) {
    console.error('[CodeSpectra] Invoice get error:', error)
    return NextResponse.json({ error: 'Could not load the invoice' }, { status: 500 })
  }
}
