import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { privateFieldsProjection } from '@/lib/auth-account'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'

export const runtime = 'nodejs'

/**
 * GET /api/user/export — everything held about the signed-in person (SEC-040):
 * the profile plus their rows in every personal-data collection
 * (lib/account-export.ts), secrets and file bytes stripped.
 */
export async function GET() {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  const limit = await rateLimitRedis(`user-export:${gate.user.id}`, 5, 60 * 60_000)
  if (!limit.ok) {
    return NextResponse.json({ error: `Too many exports. Try again in ${limit.retryAfterSec}s.`, code: 'rate_limited', params: { seconds: limit.retryAfterSec } }, { status: 429 })
  }

  try {
    const db = await getMongoDb()
    const user = await db.collection('user').findOne(
      { id: gate.user.id },
      // Secrets (TOTP, reset/verification hashes) and the raw face template never leave the server.
      { projection: privateFieldsProjection() },
    )
    if (!user) {
      return NextResponse.json({ error: 'User not found', code: 'user_not_found' }, { status: 404 })
    }
    const { buildAccountExport, sanitizeExportValue, EXPORT_ROW_LIMIT } = await import('@/lib/account-export')
    const { data, truncated, failed } = await buildAccountExport(db, gate.user.id)
    const body = {
      exported_at: new Date().toISOString(),
      profile: sanitizeExportValue(user),
      data,
      ...(truncated.length ? { truncated: { collections: truncated, row_limit: EXPORT_ROW_LIMIT } } : {}),
      ...(failed.length ? { incomplete: failed } : {}),
    }

    return new NextResponse(JSON.stringify(body, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="codespectra-export.json"',
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('[Export] Error:', (error as Error)?.name || 'error')
    return NextResponse.json({ error: 'Internal server error', code: 'internal_error' }, { status: 500 })
  }
}
