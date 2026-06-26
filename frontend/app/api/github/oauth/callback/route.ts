/**
 * GET /api/github/oauth/callback?code=…&state=…
 *
 * Completes the OAuth Authorization Code grant:
 *   1. Validates the state token against the row written by
 *      `/api/github/oauth/start` (CSRF + user resolution).
 *   2. Exchanges the code for an access token at GitHub's token endpoint.
 *   3. Fetches the GitHub user's login + id so we can scope per-owner
 *      operations (PR-comment posting, repo listing, etc.).
 *   4. Upserts a row into the `integrations` collection keyed by
 *      `(provider='github', user_id)`. The same row is also indexed by
 *      `github_login` so the queue worker can look it up by repo owner.
 *   5. Redirects the user back to the `redirect` path captured at start.
 */
import { NextRequest, NextResponse } from 'next/server'
import { readServerSecrets } from '@/lib/server-secrets-cache'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

function fail(req: NextRequest, msg: string, status = 400) {
  const back = new URL('/dashboard/admin/settings', appOrigin(req))
  back.searchParams.set('github', 'error')
  back.searchParams.set('reason', msg.slice(0, 140))
  return NextResponse.redirect(back.toString(), { status: 302 })
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  if (!code || !state) return fail(req, 'missing code or state')

  const db = await getMongoDb()
  const stateRow = await db
    .collection('github_oauth_states')
    .findOne({ state })
  if (!stateRow) return fail(req, 'invalid or expired state')
  // Consume the state immediately so it cannot be replayed.
  await db.collection('github_oauth_states').deleteOne({ state })

  const ageMs = Date.now() - new Date(stateRow.created_at).getTime()
  if (ageMs > 10 * 60 * 1000) return fail(req, 'state expired (>10m)')

  const secrets = await readServerSecrets()
  const clientId = secrets.github_client_id?.trim()
  const clientSecret = secrets.github_client_secret?.trim()
  if (!clientId || !clientSecret) {
    return fail(req, 'GitHub OAuth credentials not configured')
  }

  // 1. Exchange code → access_token
  let tokenJson: { access_token?: string; scope?: string; token_type?: string; error?: string } = {}
  try {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: `${appOrigin(req)}/api/github/oauth/callback`,
      }),
    })
    tokenJson = (await tokenRes.json()) as typeof tokenJson
  } catch (e) {
    return fail(req, `token exchange failed: ${e instanceof Error ? e.message : 'unknown'}`)
  }
  if (!tokenJson.access_token) {
    return fail(req, tokenJson.error || 'no access_token returned')
  }

  // 2. Identify the GitHub user
  let ghUser: { login?: string; id?: number; avatar_url?: string; email?: string } = {}
  try {
    const meRes = await fetch('https://api.github.com/user', {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${tokenJson.access_token}`,
        'User-Agent': 'codespectra-oauth',
      },
    })
    ghUser = (await meRes.json()) as typeof ghUser
  } catch {
    /* non-fatal — we'll still store the token */
  }

  // 3. Upsert integration row
  const now = new Date().toISOString()
  await db.collection('integrations').updateOne(
    { provider: 'github', user_id: stateRow.user_id },
    {
      $set: {
        provider: 'github',
        user_id: stateRow.user_id,
        access_token: tokenJson.access_token,
        token_type: tokenJson.token_type || 'bearer',
        scope: tokenJson.scope || '',
        github_login: ghUser.login || null,
        github_id: ghUser.id || null,
        avatar_url: ghUser.avatar_url || null,
        github_email: ghUser.email || null,
        updated_at: now,
      },
      $setOnInsert: { created_at: now },
    },
    { upsert: true },
  )

  // 4. Redirect back to the originating page with a success banner.
  const back = new URL(stateRow.redirect || '/dashboard/admin/settings', appOrigin(req))
  back.searchParams.set('github', 'connected')
  if (ghUser.login) back.searchParams.set('login', ghUser.login)
  return NextResponse.redirect(back.toString(), { status: 302 })
}
