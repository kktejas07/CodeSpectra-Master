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
      // Return mock invoices for demo purposes
      return NextResponse.json([
        {
          id: 'inv_001',
          date: '2024-04-17',
          amount: 29,
          status: 'paid',
          description: 'Pro Plan - Monthly',
          downloadUrl: '/invoices/inv_001.pdf',
        },
        {
          id: 'inv_002',
          date: '2024-03-17',
          amount: 29,
          status: 'paid',
          description: 'Pro Plan - Monthly',
          downloadUrl: '/invoices/inv_002.pdf',
        },
      ])
    }

    const { data: invoices, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json(invoices || [])
  } catch (error) {
    console.error('[v0] Invoices fetch error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
