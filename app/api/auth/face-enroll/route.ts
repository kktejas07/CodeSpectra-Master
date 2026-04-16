/**
 * API Route: POST /api/auth/face-enroll
 * Description: Enroll user's face for recognition (3 angles)
 * Body: { userId, faceData: { front, left, right } }
 * Response: { success, error }
 */

import { NextRequest, NextResponse } from 'next/server'
import { enrollFaceRecognition } from '@/lib/auth-service'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, faceData } = body

    // Validation
    if (!userId || !faceData) {
      return NextResponse.json(
        { success: false, error: 'User ID and face data are required' },
        { status: 400 }
      )
    }

    if (!faceData.front || !faceData.left || !faceData.right) {
      return NextResponse.json(
        { success: false, error: 'All three angles (front, left, right) are required' },
        { status: 400 }
      )
    }

    const result = await enrollFaceRecognition(userId, faceData)

    if (result.success) {
      return NextResponse.json(result, { status: 200 })
    } else {
      return NextResponse.json(result, { status: 400 })
    }
  } catch (error) {
    console.error('[v0] Face enrollment API error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
