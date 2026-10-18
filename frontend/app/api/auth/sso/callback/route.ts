import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { ssoProviders } from '@/lib/db/sso'
import { getMongoDb } from '@/lib/mongodb'
import { cookies } from 'next/headers'
import { setPending2faCookie, setSessionCookie, verifyPurposeToken } from '@/lib/session'
import { trustCurrentDevice } from '@/lib/trusted-devices'
import { safeRedirect } from '@/lib/safe-redirect'
import { normalizeUserRole } from '@/lib/rbac'
import { updateUserLastLogin } from '@/lib/db/admin'
import { accountBlockReason } from '@/lib/auth-account'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SSO_STATE_COOKIE = 'codespectra_sso_state'
const appUrl = () => process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

/** Back to the login page with a code it turns into a plain-language message. */
function fail(code: string) {
  return NextResponse.redirect(`${appUrl()}/auth/login?error=sso_${code}`)
}

interface SsoState { state: string; provider_id: string; email: string; code_verifier: string; redirect?: string }

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
      return fail('idp_error')
    }

    if (!code) {
      return fail('missing_code')
    }

    // `state` must match the signed, httpOnly cookie set by POST /api/auth/sso
    // in this same browser (login CSRF), and is single-use.
    const cookieStore = await cookies()
    const saved = await verifyPurposeToken<SsoState>('sso_state', cookieStore.get(SSO_STATE_COOKIE)?.value)
    cookieStore.set(SSO_STATE_COOKIE, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/api/auth/sso', maxAge: 0 })
    if (!saved || !state || saved.state !== state) {
      return fail('invalid_state')
    }
    const providerId = saved.provider_id

    // Fetch provider from DB
    const col = await ssoProviders()
    const provider = await col.findOne({ id: providerId, enabled: true })
    if (!provider) {
      return fail('provider_not_found')
    }

    if (provider.provider_type !== 'oidc') {
      return fail('unsupported_provider_type')
    }

    // Discover OIDC endpoints from metadata_url
    let discovery
    try {
      const discRes = await fetch(provider.metadata_url)
      discovery = await discRes.json()
    } catch (e) {
      console.error('[sso/callback] Failed to fetch discovery:', e)
      return fail('discovery_failed')
    }

    const tokenEndpoint = discovery.token_endpoint
    const userinfoEndpoint = discovery.userinfo_endpoint

    if (!tokenEndpoint || !userinfoEndpoint) {
      console.error('[sso/callback] Missing endpoints in discovery')
      return fail('bad_discovery')
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
          code_verifier: saved.code_verifier,
        }),
      })
      tokenResponse = await res.json()
      if (!res.ok) {
        console.error('[sso/callback] Token exchange failed:', tokenResponse)
        return fail('token_exchange_failed')
      }
    } catch (e) {
      console.error('[sso/callback] Token exchange error:', e)
      return fail('token_exchange_error')
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
        return fail('userinfo_failed')
      }
    } catch (e) {
      console.error('[sso/callback] Userinfo error:', e)
      return fail('userinfo_error')
    }

    // Extract user attributes
    const mapping = provider.attribute_mapping || {}
    // Only the IdP's asserted email counts (never the address typed on our form).
    const rawEmail = userInfo[mapping.email || 'email'] || userInfo.email
    const userEmail = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : ''

    if (!userEmail) {
      console.error('[sso/callback] No email in userinfo:', userInfo)
      return fail('no_email')
    }
    if (userInfo.email_verified === false) {
      return fail('email_unverified')
    }
    // The IdP may only sign in addresses on the domains this provider owns,
    // so a misconfigured IdP can't assert someone else's (e.g. a superadmin's) email.
    const emailDomain = userEmail.split('@')[1] || ''
    const allowedDomains = (provider.domains || []).map((d) => String(d).trim().toLowerCase()).filter(Boolean)
    if (!emailDomain || !allowedDomains.includes(emailDomain)) {
      console.error('[sso/callback] Email domain not allowed for provider', provider.id, emailDomain)
      return fail('domain_mismatch')
    }
    const userName = userInfo[mapping.name || 'name'] || userInfo.name || userInfo.preferred_username || userEmail.split('@')[0]

    // Find or create user
    const db = await getMongoDb()
    const users = db.collection('user')

    let user = await users.findOne({ email: { $regex: `^${userEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } })
    // Tenant comes from the provider the user signed in through (never from
    // the IdP's claims). A provider with no tenant can't mint company admins.
    const providerRec = provider as unknown as { tenant_id?: unknown; org_id?: unknown }
    const providerTenant =
      (typeof providerRec.tenant_id === 'string' && providerRec.tenant_id.trim()) ||
      (typeof providerRec.org_id === 'string' && providerRec.org_id.trim()) ||
      null

    if (!user) {
      // Create new user with SSO provisioning. Only `user` / `tenant_admin`
      // are ever assigned here, and tenant_admin only with a tenant.
      const wanted = normalizeUserRole(provider.default_role || 'user')
      const newRole = wanted === 'tenant_admin' && providerTenant ? 'tenant_admin' : 'user'
      const nowDate = new Date()
      const newUser: Record<string, unknown> = {
        id: randomUUID(),
        email: userEmail,
        name: userName,
        role: newRole,
        provider: 'sso',
        sso_provider_id: provider.id,
        created_at: nowDate.toISOString(),
        updated_at: nowDate.toISOString(),
        createdAt: nowDate,
        updatedAt: nowDate,
      }
      if (providerTenant) newUser.tenantId = providerTenant
      const result = await users.insertOne(newUser)
      user = { ...newUser, _id: result.insertedId } as typeof user & Record<string, unknown>
    } else {
      const set: Record<string, unknown> = {}
      // Update existing user's SSO provider if not set
      if (!user.sso_provider_id) set.sso_provider_id = provider.id
      // One-off repair: company admins created by SSO before tenants were
      // assigned have no tenant. Give them this provider's tenant.
      if (
        providerTenant &&
        normalizeUserRole(user.role as string | undefined) === 'tenant_admin' &&
        !user.tenantId && !user.organizationId
      ) {
        set.tenantId = providerTenant
      }
      if (Object.keys(set).length) {
        set.updated_at = new Date().toISOString()
        await users.updateOne({ _id: user._id }, { $set: set })
        user = { ...user, ...set }
      }
    }
    if (!user) return fail('unexpected')
    if (accountBlockReason(user)) return fail('account_disabled')

    const uid = String(user.id || user._id)
    const role = normalizeUserRole(user.role as string | undefined)
    const redirect = safeRedirect(saved.redirect)

    // Same second factor as password login: park the user until they enter a code.
    if (user.totp_enabled) {
      await setPending2faCookie({ uid, email: user.email, role, method: 'sso', redirect })
      return NextResponse.redirect(`${appUrl()}/auth/login?twofactor=sso`)
    }

    // Create session
    await setSessionCookie({ uid, email: user.email, role })
    await trustCurrentDevice(uid, req.headers.get('user-agent'))
    await updateUserLastLogin(uid, 'sso').catch(() => {})

    // Redirect param strictly same-origin (see safe-redirect).
    return NextResponse.redirect(`${appUrl()}${redirect}`)

  } catch (e) {
    console.error('[sso/callback] Unexpected error:', e)
    return fail('unexpected')
  }
}