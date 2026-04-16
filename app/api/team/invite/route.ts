import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { email, role } = await request.json()

    // Create invitation
    const { error } = await supabase
      .from('organization_invitations')
      .insert({
        organization_id: user.user_metadata.organization_id,
        email,
        invited_by: user.id,
        role,
        token: crypto.randomUUID(),
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      })

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error inviting member:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
