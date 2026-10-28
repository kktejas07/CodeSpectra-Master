/**
 * POST /api/admin/hiring-agents/run[?tenant=] { loop } — "Run now". Runs as the
 * signed-in admin (proposals are theirs), works while the agent is switched
 * off, but never past its daily / monthly caps. One run at a time per agent.
 */
import { NextResponse } from 'next/server'
import { readJson } from '@/lib/agent/http'
import { hiringAgentsGate } from '@/lib/agent/hiring-loops/http'
import { isLoopId } from '@/lib/agent/hiring-loops/types'
import { limitRequest } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(req: Request) {
  const gate = await hiringAgentsGate(req)
  if ('response' in gate) return gate.response
  const limited = await limitRequest(req, 'hiring-agents-run', gate.caller.userId, 6, 60 * 60_000)
  if (limited) return limited
  const body = await readJson(req)
  if (!body || !isLoopId(body.loop)) return NextResponse.json({ error: 'Invalid request', code: 'invalid_request' }, { status: 400 })
  const { runHiringLoop } = await import('@/lib/agent/hiring-loops/run')
  const r = await runHiringLoop(body.loop, gate.tenantId, { trigger: 'manual', by: gate.caller })
  return NextResponse.json(r, { status: r.status === 'blocked' && /already/.test(r.message) ? 409 : 200 })
}
