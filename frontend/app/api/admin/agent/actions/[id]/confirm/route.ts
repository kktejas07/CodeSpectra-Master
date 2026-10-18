/**
 * POST /api/admin/agent/actions/[id]/confirm — run a proposal after a human
 * confirmed it. Re-authenticates from the session, re-checks the tool's roles
 * and tenant, re-validates the stored args, executes once (idempotent per id:
 * pending → executing → done | failed) and writes the admin audit log.
 */
import { NextResponse } from 'next/server'
import { auditAgent, requireAgentCaller } from '@/lib/agent/http'
import { confirmAction } from '@/lib/agent/actions'
import { getTool } from '@/lib/agent/tools'
import { limitRequest } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAgentCaller()
  if ('response' in gate) return gate.response
  const limited = await limitRequest(req, 'admin-agent-action', gate.caller.userId, 30, 60_000)
  if (limited) return limited
  const { id } = await params
  const r = await confirmAction(gate.caller, id, { getTool, audit: auditAgent })
  if (!r.ok) return NextResponse.json({ error: r.error, action: r.action }, { status: r.status })
  return NextResponse.json({ action: r.action, result: r.action.result, link: r.action.result?.link ?? null, replayed: !!r.replayed })
}
