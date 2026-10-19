/** POST /api/admin/agent/bundles/[id]/cancel — cancel a pending bundle and all its steps. */
import { NextResponse } from 'next/server'
import { requireAgentCaller } from '@/lib/agent/http'
import { cancelBundle } from '@/lib/agent/bundles'
import { serverBundleStore } from '@/lib/agent/bundle-store'
import { limitRequest } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAgentCaller()
  if ('response' in gate) return gate.response
  const limited = await limitRequest(req, 'admin-agent-action', gate.caller.userId, 30, 60_000)
  if (limited) return limited
  const { id } = await params
  const r = await cancelBundle(gate.caller, id, serverBundleStore())
  if (!r.ok) return NextResponse.json({ error: r.error, bundle: r.bundle }, { status: r.status })
  return NextResponse.json({ bundle: r.bundle, actions: r.actions, replayed: !!r.replayed })
}
