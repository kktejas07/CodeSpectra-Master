/** GET /api/admin/agent/status — the model the copilot tries first + the caller's AI credits. */
import { NextResponse } from 'next/server'
import { requireAgentCaller } from '@/lib/agent/http'
import { resolveModel } from '@/lib/ai/get-user-model'
import { getUserAiCredits } from '@/lib/user-credits'
import { pricingText } from '@/lib/agent/metering'
import { checkBudget, getBudgetSettings } from '@/lib/agent/usage'

export const dynamic = 'force-dynamic'

export async function GET() {
  const gate = await requireAgentCaller()
  if ('response' in gate) return gate.response
  // ponytail: resolveModel only (no key lookups) — getApiKey bumps key usage
  // counters, so the indicator must not walk the fallback chain.
  const [pref, credits, settings, budget] = await Promise.all([
    resolveModel(gate.caller.userId, 'chat_model').catch(() => null),
    getUserAiCredits(gate.caller.userId).catch(() => null),
    getBudgetSettings(),
    checkBudget(gate.caller).catch(() => null),
  ])
  return NextResponse.json({
    model: pref?.providerOverride && pref.modelOverride ? { provider: pref.providerOverride, model: pref.modelOverride } : null,
    credits: credits ? { balance: credits.balance, allowance: credits.allowance, resets_at: credits.resets_at } : null,
    role: gate.caller.role,
    pricing: pricingText(settings.meter),
    budget: budget ? { daily: budget.daily, monthly: budget.monthly, ok: budget.ok } : null,
  })
}
