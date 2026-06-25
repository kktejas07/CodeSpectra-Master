import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/api-auth'
import { getServiceSupabase } from '@/lib/admin-service-client'
import type { IdRouteContext } from '@/lib/app-route-context'

export async function PATCH(req: NextRequest, { params }: IdRouteContext) {
  const { id } = await params
  try {
    const user = await getAPIUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const patch: Record<string, unknown> = {}
    if (body.brand !== undefined) patch.brand = String(body.brand).slice(0, 32)
    if (body.last4 !== undefined) patch.last4 = String(body.last4).replace(/\D/g, '').slice(-4)
    if (body.expMonth !== undefined) patch.exp_month = Number(body.expMonth)
    if (body.expYear !== undefined) patch.exp_year = Number(body.expYear)
    if (body.isDefault === true) patch.is_default = true

    const supabase = getServiceSupabase()
    if (!supabase) {
      return NextResponse.json(
        { error: 'Server is missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY.' },
        { status: 503 }
      )
    }

    if (body.isDefault === true) {
      await supabase.from('user_payment_methods').update({ is_default: false }).eq('user_id', user.id)
    }

    const { data, error } = await supabase
      .from('user_payment_methods')
      .update(patch)
      .eq('id', id)
      .eq('user_id', user.id)
      .select('id, brand, last4, exp_month, exp_year, is_default')
      .maybeSingle()

    if (error) throw error
    if (!data) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('[CodeSpectra] Payment method PATCH error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: IdRouteContext) {
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

    const { error } = await supabase.from('user_payment_methods').delete().eq('id', id).eq('user_id', user.id)
    if (error) throw error

    const { count } = await supabase
      .from('user_payment_methods')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)

    if ((count ?? 0) === 0) {
      await supabase.from('user_payment_methods').insert({
        user_id: user.id,
        brand: 'Visa',
        last4: '4242',
        exp_month: 12,
        exp_year: 2030,
        is_default: true,
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[CodeSpectra] Payment method DELETE error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
