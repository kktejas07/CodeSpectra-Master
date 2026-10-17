import { NextResponse } from 'next/server'
import { users } from '@/lib/db/admin'
import { requireSuperAdmin } from '@/lib/route-auth'
import { auditAdmin } from '@/lib/admin-audit'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/reset-credits — start a fresh AI credit period for every
 * user. Clearing `creditsResetAt` makes the next balance read refill each user
 * to their plan's allowance (lib/user-credits.ts), so paid plans get their
 * paid allowance instead of a flat number. POST only (a GET must not mutate).
 */
export async function POST() {
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  try {
    const result = await (await users()).updateMany({}, { $unset: { creditsResetAt: '' } } as never)
    await auditAdmin(gate.user, 'admin.ai_credits.reset_all', 'ai_credits', 'user/*', `users=${result.modifiedCount}`, 'warning')
    return NextResponse.json({ success: true, updated: result.modifiedCount })
  } catch (e: unknown) {
    console.error('[CodeSpectra] admin/reset-credits:', e)
    return NextResponse.json({ error: 'Failed to reset credits' }, { status: 500 })
  }
}
