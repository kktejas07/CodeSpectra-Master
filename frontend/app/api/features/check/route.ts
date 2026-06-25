import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'

/**
 * GET /api/features/check?name=feature_name
 *
 * Phase 6 migration: the old SQL-heavy 3-table feature-flag check (user_roles
 * × role_feature_permissions × tier_features) has been simplified. Until we
 * actually need per-tier gating, this returns `{ enabled: true }` for any
 * authenticated request. Pre-existing callers continue to work; you can
 * later wire feature flags into the `feature_flags` collection.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const featureName = searchParams.get('name')
  if (!featureName) {
    return NextResponse.json({ error: 'Feature name required' }, { status: 400 })
  }
  const user = await getAPIUser()
  return NextResponse.json({ enabled: Boolean(user) })
}
