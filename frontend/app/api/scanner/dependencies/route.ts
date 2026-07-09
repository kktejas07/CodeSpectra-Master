import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { scanDependencies } from '@/lib/dependency-scanner'
import { rateLimitAI } from '@/lib/in-memory-rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  const rateCheck = rateLimitAI(req, gate.user.id)
  if (!rateCheck.ok) {
    return NextResponse.json({ error: `Rate limit. Try in ${rateCheck.retryAfterSec}s.` }, { status: 429 })
  }

  try {
    const { files } = await req.json() as { files: { path: string; content: string }[] }
    if (!files?.length) {
      return NextResponse.json({ error: 'files array required' }, { status: 400 })
    }

    const result = await scanDependencies(files)
    return NextResponse.json(result)
  } catch (e) {
    console.error('[dependency-scan]', e)
    return NextResponse.json({ error: 'Scan failed' }, { status: 500 })
  }
}
