import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { adminAuditLogs } from '@/lib/db/misc'
import { sanitizeRegex } from '@/lib/sanitize'
import { getMongoDb } from '@/lib/mongodb'

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

    // Resolve actor display names from the user collection for superadmin view
    const actorEmails = [...new Set(
      data
        .map((r: any) => (r.actor || '').toLowerCase().trim())
        .filter((a: string) => a.includes('@') && a !== 'unknown'),
    )]
    let nameMap: Record<string, string> = {}
    if (actorEmails.length > 0) {
      try {
        const db = await getMongoDb()
        const users = await db.collection('user')
          .find({ email: { $in: actorEmails } })
          .project({ email: 1, name: 1, fullName: 1 })
          .toArray()
        for (const u of users) {
          const name = (u as any).fullName || (u as any).name
          if (name && (u as any).email) {
            nameMap[(u as any).email.toLowerCase()] = name
          }
        }
      } catch { /* name resolution is best-effort */ }
    }

    const enriched = data.map((r: any) => ({
      ...r,
      actorName: nameMap[(r.actor || '').toLowerCase().trim()] || undefined,
    }))

    const stats = {
      total,
      critical: data.filter(r => r.severity === 'critical').length,
      warning: data.filter(r => r.severity === 'warning').length,
      denied: data.filter((r: any) => r.outcome === 'denied' || r.outcome === 'failure').length,
    }

    return NextResponse.json({ data: enriched, stats, total, page, limit, pages: Math.ceil(total / limit) })
  } catch (error) {
    console.error('[CodeSpectra] Error fetching audit logs:', error)
    return NextResponse.json({ error: 'Failed to fetch audit logs' }, { status: 500 })
  }
}
