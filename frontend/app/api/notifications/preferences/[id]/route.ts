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

    const supabase = getServiceSupabase()
    if (!supabase) {
      return NextResponse.json(
        { error: 'Server is missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY.' },
        { status: 503 }
      )
    }

    const body = await req.json().catch(() => ({}))

    const { error } = await supabase
      .from('notification_preferences')
      .update(body)
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[CodeSpectra] Preferences update error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
