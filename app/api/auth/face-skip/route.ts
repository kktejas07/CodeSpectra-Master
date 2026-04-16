/**
 * API Route: POST /api/auth/face-skip
 * Description: Skip face enrollment with 7-day reminder
 * Body: { userId }
 * Response: { success, message, daysRemaining, error }
 */

import { NextRequest, NextResponse } from 'next/server'
import { skipFaceEnrollment } from '@/lib/auth-service'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId } = body

    // Validation
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'User ID is required' },
        { status: 400 }
      )
    }

    const result = await skipFaceEnrollment(userId)

    if (result.success) {
      return NextResponse.json(result, { status: 200 })
    } else {
      return NextResponse.json(result, { status: 400 })
    }
  } catch (error) {
    console.error('[v0] Face skip API error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
