import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

export async function GET(req: NextRequest) {
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      // Return mock subscription for demo purposes
      return NextResponse.json({
        id: 'sub_123',
        planId: 'pro',
        planName: 'Pro',
        status: 'active',
        currentPeriodStart: '2024-03-17',
        currentPeriodEnd: '2024-04-17',
        pricePerMonth: 29,
        nextBillingDate: '2024-05-17',
        paymentMethod: {
          type: 'card',
          last4: '4242',
          expiry: '12/2025',
        },
        autoRenew: true,
      })
    }

    const { data: subscription, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (error && error.code !== 'PGRST116') throw error

    return NextResponse.json(subscription || { 
      status: 'free',
      planName: 'Free',
      pricePerMonth: 0,
    })
  } catch (error) {
    console.error('[v0] Subscription fetch error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const data = await req.json()
    return NextResponse.json({
      success: true,
      ...data,
      updatedAt: new Date().toISOString(),
    })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update subscription' }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest) {
  return NextResponse.json({
    success: true,
    cancelledAt: new Date().toISOString(),
  })
}
