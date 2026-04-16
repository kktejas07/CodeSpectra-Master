import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  try {
    const githubClientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/github/callback`

    const githubAuthUrl = new URL('https://github.com/login/oauth/authorize')
    githubAuthUrl.searchParams.set('client_id', githubClientId || '')
    githubAuthUrl.searchParams.set('redirect_uri', redirectUri)
    githubAuthUrl.searchParams.set('scope', 'user:email')
    githubAuthUrl.searchParams.set('allow_signup', 'true')

    return NextResponse.redirect(githubAuthUrl.toString())
  } catch (error) {
    console.error('GitHub OAuth error:', error)
    return NextResponse.json({ error: 'OAuth initialization failed' }, { status: 500 })
  }
}
