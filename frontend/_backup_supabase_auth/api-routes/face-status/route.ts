/**
 * GET /api/auth/face-status — enrollment angles for the signed-in user.
 */

import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { createRouteHandlerSupabase } from '@/lib/supabase-server'

export async function GET() {
  const auth = await requireAuth()
  if (!('user' in auth)) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { user } = auth
  const supabase = await createRouteHandlerSupabase()

  const { data, error } = await supabase
    .from('face_enrollments')
    .select('angle_type,status')
    .eq('user_id', user.id)
    .eq('status', 'active')

  if (error) {
    console.error('[CodeSpectra] face-status:', error.message)
    return NextResponse.json(
      { enrolled: false, angles: [] as string[], error: error.message },
      { status: 200 }
    )
  }

  const angles = (data ?? []).map((r: { angle_type: string }) => r.angle_type)
  return NextResponse.json({
    enrolled: angles.length >= 3,
    angles,
  })
}
