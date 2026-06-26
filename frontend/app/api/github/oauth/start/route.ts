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
  const redirect = url.searchParams.get('redirect') || '/dashboard/admin/settings'

  // Persist state so the callback can validate it and resolve user_id.
  const state = randomBytes(24).toString('hex')
  const db = await getMongoDb()
  await db.collection('github_oauth_states').insertOne({
    state,
    user_id: user.id,
    redirect,
    created_at: new Date(),
  })

  const ghAuth = new URL('https://github.com/login/oauth/authorize')
  ghAuth.searchParams.set('client_id', clientId)
  ghAuth.searchParams.set('redirect_uri', `${appOrigin(req)}/api/github/oauth/callback`)
  ghAuth.searchParams.set('scope', REQUESTED_SCOPES)
  ghAuth.searchParams.set('state', state)
  ghAuth.searchParams.set('allow_signup', 'false')

  return NextResponse.redirect(ghAuth.toString(), { status: 302 })
}
