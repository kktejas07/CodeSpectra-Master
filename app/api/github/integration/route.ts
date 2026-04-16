import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get authorization header
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: userData } = await supabase.auth.getUser(token)

    if (!userData.user) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 })
    }

    // Get GitHub integration
    const { data: integration } = await supabase
      .from('github_integrations')
      .select('id, github_username, is_active, last_synced_at')
      .eq('user_id', userData.user.id)
      .eq('is_active', true)
      .single()

    if (!integration) {
      return NextResponse.json(null)
    }

    return NextResponse.json(integration)
  } catch (error) {
    console.error('[v0] GitHub integration error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get integration' },
      { status: 500 }
    )
  }
}
