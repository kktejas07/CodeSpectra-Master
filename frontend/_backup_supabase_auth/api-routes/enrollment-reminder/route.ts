/**
 * API Route: GET /api/auth/enrollment-reminder
 * Description: Check if user should see face enrollment reminder
 * Query: userId
 * Response: { success, shouldRemind, daysRemaining, message, error }
 */

import { NextRequest, NextResponse } from 'next/server'
import { checkFaceEnrollmentReminder } from '@/lib/auth-service'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const userId = searchParams.get('userId')

    // Validation
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'User ID is required' },
        { status: 400 }
      )
    }

    const result = await checkFaceEnrollmentReminder(userId)

    if (result.success) {
      return NextResponse.json(result, { status: 200 })
    } else {
      return NextResponse.json(result, { status: 400 })
    }
  } catch (error) {
    console.error('[CodeSpectra] Enrollment reminder API error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
