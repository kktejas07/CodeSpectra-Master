import { NextResponse } from 'next/server'
import { getMongoDb } from '@/lib/mongodb'
import { resolvePistonUrl } from '@/lib/piston'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ComponentStatus = { name: string; status: 'operational' | 'degraded' | 'down'; latency?: number; message?: string }


/**
 * Historical rows were written with vendor-revealing names before 2026-11-02.
 * Normalise on read so old records cannot leak "MongoDB"/"Piston"/"local
 * executor" on a public page, whatever is stored.
 */
const NEUTRAL_NAMES: [RegExp, string][] = [
  [/database|mongo/i, 'Database'],
  [/api/i, 'API'],
  [/piston|code execution|sandbox/i, 'Code execution'],
  [/email/i, 'Email delivery'],
]

function neutralName(name: unknown): string {
  const raw = String(name ?? '')
  for (const [re, label] of NEUTRAL_NAMES) if (re.test(raw)) return label
  return 'Service'
}

function sanitizeLog(log: any) {
  if (!log || !Array.isArray(log.components)) return log
  return {
    ...log,
    // Drop `message` too: it held "Using local executor" / "HTTP <status>".
    components: log.components.map((c: any) => ({ name: neutralName(c?.name), status: c?.status, latency: c?.latency })),
  }
}

export async function GET() {
  const components: ComponentStatus[] = []

  // Live Checks
  // MongoDB
  const mongoStart = Date.now()
  try {
    const db = await getMongoDb()
    await db.command({ ping: 1 })
    // Public page: never name the vendor or the sandbox implementation — that
    // tells an attacker exactly what to fingerprint (2026-11-02).
    components.push({ name: 'Database', status: 'operational', latency: Date.now() - mongoStart })
  } catch {
    components.push({ name: 'Database', status: 'down' })
  }

  // Next.js API
  components.push({ name: 'API', status: 'operational' })

  // Code execution: probe the resolver the grader actually uses (platform
  // setting). The old check read an env var that is unset in Docker, so it
  // reported "Using local executor" while the sandbox was healthy.
  const sandboxStart = Date.now()
  try {
    const pistonUrl = await resolvePistonUrl()
    if (!pistonUrl) {
      components.push({ name: 'Code execution', status: 'degraded' })
    } else {
      const res = await fetch(`${pistonUrl}/runtimes`, { signal: AbortSignal.timeout(5000) })
      components.push({
        name: 'Code execution',
        status: res.ok ? 'operational' : 'degraded',
        latency: Date.now() - sandboxStart,
      })
    }
  } catch {
    components.push({ name: 'Code execution', status: 'degraded' })
  }

  // AI vendors are deliberately NOT listed: naming the configured providers
  // tells an attacker which keys to hunt for, and those entries were only
  // env-presence guesses rather than real checks.

  // Email
  if (process.env.RESEND_API_KEY || process.env.SENDGRID_API_KEY) {
    components.push({ name: 'Email delivery', status: 'operational' })
  } else {
    components.push({ name: 'Email delivery', status: 'degraded' })
  }

  const allOperational = components.every((c) => c.status === 'operational')
  const overallStatus = allOperational ? 'operational' : components.some((c) => c.status === 'down') ? 'down' : 'degraded'

  // Fetch Historical Data
  let logs: any[] = []
  try {
    const db = await getMongoDb()
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
    logs = await db.collection('status_logs').find({
      timestamp: { $gte: ninetyDaysAgo }
    }).sort({ timestamp: 1 }).toArray()
  } catch (e) {
    console.error('Failed to fetch historical status logs:', e)
  }

  // If there are no logs yet (new installation), we mock the history structure so the UI works
  // We'll create a single log entry representing right now based on the live check
  if (logs.length === 0) {
    logs.push({
      timestamp: new Date().toISOString(),
      status: overallStatus,
      components,
    })
  }

  return NextResponse.json({
    status: overallStatus,
    updated_at: new Date().toISOString(),
    components,
    historical_logs: logs.map(sanitizeLog)
  })
}
