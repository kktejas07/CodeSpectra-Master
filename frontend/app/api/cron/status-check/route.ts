import { NextResponse } from 'next/server'
import { withCronHeartbeat } from '@/lib/cron-heartbeat'
import { withCronWindow } from '@/lib/automation/job-lease'
import { getMongoDb } from '@/lib/mongodb'
import { requireSuperAdmin } from '@/lib/route-auth'
import { isCronAuthorized } from '@/lib/cron-auth'
import { buildStatusComponents, overallStatusOf } from '@/lib/status-components'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ComponentStatus = {
  name: string
  status: 'operational' | 'degraded' | 'down'
  latency?: number
  message?: string
}

// One run per 5-minute window across replicas and external crons (AUTO-041).
export const GET = withCronWindow('status-check', 5, withCronHeartbeat('status-check', getImpl))
// The admin "Run now" button POSTs to every cron path.
export const POST = GET

async function getImpl(req: Request) {
  // Closed by default: allow the configured cron scheduler (Bearer header,
  // constant-time) or an authenticated superadmin session. No CRON_SECRET
  // means no unauthenticated access, even in development.
  if (!isCronAuthorized(req, { allowDevWithoutSecret: false })) {
    const gate = await requireSuperAdmin()
    if ('error' in gate) {
      return NextResponse.json({ error: gate.error }, { status: gate.status })
    }
  }

  // Same builder the public reader uses — one list, one set of labels.
  const components = await buildStatusComponents()
  const overallStatus = overallStatusOf(components)

  const logEntry = {
    timestamp: new Date().toISOString(),
    // ponytail: TTL indexes only fire on BSON Date fields, and `timestamp` is
    // kept as an ISO string for the /api/status reader — so expiry uses this.
    createdAt: new Date(),
    status: overallStatus,
    components,
  }

  try {
    const db = await getMongoDb()
    await db.collection('status_logs').insertOne(logEntry)
  } catch (e) {
    console.error('Failed to write status log to MongoDB:', e)
  }

  return NextResponse.json({ success: true, log: logEntry })
}
