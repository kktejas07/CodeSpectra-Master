import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { adminAuditLogs } from '@/lib/db/misc'
import { sanitizeRegex } from '@/lib/sanitize'

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  const { searchParams } = new URL(req.url)
  const severity = searchParams.get('severity')
  const outcome = searchParams.get('outcome')
  const q = searchParams.get('q')
  const limit = Math.min(parseInt(searchParams.get('limit') || '25'), 200)
  const page = Math.max(parseInt(searchParams.get('page') || '1'), 1)
  const skip = (page - 1) * limit

  try {
    const col = await adminAuditLogs()
    const filter: Record<string, unknown> = {}

    if (severity && severity !== 'all') filter.severity = severity
    if (outcome && outcome !== 'all') filter.outcome = outcome

    const queryFilter = q
      ? {
          $and: [
            filter,
            {
              $or: [
                { action: { $regex: sanitizeRegex(q), $options: 'i' } },
                { actor: { $regex: sanitizeRegex(q), $options: 'i' } },
                { resource: { $regex: sanitizeRegex(q), $options: 'i' } },
                { detail: { $regex: sanitizeRegex(q), $options: 'i' } },
              ],
            },
          ],
        }
      : filter

    const [data, total] = await Promise.all([
      col.find(queryFilter).sort({ ts: -1 }).skip(skip).limit(limit).toArray(),
      col.countDocuments(queryFilter),
    ])

    const stats = {
      total,
      critical: data.filter(r => r.severity === 'critical').length,
      warning: data.filter(r => r.severity === 'warning').length,
      denied: data.filter((r: any) => r.outcome === 'denied' || r.outcome === 'failure').length,
    }

    return NextResponse.json({ data, stats, total, page, limit, pages: Math.ceil(total / limit) })
  } catch (error) {
    console.error('[CodeSpectra] Error fetching audit logs:', error)
    return NextResponse.json({ error: 'Failed to fetch audit logs' }, { status: 500 })
  }
}
