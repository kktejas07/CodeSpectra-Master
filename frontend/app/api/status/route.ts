import { NextResponse } from 'next/server'
import { getMongoDb } from '@/lib/mongodb'
import { buildStatusComponents, overallStatusOf, sanitizeStatusLog } from '@/lib/status-components'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Public status feed.
 *
 * Component definitions live in lib/status-components (shared with the writer,
 * /api/cron/status-check) so the read and write sides can never disagree on
 * labels — and so neither can leak the database vendor or the sandbox
 * implementation (2026-11-02).
 */
export async function GET() {
  const components = await buildStatusComponents()

  let logs: unknown[] = []
  try {
    const db = await getMongoDb()
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
    logs = await db
      .collection('status_logs')
      .find({ timestamp: { $gte: ninetyDaysAgo } })
      .sort({ timestamp: -1 })
      .limit(500)
      .toArray()
  } catch {
    logs = []
  }

  return NextResponse.json({
    status: overallStatusOf(components),
    updated_at: new Date().toISOString(),
    components,
    // Rows written before the neutral labels are normalised on read.
    historical_logs: logs.map((l) => sanitizeStatusLog(l as { components?: unknown })),
  })
}
