/**
 * GET /api/admin/agent/usage?days=30[&tenant=<id>|platform] — copilot usage
 * numbers (tokens, cost, credits, turns per day, by status, top users, and
 * for superadmins by organisation) plus the budget state. Tenant admins only
 * ever see their own organisation. Used by the copilot usage panel and the
 * analytics dashboards (lib/agent/usage.agentUsageReport).
 */
import { NextResponse } from 'next/server'
import { requireAgentCaller } from '@/lib/agent/http'
import { agentUsageReport, checkBudget, getBudgetSettings } from '@/lib/agent/usage'
import { PLATFORM_KEY } from '@/lib/agent/budget'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const gate = await requireAgentCaller()
  if ('response' in gate) return gate.response
  const { caller } = gate
  const sp = new URL(req.url).searchParams
  const days = Math.max(1, Math.min(366, Number(sp.get('days')) || 30))
  const t = (sp.get('tenant') || '').trim()
  let tenantKey: string | null
  if (caller.role === 'superadmin') tenantKey = t === 'platform' ? PLATFORM_KEY : /^[A-Za-z0-9_-]{1,80}$/.test(t) ? t : null
  else tenantKey = caller.tenantId as string
  try {
    const [report, settings] = await Promise.all([agentUsageReport({ tenantKey, days }), getBudgetSettings()])
    const budget = tenantKey ? await checkBudget({ ...caller, tenantId: tenantKey === PLATFORM_KEY ? null : tenantKey }) : null
    return NextResponse.json({
      ...report,
      ...(budget ? { budget } : {}),
      ...(caller.role === 'superadmin' ? { settings } : { settings: { meter: settings.meter, user_messages_per_minute: settings.user_messages_per_minute, user_messages_per_hour: settings.user_messages_per_hour } }),
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) {
    console.error('[agent/usage] failed:', e)
    return NextResponse.json({ error: 'Could not load copilot usage.' }, { status: 500 })
  }
}
