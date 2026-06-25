/**
 * POST /api/auth/face-login
 * Body: { email: string, faceData: { front, left, right } }
 * Resolves the account by email, verifies face templates, then (with service role) returns a one-time token_hash
 * the browser exchanges via supabase.auth.verifyOtp to establish a session.
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyFaceLogin } from '@/lib/auth-service'
import { supabaseServer } from '@/lib/supabase-client'
import { getSupabaseServiceRoleKey } from '@/lib/supabase-env'

function normalizeEmail(email: unknown): string | null {
  if (typeof email !== 'string') return null
  const t = email.trim().toLowerCase()
  return t.length > 0 ? t : null
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const email = normalizeEmail(body.email)
    const faceData = body.faceData as { front?: string; left?: string; right?: string } | undefined

    const captured =
      typeof faceData === 'string'
        ? faceData
        : faceData?.front || faceData?.left || faceData?.right || null

    if (!email || !captured) {
      return NextResponse.json(
        { success: false, error: 'Email and a face capture (front, left, or right) are required.' },
        { status: 400 }
      )
    }

    const serviceKey = getSupabaseServiceRoleKey()
    if (!serviceKey) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Face sign-in is not configured: set SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY) on the server.',
        },
        { status: 503 }
      )
    }

    const { data: profile, error: profileError } = await supabaseServer
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle()

    if (profileError || !profile?.id) {
      return NextResponse.json(
        { success: false, error: 'No account found for that email, or face sign-in is unavailable.' },
        { status: 404 }
      )
    }

    const userId = profile.id as string
    const result = await verifyFaceLogin(userId, captured)

    if (!result.success) {
      return NextResponse.json(result, { status: 401 })
    }

    const { data: authData, error: authErr } = await supabaseServer.auth.admin.getUserById(userId)
    if (authErr || !authData?.user?.email) {
      console.error('[CodeSpectra] face-login getUserById:', authErr)
      return NextResponse.json(
        { success: false, error: 'Could not load account for session exchange.' },
        { status: 500 }
      )
    }

    const userEmail = authData.user.email

    const { data: linkData, error: linkErr } = await supabaseServer.auth.admin.generateLink({
      type: 'magiclink',
      email: userEmail,
      options: {
        redirectTo:
          process.env.NEXT_PUBLIC_APP_URL ||
          process.env.NEXT_PUBLIC_SITE_URL ||
          `${request.nextUrl.origin}/dashboard`,
      },
    })

    const props = linkData?.properties as { hashed_token?: string } | undefined
    const tokenHash =
      typeof props?.hashed_token === 'string'
        ? props.hashed_token
        : typeof (linkData as { hashed_token?: string } | null)?.hashed_token === 'string'
          ? (linkData as { hashed_token: string }).hashed_token
          : undefined

    if (linkErr || !tokenHash) {
      console.error('[CodeSpectra] face-login generateLink:', linkErr, linkData)
      return NextResponse.json(
        {
          success: false,
          error: 'Face verified but session exchange failed. Sign in with email and password instead.',
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      userId,
      email: userEmail,
      token_hash: tokenHash,
    })
  } catch (error) {
    console.error('[CodeSpectra] Face login API error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
