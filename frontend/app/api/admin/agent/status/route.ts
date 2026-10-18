/** GET /api/admin/agent/status — the model the copilot tries first + the caller's AI credits. */
import { NextResponse } from 'next/server'
import { requireAgentCaller } from '@/lib/agent/http'
import { resolveModel } from '@/lib/ai/get-user-model'
import { getUserAiCredits } from '@/lib/user-credits'

export const dynamic = 'force-dynamic'

export async function GET() {
  const gate = await requireAgentCaller()
  if ('response' in gate) return gate.response
  // ponytail: resolveModel only (no key lookups) — getApiKey bumps key usage
  // counters, so the indicator must not walk the fallback chain.
  const [pref, credits] = await Promise.all([
    resolveModel(gate.caller.userId, 'chat_model').catch(() => null),
    getUserAiCredits(gate.caller.userId).catch(() => null),
  ])
  return NextResponse.json({
    model: pref?.providerOverride && pref.modelOverride ? { provider: pref.providerOverride, model: pref.modelOverride } : null,
    credits: credits ? { balance: credits.balance, allowance: credits.allowance, resets_at: credits.resets_at } : null,
    role: gate.caller.role,
    pricing: 'Each message costs 1 AI credit, plus 1 for every 4 tool steps. Failed or stopped messages are free.',
  })
}
