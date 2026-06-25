import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

/**
 * GET /api/github/integration
 * Phase 6 migration: looks for a GitHub OAuth `account` row owned by the
 * current Better Auth user. If present, the user is "connected".
 */
export async function GET(_request: NextRequest) {
  const user = await getAPIUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const db = await getMongoDb()
    const acct = await db.collection('account').findOne({
      userId: user.id,
      providerId: 'github',
    })
    if (!acct) {
      return NextResponse.json(null)
    }
    return NextResponse.json({
      id: acct._id ?? acct.id,
      github_username: acct.accountId ?? null,
      is_active: true,
      last_synced_at: acct.updatedAt ?? acct.createdAt ?? null,
    })
  } catch (error) {
    console.error('[CodeSpectra] GitHub integration error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get integration' },
      { status: 500 },
    )
  }
}
