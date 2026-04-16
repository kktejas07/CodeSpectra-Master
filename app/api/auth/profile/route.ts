/**
 * API Route: GET /api/auth/profile
 * Description: Get user profile with all related data
 * Query: userId
 * Response: { success, user, error }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getUserProfile } from '@/lib/auth-service'

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

    const result = await getUserProfile(userId)

    if (result.success) {
      return NextResponse.json(result, { status: 200 })
    } else {
      return NextResponse.json(result, { status: 400 })
    }
  } catch (error) {
    console.error('[v0] Get profile API error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * API Route: PATCH /api/auth/profile
 * Description: Update user profile
 * Body: userId and any fields to update
 * Response: { success, user, error }
 */

import { updateUserProfile } from '@/lib/auth-service'

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, ...updates } = body

    // Validation
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'User ID is required' },
        { status: 400 }
      )
    }

    const result = await updateUserProfile(userId, updates)

    if (result.success) {
      return NextResponse.json(result, { status: 200 })
    } else {
      return NextResponse.json(result, { status: 400 })
    }
  } catch (error) {
    console.error('[v0] Update profile API error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
