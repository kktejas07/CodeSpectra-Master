/**
 * GET /api/admin/email-logs — list email delivery logs with filters.
 * Requires superadmin.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { listEmailLogs, getEmailDeliveryStats } from '@/lib/db/email-logs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status') || undefined
    const category = searchParams.get('category') || undefined
    const campaignId = searchParams.get('campaignId') || undefined
    const search = searchParams.get('search') || undefined
    const startDate = searchParams.get('startDate') || undefined
    const endDate = searchParams.get('endDate') || undefined
    const limit = Number(searchParams.get('limit') || '100')
    const skip = Number(searchParams.get('skip') || '0')

    const [result, stats] = await Promise.all([
      listEmailLogs({
        status: status as any,
        category: category as any,
        campaignId,
        search,
        startDate,
        endDate,
        limit: Math.min(limit, 500),
        skip,
      }),
      getEmailDeliveryStats({ startDate, endDate, campaignId }),
    ])

    return NextResponse.json({ logs: result.logs, total: result.total, stats })
  } catch (e: unknown) {
    const msg = 'Failed to load email logs'
    console.error('[email-logs] GET:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
