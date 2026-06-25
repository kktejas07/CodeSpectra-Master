/**
 * POST /api/auth/face-enroll
 * Authenticated only. Body: { faceData: { front, left, right } } — user id comes from the session.
 */

import { NextRequest, NextResponse } from 'next/server'
import { enrollFaceRecognition } from '@/lib/auth-service'
import { requireAuth } from '@/lib/api-auth'
import { supabaseServer } from '@/lib/supabase-client'

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!('user' in auth)) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }

    const body = await request.json()
    const faceData = body.faceData as { front?: string; left?: string; right?: string } | undefined

    if (!faceData?.front || !faceData?.left || !faceData?.right) {
      return NextResponse.json(
        { success: false, error: 'All three angles (front, left, right) are required' },
        { status: 400 }
      )
    }

    const userId = auth.user.id
    if (body.userId && body.userId !== userId) {
      return NextResponse.json({ success: false, error: 'Cannot enroll for another user' }, { status: 403 })
    }

    const result = await enrollFaceRecognition(
      userId,
      { front: faceData.front, left: faceData.left, right: faceData.right },
      supabaseServer
    )

    if (result.success) {
      return NextResponse.json(result, { status: 200 })
    }
    return NextResponse.json(result, { status: 400 })
  } catch (error) {
    console.error('[CodeSpectra] Face enrollment API error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
