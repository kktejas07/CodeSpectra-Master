import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export type GitHubTokenResult =
  | { ok: true; accessToken: string; userId: string }
  | { ok: false; response: NextResponse }

/**
 * Cookie-authenticated GitHub OAuth token for the current user.
 *
 * Phase 6 migration: Better Auth stores OAuth tokens in the `account`
 * collection (`{ userId, providerId: 'github', accessToken }`). We read
 * directly from there. Tokens are stored unencrypted by default (Better
 * Auth setting); to encrypt at rest, configure `account.encryptOAuthTokens`
 * in `lib/auth.ts`.
 */
export async function getGitHubAccessTokenFromSession(): Promise<GitHubTokenResult> {
  const gate = await requireAuth()
  if ('error' in gate) {
    return {
      ok: false,
      response: NextResponse.json({ error: gate.error }, { status: gate.status }),
    }
  }

  try {
    const db = await getMongoDb()
    const acct = await db.collection('account').findOne({
      userId: gate.user.id,
      providerId: 'github',
    })

    const accessToken = (acct?.accessToken as string | undefined) ?? ''
    if (!accessToken) {
      return {
        ok: false,
        response: NextResponse.json({ error: 'GitHub not connected' }, { status: 400 }),
      }
    }

    return { ok: true, accessToken, userId: gate.user.id }
  } catch (error) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: error instanceof Error ? error.message : 'Failed to load GitHub token' },
        { status: 500 },
      ),
    }
  }
}
