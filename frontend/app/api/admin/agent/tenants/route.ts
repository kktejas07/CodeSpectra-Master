/**
 * GET /api/admin/agent/tenants — organisations for the superadmin tenant
 * picker (copilot + knowledge). Superadmin only.
 */
import { NextResponse } from 'next/server'
import { requireAgentCaller } from '@/lib/agent/http'
import { listTenantOptions } from '@/lib/agent/scope-tenant'

export const dynamic = 'force-dynamic'

export async function GET() {
  const gate = await requireAgentCaller()
  if ('response' in gate) return gate.response
  if (gate.caller.role !== 'superadmin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    return NextResponse.json({ tenants: await listTenantOptions() })
  } catch (e) {
    console.error('[agent/tenants] list failed:', e)
    return NextResponse.json({ error: 'Could not load organisations' }, { status: 500 })
  }
}
