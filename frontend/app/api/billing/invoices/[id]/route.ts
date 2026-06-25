import { NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/api-auth'
import { getServiceSupabase } from '@/lib/admin-service-client'
import type { IdRouteContext } from '@/lib/app-route-context'

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

    return NextResponse.json({
      id: row.id,
      amount: Math.round(Number(row.amount_cents) || 0) / 100,
      currency: row.currency,
      status: row.status,
      description: row.description,
      createdAt: row.created_at,
      downloadUrl: row.pdf_url || `/api/billing/invoices/${row.id}/download`,
    })
  } catch (error) {
    console.error('[CodeSpectra] Invoice get error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
