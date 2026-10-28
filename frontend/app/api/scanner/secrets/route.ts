import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { scanSecrets, getSecretStats } from '@/lib/secret-scanner'
import { rateLimitAIRedis } from '@/lib/upstash-rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  const rateCheck = await rateLimitAIRedis(req, gate.user.id)
  if (!rateCheck.ok) {
    return NextResponse.json({ error: `Rate limit. Try in ${rateCheck.retryAfterSec}s.`, code: 'rate_limited_seconds', params: { seconds: rateCheck.retryAfterSec } }, { status: 429 })
  }

  try {
    const { code, filename } = await req.json() as { code: string; filename?: string }
    if (!code) {
      return NextResponse.json({ error: 'code required' }, { status: 400 })
    }

    const findings = scanSecrets(code.slice(0, 100_000), filename)
    const stats = getSecretStats(findings)

    return NextResponse.json({ findings, stats })
  } catch (e) {
    console.error('[secret-scan]', e)
    return NextResponse.json({ error: 'Scan failed' }, { status: 500 })
  }
}
