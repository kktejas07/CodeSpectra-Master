import { createHash, randomBytes } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { signPurposeToken } from '@/lib/session'
import { safeRedirect } from '@/lib/safe-redirect'
import { findProviderForEmail } from '@/lib/db/sso'
import { clientLimiterKeyFromRequest } from '@/lib/in-memory-rate-limit'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SSO_STATE_COOKIE = 'codespectra_sso_state'

/**
 * POST /api/auth/sso — initiate SSO login by email domain.
 * Body: { email: string }
 * Returns: { provider: { name, type }, redirect_url } or { error }
 */
export async function POST(req: NextRequest) {
  try {
    // Rate limit: 10 requests per minute per IP
    const ipKey = clientLimiterKeyFromRequest(req, null)
    const ipCheck = await rateLimitRedis(`sso:ip:${ipKey}`, 10, 60_000)
    if (!ipCheck.ok) {
      return NextResponse.json(
        { error: `Too many requests. Try again in ${ipCheck.retryAfterSec}s.` },
        { status: 429 },
      )
    }

    const { email: rawEmail, redirect } = (await req.json().catch(() => ({}))) as { email?: unknown; redirect?: unknown }
    const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : ''
    if (!email) return NextResponse.json({ error: 'Enter your work email.' }, { status: 400 })

    const provider = await findProviderForEmail(email)
    if (!provider) {
      return NextResponse.json({ error: 'No SSO provider configured for this email domain' }, { status: 404 })
    }

    // For OIDC, construct the authorization URL
    let redirect_url = ''
    if (provider.provider_type === 'oidc') {
      // `state` is a random value bound to this browser by a signed, httpOnly
      // cookie (login-CSRF defence); the PKCE verifier lives only in that cookie.
      const state = randomBytes(24).toString('base64url')
      const codeVerifier = randomBytes(32).toString('base64url')
      const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url')
      const cookieValue = await signPurposeToken('sso_state', {
        state,
        provider_id: provider.id,
        email,
        code_verifier: codeVerifier,
        redirect: safeRedirect(typeof redirect === 'string' ? redirect : null),
      }, '10m')
      const cookieStore = await cookies()
      cookieStore.set(SSO_STATE_COOKIE, cookieValue, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/api/auth/sso',
        maxAge: 10 * 60,
      })
      const params = new URLSearchParams({
        client_id: provider.client_id,
        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/auth/sso/callback`,
        response_type: 'code',
        scope: 'openid email profile',
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      })
      redirect_url = `${provider.metadata_url.replace('/.well-known/openid-configuration', '')}/authorize?${params}`
    } else {
      // SAML: redirect to IdP with SAMLRequest
      redirect_url = provider.metadata_url
    }

    return NextResponse.json({ provider: { name: provider.name, type: provider.provider_type }, redirect_url })
  } catch (e) {
    console.error('[sso] initiate error:', e)
    return NextResponse.json({ error: 'Couldn’t start single sign-on. Try again, or sign in with email.' }, { status: 500 })
  }
}
