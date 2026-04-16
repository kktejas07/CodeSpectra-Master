import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const clientId = process.env.SLACK_CLIENT_ID
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/slack/callback`
  const scope = 'chat:write,channels:read,users:read'
  
  const authUrl = new URL('https://slack.com/oauth_authorize')
  authUrl.searchParams.set('client_id', clientId || '')
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('scope', scope)
  authUrl.searchParams.set('state', Math.random().toString(36).substring(7))

  return NextResponse.redirect(authUrl)
}
