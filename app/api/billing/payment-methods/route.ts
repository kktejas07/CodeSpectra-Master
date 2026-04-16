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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch payment methods from Stripe or your payment provider
    // This is a placeholder - in production, query your payment provider
    return NextResponse.json([
      {
        id: 'pm_1',
        brand: 'Visa',
        last4: '4242',
        expiryMonth: 12,
        expiryYear: 2026,
      },
      {
        id: 'pm_2',
        brand: 'Mastercard',
        last4: '8891',
        expiryMonth: 3,
        expiryYear: 2025,
      },
    ])
  } catch (error) {
    console.error('[v0] Payment methods fetch error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
