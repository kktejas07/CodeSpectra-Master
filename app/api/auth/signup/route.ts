/**
 * API Route: POST /api/auth/signup
 * Description: Create new user account with email and password
 * Body: { email, password, fullName }
 * Response: { success, user, error }
 */

import { NextRequest, NextResponse } from 'next/server'
import { signUp } from '@/lib/auth-service'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password, fullName } = body

    // Validation
    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: 'Email and password are required' },
        { status: 400 }
      )
    }

    if (password.length < 8) {
      return NextResponse.json(
        { success: false, error: 'Password must be at least 8 characters' },
        { status: 400 }
      )
    }

    const result = await signUp(email, password, fullName)

    if (result.success) {
      return NextResponse.json(result, { status: 201 })
    } else {
      return NextResponse.json(result, { status: 400 })
    }
  } catch (error) {
    console.error('[v0] Signup API error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
