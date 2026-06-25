import { NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/api-auth'
import { getServiceSupabase } from '@/lib/admin-service-client'

export async function GET() {
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

    const { data: rows, error } = await supabase
      .from('user_invoices')
      .select('id, amount_cents, currency, status, description, pdf_url, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) throw error

    const list = (rows ?? []).map((r) => ({
      id: r.id as string,
      date: (r.created_at as string).slice(0, 10),
      amount: Math.round(Number(r.amount_cents) || 0) / 100,
      currency: (r.currency as string) || 'USD',
      status: (r.status as string) || 'paid',
      description: (r.description as string) || null,
      downloadUrl: (r.pdf_url as string) || `/api/billing/invoices/${r.id}/download`,
    }))

    return NextResponse.json(list)
  } catch (error) {
    console.error('[CodeSpectra] Invoices fetch error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
