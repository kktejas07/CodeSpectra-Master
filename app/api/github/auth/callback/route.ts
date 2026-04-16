import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { code, state } = await request.json()

    if (!code || !state) {
      return NextResponse.json({ error: 'Missing code or state' }, { status: 400 })
    }

    const clientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID
    const clientSecret = process.env.GITHUB_CLIENT_SECRET
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/auth/github/callback`

    if (!clientId || !clientSecret) {
      console.error('[v0] Missing GitHub OAuth credentials')
      return NextResponse.json({ error: 'GitHub OAuth not configured' }, { status: 500 })
    }

    // Exchange code for access token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    })

    const tokenData = await tokenResponse.json()

    if (tokenData.error) {
      console.error('[v0] GitHub token error:', tokenData.error_description)
      return NextResponse.json({ error: tokenData.error_description }, { status: 400 })
    }

    const accessToken = tokenData.access_token

    // Get GitHub user info
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github.v3+json',
      },
    })

    const githubUser = await userResponse.json()

    // Get Supabase session
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get current user from auth header
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: userData } = await supabase.auth.getUser(token)

    if (!userData.user) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 })
    }

    // Save GitHub integration
    const { error } = await supabase.from('github_integrations').upsert({
      user_id: userData.user.id,
      github_username: githubUser.login,
      github_token: accessToken,
      is_active: true,
      last_synced_at: new Date().toISOString(),
    })

    if (error) {
      console.error('[v0] Failed to save GitHub integration:', error)
      return NextResponse.json({ error: 'Failed to save GitHub integration' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'GitHub connected successfully',
      github_username: githubUser.login,
    })
  } catch (error) {
    console.error('[v0] GitHub callback error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to authenticate' },
      { status: 500 }
    )
  }
}
