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

    const { data: preferences, error } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', user.id)

    if (error) throw error

    // Return default preferences if none exist
    if (!preferences || preferences.length === 0) {
      return NextResponse.json([
        {
          id: 'email',
          type: 'email',
          enabled: true,
          categories: { support: true, billing: true, integrations: true, security: true, updates: false }
        },
        {
          id: 'in_app',
          type: 'in_app',
          enabled: true,
          categories: { support: true, billing: true, integrations: true, security: true, updates: true }
        },
        {
          id: 'slack',
          type: 'slack',
          enabled: false,
          categories: { support: false, billing: false, integrations: false, security: false, updates: false }
        }
      ])
    }

    return NextResponse.json(preferences)
  } catch (error) {
    console.error('[v0] Preferences fetch error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
