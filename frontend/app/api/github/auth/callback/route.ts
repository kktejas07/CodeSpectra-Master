import { NextRequest, NextResponse } from 'next/server'

/**
 * Legacy /api/github/auth/callback shim.
 *
 * Phase 6 migration: GitHub OAuth is now handled by Better Auth
 * (`/api/auth/sign-in/social/github` → `/api/auth/callback/github`).
 * Access tokens are stored by Better Auth in the `account` collection and
 * available via `auth.api.getAccessToken({ providerId: 'github', userId })`.
 * This endpoint is retained as a 410 Gone marker so any stale client code
 * fails fast instead of silently 404ing.
 */
export async function POST(_request: NextRequest) {
  return NextResponse.json(
    {
      error:
        'This endpoint was removed during the MongoDB migration. Use Better Auth: redirect users to /api/auth/sign-in/social/github (Better Auth handles the exchange + token storage automatically).',
    },
    { status: 410 },
  )
}
