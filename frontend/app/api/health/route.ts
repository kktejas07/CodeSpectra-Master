import { NextResponse } from 'next/server'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'

// ponytail: 'unconfigured' (optional component absent) is informational and does
// NOT flip overall status; only 'degraded:*' / 'error:*' do. HTTP stays 200
// unless MongoDB itself is down, so container healthchecks don't flap when an
// optional integration (Redis, worker, Piston) is simply not deployed.
function isDegraded(value: string): boolean {
  return value.startsWith('degraded:') || value.startsWith('error:')
}

const errText = (e: unknown) => (e instanceof Error ? e.message : 'unknown')

async function checkSecrets(): Promise<string> {
  try {
    const { readServerSecrets } = await import('@/lib/server-secrets-cache')
    const { pickRuntimeSecret } = await import('@/lib/runtime-secrets')
    const secrets = await readServerSecrets()
    const stored = typeof secrets.session_secret === 'string' ? secrets.session_secret : ''
    const picked = pickRuntimeSecret(process.env.SESSION_SECRET, stored)
    if (picked.source === 'stored') return 'ok'
    if (picked.source === 'env') return 'degraded: env bootstrap (persist to Mongo platform_settings.secrets)'
    return 'degraded: session_secret missing (a new one will be auto-generated)'
  } catch (e) {
    return `degraded: secrets store unreachable (${errText(e)})`
  }
}

async function checkPiston(): Promise<string> {
  try {
    const { readServerSecrets } = await import('@/lib/server-secrets-cache')
    let base = ''
    try {
      base = (await readServerSecrets()).piston_url?.trim().replace(/\/+$/, '') || ''
    } catch { /* cache may not be warm — fall through to env */ }
    if (!base) base = (process.env.PISTON_URL || '').trim().replace(/\/+$/, '')
    if (!base) return 'unconfigured (local executor fallback)'
    const res = await fetch(`${base}/runtimes`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(2000),
    })
    if (!res.ok) return `degraded: runtimes endpoint HTTP ${res.status}`
    return 'ok'
  } catch (e) {
    return `degraded: unreachable (${errText(e)})`
  }
}

async function checkRedis(): Promise<string> {
  try {
    const { readServerSecrets } = await import('@/lib/server-secrets-cache')
    const secrets = await readServerSecrets()
    const url = (process.env.UPSTASH_REDIS_REST_URL || '').trim() || (secrets.upstash_redis_rest_url || '').trim()
    if (!url) return 'unconfigured (in-memory rate limiting fallback)'
    return 'ok: configured'
  } catch (e) {
    return `degraded: config unreadable (${errText(e)})`
  }
}

async function checkWorker(): Promise<string> {
  try {
    const db = await getMongoDb()
    const doc = await db.collection('generation_worker_heartbeat').findOne({ id: 'course-video-worker' })
    const at = doc?.at ? String(doc.at) : null
    if (!at) return 'unconfigured (worker never reported)'
    const ageMs = Date.now() - Date.parse(at)
    if (!Number.isFinite(ageMs)) return 'degraded: heartbeat timestamp unparseable'
    // ponytail: worker ticks every 4s; 60s (vs the 20s admin-UI online window)
    // avoids flapping during job handoff / GC pauses.
    if (ageMs > 60_000) return `degraded: heartbeat stale (${Math.round(ageMs / 1000)}s old)`
    return 'ok'
  } catch (e) {
    return `degraded: heartbeat unreadable (${errText(e)})`
  }
}

export async function GET() {
  const checks: Record<string, string> = {}
  let mongoOk = false

  try {
    const db = await getMongoDb()
    await db.command({ ping: 1 })
    checks.mongodb = 'ok'
    mongoOk = true
  } catch (e) {
    checks.mongodb = `error: ${errText(e)}`
  }

  // Never throw — each check catches internally; belt-and-braces here too.
  try { checks.secrets = await checkSecrets() } catch (e) { checks.secrets = `error: ${errText(e)}` }
  try { checks.piston = await checkPiston() } catch (e) { checks.piston = `error: ${errText(e)}` }
  try { checks.redis = await checkRedis() } catch (e) { checks.redis = `error: ${errText(e)}` }
  try { checks.worker = await checkWorker() } catch (e) { checks.worker = `error: ${errText(e)}` }

  const allOk = mongoOk && !Object.values(checks).some(isDegraded)

  return NextResponse.json(
    {
      status: allOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: mongoOk ? 200 : 503 },
  )
}
