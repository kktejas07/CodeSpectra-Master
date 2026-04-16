import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { faceData } = await req.json()

    if (!faceData) {
      return NextResponse.json({ error: 'Face data required' }, { status: 400 })
    }

    // Get current user session
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Store face recognition data
    const { data, error } = await supabase
      .from('face_recognition_data')
      .upsert({
        user_id: user.id,
        face_embedding: faceData,
        face_metadata: {
          timestamp: new Date().toISOString(),
          loginAttempt: true,
        },
        last_verified: new Date().toISOString(),
        is_verified: true,
      })
      .select()

    if (error) {
      console.error('Face recognition storage error:', error)
      return NextResponse.json({ error: 'Failed to store face data' }, { status: 500 })
    }

    // Create session token
    const token = Math.random().toString(36).substring(7)
    
    return NextResponse.json({
      success: true,
      message: 'Face recognized successfully',
      userId: user.id,
      token,
    })
  } catch (error) {
    console.error('Face login error:', error)
    return NextResponse.json({ error: 'Face recognition failed' }, { status: 500 })
  }
}
