import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { ssoProviders } from '@/lib/db/sso'
import { getMongoDb } from '@/lib/mongodb'
import { setSessionCookie } from '@/lib/session'
import { safeRedirect } from '@/lib/safe-redirect'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/auth/sso/callback — OIDC callback handler.
 * Receives code from IdP, exchanges for tokens, provisions user, creates session.
 */
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')

    if (error) {
      console.error('[sso/callback] IdP error:', error)
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/login?error=sso_failed`
      )
    }

    if (!code) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/login?error=missing_code`
      )
    }

    // Decode state to get provider_id and email
    let providerId: string
    let email: string
    try {
      const parsed = JSON.parse(Buffer.from(state || '', 'base64').toString())
      providerId = parsed.provider_id
      email = parsed.email
    } catch {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/login?error=invalid_state`
      )
    }

    // Fetch provider from DB
    const col = await ssoProviders()
    const provider = await col.findOne({ id: providerId, enabled: true })
    if (!provider) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/login?error=provider_not_found`
      )
    }

    if (provider.provider_type !== 'oidc') {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/login?error=unsupported_provider_type`
      )
    }

    // Discover OIDC endpoints from metadata_url
    let discovery
    try {
      const discRes = await fetch(provider.metadata_url)
      discovery = await discRes.json()
    } catch (e) {
      console.error('[sso/callback] Failed to fetch discovery:', e)
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/login?error=discovery_failed`
      )
    }

    const tokenEndpoint = discovery.token_endpoint
    const userinfoEndpoint = discovery.userinfo_endpoint

    if (!tokenEndpoint || !userinfoEndpoint) {
      console.error('[sso/callback] Missing endpoints in discovery')
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/login?error=bad_discovery`
      )
    }

    // Exchange code for tokens
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/auth/sso/callback`
    let tokenResponse
    try {
      const res = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          client_id: provider.client_id,
          client_secret: provider.client_secret,
        }),
      })
      tokenResponse = await res.json()
      if (!res.ok) {
        console.error('[sso/callback] Token exchange failed:', tokenResponse)
        return NextResponse.redirect(
          `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/login?error=token_exchange_failed`
        )
      }
    } catch (e) {
      console.error('[sso/callback] Token exchange error:', e)
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/login?error=token_exchange_error`
      )
    }

    const accessToken = tokenResponse.access_token

    // Fetch user info
    let userInfo
    try {
      const res = await fetch(userinfoEndpoint, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      userInfo = await res.json()
      if (!res.ok) {
        console.error('[sso/callback] Userinfo failed:', userInfo)
        return NextResponse.redirect(
          `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/login?error=userinfo_failed`
        )
      }
    } catch (e) {
      console.error('[sso/callback] Userinfo error:', e)
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/login?error=userinfo_error`
      )
    }

    // Extract user attributes
    const mapping = provider.attribute_mapping || {}
    const userEmail = userInfo[mapping.email || 'email'] || userInfo.email || email
    const userName = userInfo[mapping.name || 'name'] || userInfo.name || userInfo.preferred_username || userEmail.split('@')[0]

    if (!userEmail) {
      console.error('[sso/callback] No email in userinfo:', userInfo)
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/login?error=no_email`
      )
    }

    // Find or create user
    const db = await getMongoDb()
    const users = db.collection('user')

    let user = await users.findOne({ email: userEmail })
    if (!user) {
      // Create new user with SSO provisioning
      const newUser = {
        id: randomUUID(),
        email: userEmail,
        name: userName,
        role: provider.default_role || 'user',
        provider: 'sso',
        sso_provider_id: provider.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      const result = await users.insertOne(newUser)
      user = { ...newUser, _id: result.insertedId }
    } else {
      // Update existing user's SSO provider if not set
      if (!user.sso_provider_id) {
        await users.updateOne(
          { _id: user._id },
          { $set: { sso_provider_id: provider.id, updated_at: new Date().toISOString() } }
        )
      }
    }

    // Create session
    await setSessionCookie({
      uid: user.id,
      email: user.email,
      role: user.role,
    })

    // Redirect to dashboard — redirect param strictly same-origin (see safe-redirect).
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const redirect = safeRedirect(searchParams.get('redirect'))
    return NextResponse.redirect(`${baseUrl}${redirect}`)

  } catch (e) {
    console.error('[sso/callback] Unexpected error:', e)
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/login?error=unexpected`
    )
  }
}