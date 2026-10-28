/**
 * GET /api/admin/agent/settings — copilot budget + metering settings (superadmin).
 * PUT /api/admin/agent/settings — update them (validated + clamped; audited).
 *     { meter: { tokensPerCredit, usdPerCredit }, tenant_daily_tokens, tenant_monthly_tokens,
 *       platform_daily_tokens, platform_monthly_tokens, user_messages_per_minute,
 *       user_messages_per_hour, max_steps_per_turn, max_tokens_per_turn,
 *       tenant_overrides: { <tenantId>: { daily_tokens?, monthly_tokens? } | null } }
 */
import { NextResponse } from 'next/server'
import { auditAgent, readJson, requireAgentCaller } from '@/lib/agent/http'
import { getBudgetSettings, saveBudgetSettings } from '@/lib/agent/usage'
import { limitRequest } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

export async function GET() {
  const gate = await requireAgentCaller()
  if ('response' in gate) return gate.response
  if (gate.caller.role !== 'superadmin') return NextResponse.json({ error: 'Only platform admins can change copilot budgets.' }, { status: 403 })
  return NextResponse.json({ settings: await getBudgetSettings() })
}

export async function PUT(req: Request) {
  const gate = await requireAgentCaller()
  if ('response' in gate) return gate.response
  if (gate.caller.role !== 'superadmin') return NextResponse.json({ error: 'Only platform admins can change copilot budgets.' }, { status: 403 })
  const limited = await limitRequest(req, 'admin-agent-settings', gate.caller.userId, 20, 60_000)
  if (limited) return limited
  const body = await readJson(req)
  if (!body) return NextResponse.json({ error: 'Send the settings as a JSON object.' }, { status: 400 })
  const settings = await saveBudgetSettings(body, gate.caller.userId)
  await auditAgent({ id: gate.caller.userId }, 'agent.settings.update', 'budget', JSON.stringify(settings).slice(0, 900), 'warning').catch(() => undefined)
  return NextResponse.json({ settings })
}
