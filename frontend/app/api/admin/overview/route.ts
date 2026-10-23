import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { apiErrorFor } from '@/lib/api-errors'
import { denseSeries, utcDayKeys, type AdminOverview } from '@/lib/admin/overview'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/overview — the extra numbers on the admin home bento that no
 * other endpoint returns: tests started, integrity attempts awaiting review,
 * AI calls and sign-ups per day. Counts only (no user data). Superadmin only.
 * Users total comes from /api/admin/metrics, MRR from /api/admin/billing/metrics.
 */
export async function GET() {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  try {
    const { getMongoDb } = await import('@/lib/mongodb')
    const db = await getMongoDb()
    const now = new Date()
    const days14 = utcDayKeys(now, 14)
    const days30 = utcDayKeys(now, 30)
    const from14 = `${days14[0]}T00:00:00.000Z`
    const from30 = `${days30[0]}T00:00:00.000Z`

    const attempts = db.collection('integrity_attempts')
    const [testRows, flagsOpen, aiTotals, aiRows, signupRows] = await Promise.all([
      // first_at is an ISO string; uses the existing first_at/target indexes where present.
      attempts.aggregate<{ _id: string; n: number }>([
        { $match: { first_at: { $gte: from14 } } },
        { $group: { _id: { $substrBytes: ['$first_at', 0, 10] }, n: { $sum: 1 } } },
      ]).toArray(),
      attempts.countDocuments({
        last_at: { $gte: from30 },
        'review.status': { $nin: ['reviewed', 'cleared'] },
        $expr: { $gt: [{ $size: { $objectToArray: { $ifNull: ['$counts', {}] } } }, 0] },
      }),
      db.collection('ai_usage').aggregate<{ requests: number; failed: number; tokens: number }>([
        { $match: { createdAt: { $gte: new Date(from30) } } },
        { $group: { _id: null, requests: { $sum: 1 }, failed: { $sum: { $cond: ['$ok', 0, 1] } }, tokens: { $sum: { $add: [{ $ifNull: ['$promptTokens', 0] }, { $ifNull: ['$completionTokens', 0] }] } } } },
      ]).toArray(),
      db.collection('ai_usage').aggregate<{ _id: string; n: number }>([
        { $match: { createdAt: { $gte: new Date(from30) } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'UTC' } }, n: { $sum: 1 } } },
      ]).toArray(),
      db.collection('user').aggregate<{ _id: string; n: number }>([
        { $match: { createdAt: { $gte: new Date(from14) } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'UTC' } }, n: { $sum: 1 } } },
      ]).toArray(),
    ])
    const tests = denseSeries(testRows, days14)
    const ai = aiTotals[0] ?? { requests: 0, failed: 0, tokens: 0 }
    const body: AdminOverview = {
      tests: { today: tests[tests.length - 1] ?? 0, by_day: tests },
      flags: { open: flagsOpen },
      ai: { requests: ai.requests, failed: ai.failed, tokens: ai.tokens, by_day: denseSeries(aiRows, days30) },
      signups: { by_day: denseSeries(signupRows, days14) },
    }
    return NextResponse.json(body, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) {
    console.error('[admin/overview]', (e as Error)?.message)
    return NextResponse.json(apiErrorFor('server_error_retry'), { status: 500 })
  }
}
