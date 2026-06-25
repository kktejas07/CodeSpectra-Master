import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/api-auth'
import { getServiceSupabase } from '@/lib/admin-service-client'
import { ensureDefaultPaymentMethod } from '@/lib/billing-server'

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

    await ensureDefaultPaymentMethod(supabase, user.id)

    const { data: rows, error } = await supabase
      .from('user_payment_methods')
      .select('id, brand, last4, exp_month, exp_year, is_default')
      .eq('user_id', user.id)
      .order('is_default', { ascending: false })

    if (error) throw error

    return NextResponse.json(rows ?? [])
  } catch (error) {
    console.error('[CodeSpectra] Payment methods fetch error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAPIUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const last4 = String(body.last4 || '4242').replace(/\D/g, '').slice(-4) || '4242'
    const brand = String(body.brand || 'Card').slice(0, 32)
    const expMonth = Number(body.expMonth) || 12
    const expYear = Number(body.expYear) || 2030

    const supabase = getServiceSupabase()
    if (!supabase) {
      return NextResponse.json(
        { error: 'Server is missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY.' },
        { status: 503 }
      )
    }

    await supabase.from('user_payment_methods').update({ is_default: false }).eq('user_id', user.id)

    const { data, error } = await supabase
      .from('user_payment_methods')
      .insert({
        user_id: user.id,
        brand,
        last4,
        exp_month: expMonth,
        exp_year: expYear,
        is_default: true,
      })
      .select('id, brand, last4, exp_month, exp_year, is_default')
      .single()

    if (error) throw error
    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    console.error('[CodeSpectra] Payment method create error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
