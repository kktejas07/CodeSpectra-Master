/**
 * GET /api/github/oauth/start
 *
 * Initiates the GitHub OAuth (or OAuth App) install flow for the currently
 * signed-in user. Generates a CSRF state token, persists `(state, userId)`
 * in MongoDB (`github_oauth_states` collection, 10-minute TTL), and 302s
 * the browser to GitHub's authorize endpoint.
 *
 * Configuration:
 *   - `github_client_id` (plain) + `github_client_secret` (secret) in the
 *     superadmin settings UI — these are issued when you create the GitHub
 *     OAuth App at https://github.com/settings/developers
 *   - Authorization callback URL on GitHub must point to
 *     `<APP_URL>/api/github/oauth/callback`
 *
 * Optional query string:
 *   - `redirect` — relative path the user lands on after success
 *                  (default `/dashboard/admin/settings`)
 */
import { randomBytes } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/api-auth'
import { readServerSecrets } from '@/lib/server-secrets-cache'
import { getMongoDb } from '@/lib/mongodb'
import { signPurposeToken } from '@/lib/session'
import { GITHUB_STATE_COOKIE, GITHUB_STATE_TTL_MS, newPkcePair } from '@/lib/github-oauth-state'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const REQUESTED_SCOPES = 'read:user user:email public_repo'

function appOrigin(req: NextRequest): string {
  const fwdProto = req.headers.get('x-forwarded-proto') || 'https'
  const fwdHost =
    req.headers.get('x-forwarded-host') ||
    req.headers.get('host') ||
    'localhost:3000'
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, '')
  if (fromEnv) return fromEnv
  return `${fwdProto}://${fwdHost}`
}

export async function GET(req: NextRequest) {
  const user = await getAPIUser()
  if (!user) {
    return NextResponse.json({ error: 'Sign in to connect GitHub' }, { status: 401 })
  }

  const secrets = await readServerSecrets()
  const clientId = secrets.github_client_id?.trim()
  if (!clientId) {
    return NextResponse.json(
      {
        error:
          'GitHub OAuth App is not configured. A superadmin must save github_client_id and github_client_secret in Settings → Integrations first.',
      },
      { status: 503 },
    )
  }

  const url = new URL(req.url)
  const rawRedirect = url.searchParams.get('redirect') || '/dashboard/admin/settings'
  // Open-redirect guard: only same-origin relative paths are allowed.
  const redirect =
    rawRedirect.startsWith('/') && !rawRedirect.startsWith('//') && !rawRedirect.includes('://')
      ? rawRedirect
      : '/dashboard/admin/settings'

  // Persist state so the callback can validate it and resolve user_id.
  const state = randomBytes(24).toString('hex')
  const pkce = newPkcePair()
  const db = await getMongoDb()
  await db.collection('github_oauth_states').createIndex({ created_at: 1 }, { expireAfterSeconds: 3600, name: 'github_oauth_states_ttl' }).catch(() => {})
  await db.collection('github_oauth_states').insertOne({
    state,
    user_id: user.id,
    redirect,
    code_verifier: pkce.verifier,
    created_at: new Date(),
  })

  const ghAuth = new URL('https://github.com/login/oauth/authorize')
  ghAuth.searchParams.set('client_id', clientId)
  ghAuth.searchParams.set('redirect_uri', `${appOrigin(req)}/api/github/oauth/callback`)
  ghAuth.searchParams.set('scope', REQUESTED_SCOPES)
  ghAuth.searchParams.set('state', state)
  ghAuth.searchParams.set('allow_signup', 'false')
  ghAuth.searchParams.set('code_challenge', pkce.challenge)
  ghAuth.searchParams.set('code_challenge_method', 'S256')

  // SEC-007: bind the flow to this browser + user (checked in the callback).
  const res = NextResponse.redirect(ghAuth.toString(), { status: 302 })
  res.cookies.set(GITHUB_STATE_COOKIE, await signPurposeToken('github_connect', { state, uid: user.id }, '10m'), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/github/oauth',
    maxAge: Math.floor(GITHUB_STATE_TTL_MS / 1000),
  })
  return res
}
