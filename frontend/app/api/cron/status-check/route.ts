import { NextResponse } from 'next/server'
import { withCronHeartbeat } from '@/lib/cron-heartbeat'
import { getMongoDb } from '@/lib/mongodb'
import { requireSuperAdmin } from '@/lib/route-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ComponentStatus = {
  name: string
  status: 'operational' | 'degraded' | 'down'
  latency?: number
  message?: string
}

export const GET = withCronHeartbeat('status-check', getImpl)

async function getImpl(req: Request) {
  // Closed by default: allow the configured cron scheduler (Bearer header or
  // ?secret=, mirroring cron/tick) or an authenticated superadmin session.
  // Previously the check was skipped entirely when CRON_SECRET was unset,
  // leaving the endpoint — and its status_logs writes — open to anyone.
  const expected = process.env.CRON_SECRET?.trim()
  const url = new URL(req.url)
  const fromQuery = url.searchParams.get('secret') || ''
  const fromHeader = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!expected || (fromQuery !== expected && fromHeader !== expected)) {
    const gate = await requireSuperAdmin()
    if ('error' in gate) {
      return NextResponse.json({ error: gate.error }, { status: gate.status })
    }
  }

  const components: ComponentStatus[] = []

  // MongoDB
  const mongoStart = Date.now()
  try {
    const db = await getMongoDb()
    await db.command({ ping: 1 })
    components.push({ name: 'Database (MongoDB)', status: 'operational', latency: Date.now() - mongoStart })
  } catch (e) {
    components.push({ name: 'Database (MongoDB)', status: 'down', message: 'Connection failed' })
  }

  // Next.js API
  components.push({ name: 'API Server', status: 'operational' })

  // Piston
  const pistonStart = Date.now()
  try {
    const pistonUrl = process.env.PISTON_URL || 'http://piston:2000/api/v2'
    const res = await fetch(`${pistonUrl}/runtimes`, { signal: AbortSignal.timeout(5000) })
    components.push({
      name: 'Code Execution (Piston)',
      status: res.ok ? 'operational' : 'degraded',
      latency: Date.now() - pistonStart,
      message: res.ok ? undefined : `HTTP ${res.status}`,
    })
  } catch (e) {
    components.push({ name: 'Code Execution (Piston)', status: 'degraded', message: 'Using local executor' })
  }

  // AI providers
  if (process.env.OPENAI_API_KEY) {
    components.push({ name: 'OpenAI API', status: 'operational' })
  }
  if (process.env.ANTHROPIC_API_KEY) {
    components.push({ name: 'Anthropic API', status: 'operational' })
  }
  if (process.env.GEMINI_API_KEY) {
    components.push({ name: 'Google Gemini API', status: 'operational' })
  }

  // Email
  if (process.env.RESEND_API_KEY || process.env.SENDGRID_API_KEY) {
    components.push({ name: 'Email Service', status: 'operational' })
  } else {
    components.push({ name: 'Email Service', status: 'degraded', message: 'No provider configured' })
  }

  const allOperational = components.every((c) => c.status === 'operational')
  const overallStatus = allOperational ? 'operational' : components.some((c) => c.status === 'down') ? 'down' : 'degraded'

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
