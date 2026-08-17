import { NextRequest, NextResponse } from 'next/server'
import { findProviderForEmail } from '@/lib/db/sso'
import { clientLimiterKeyFromRequest } from '@/lib/in-memory-rate-limit'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

    const { email } = (await req.json()) as { email?: string }
    if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 })

    const provider = await findProviderForEmail(email)
    if (!provider) {
      return NextResponse.json({ error: 'No SSO provider configured for this email domain' }, { status: 404 })
    }

    // For OIDC, construct the authorization URL
    let redirect_url = ''
    if (provider.provider_type === 'oidc') {
      const params = new URLSearchParams({
        client_id: provider.client_id,
        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/auth/sso/callback`,
        response_type: 'code',
        scope: 'openid email profile',
        state: Buffer.from(JSON.stringify({ provider_id: provider.id, email })).toString('base64'),
      })
      redirect_url = `${provider.metadata_url.replace('/.well-known/openid-configuration', '')}/authorize?${params}`
    } else {
      // SAML: redirect to IdP with SAMLRequest
      redirect_url = provider.metadata_url
    }

    return NextResponse.json({ provider: { name: provider.name, type: provider.provider_type }, redirect_url })
  } catch (e) {
    console.error('[sso] initiate error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
