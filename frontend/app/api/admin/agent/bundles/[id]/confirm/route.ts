/**
 * POST /api/admin/agent/bundles/[id]/confirm — run a bundle of proposals in
 * order after the admin confirmed it. Each step goes through the normal
 * confirm path (session re-auth, role + tenant re-check, re-validation,
 * idempotency, audit); the first failure stops the bundle and cancels the rest.
 */
import { NextResponse } from 'next/server'
import { requireAgentCaller } from '@/lib/agent/http'
import { confirmBundle } from '@/lib/agent/bundles'
import { serverBundleStore } from '@/lib/agent/bundle-store'
import { limitRequest } from '@/lib/rate-limit'
import { chargeMeteredWork, metered } from '@/lib/agent/service'
import { executionCaller } from '@/lib/agent/actions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAgentCaller()
  if ('response' in gate) return gate.response
  const limited = await limitRequest(req, 'admin-agent-action', gate.caller.userId, 30, 60_000)
  if (limited) return limited
  const { id } = await params
  const { value: r, usage } = await metered(() => confirmBundle(gate.caller, id, serverBundleStore()))
  if (usage.length && r.bundle) await chargeMeteredWork(executionCaller(gate.caller, r.bundle), gate.caller.userId, r.bundle.conversationId, usage, 'confirm')
  if (!r.ok) return NextResponse.json({ error: r.error, bundle: r.bundle, actions: r.actions }, { status: r.status })
  return NextResponse.json({ bundle: r.bundle, actions: r.actions, replayed: !!r.replayed })
}
