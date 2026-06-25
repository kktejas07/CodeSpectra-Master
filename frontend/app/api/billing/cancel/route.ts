import { NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/api-auth'
import { getServiceSupabase } from '@/lib/admin-service-client'
import { cancelUserSubscription } from '@/lib/billing-server'

export async function POST() {
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

    await cancelUserSubscription(supabase, user.id)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[CodeSpectra] Cancel subscription error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
