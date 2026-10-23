/**
 * /api/support/assistant — in-app help assistant (signed-in learners and company users).
 * GET  → { enabled, ai } (whether the chat shows and whether it can use the model).
 * POST { q, locale?, history? } (strict) → answer from public help articles + the
 *      caller's OWN records only (lib/assistants/support). Limits: 6/min per user,
 *      Admin → Assistants per-user daily cap, platform daily AI cap, monthly cost cap
 *      and the AI budget hard stop (fallback: help articles + the user's own facts).
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { apiErrorBody, apiErrorFor } from '@/lib/api-errors'
import { limitRequest } from '@/lib/rate-limit'
import { SUPPORT_LIMITS, SupportAskSchema } from '@/lib/assistants/support/policy'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function GET() {
  const user = await getAPIUser().catch(() => null)
  if (!user) return NextResponse.json(apiErrorFor('unauthorized'), { status: 401 })
  const { getAssistantSettings } = await import('@/lib/assistants/store')
  const s = await getAssistantSettings('support').catch(() => null)
  return NextResponse.json({ enabled: !!s?.enabled, ai: !!s?.enabled && !!s?.ai_enabled }, { headers: NO_STORE })
}

export async function POST(req: NextRequest) {
  const user = await getAPIUser().catch(() => null)
  if (!user) return NextResponse.json(apiErrorFor('unauthorized'), { status: 401 })
  const parsed = SupportAskSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json(apiErrorFor('invalid_request'), { status: 400 })
  const perMinute = await limitRequest(req, 'support-assistant:min', user.id, SUPPORT_LIMITS.perMinute, 60_000)
  if (perMinute) return perMinute
  const { getAssistantSettings, countUserQuestion } = await import('@/lib/assistants/store')
  const s = await getAssistantSettings('support')
  if (!s.enabled) return NextResponse.json(apiErrorBody('The help assistant is switched off.', 'assistant_off'), { status: 403 })
  if ((await countUserQuestion('support', user.id)) > s.per_user_daily) {
    return NextResponse.json(apiErrorBody(`You have asked ${s.per_user_daily} questions today. Try again tomorrow or open a ticket.`, 'assistant_daily_limit', { n: s.per_user_daily }), { status: 429 })
  }
  try {
    const { askSupport } = await import('@/lib/assistants/support/service')
    const r = await askSupport({ id: user.id, email: user.email, role: user.role, tenantId: user.tenantId ?? null }, parsed.data)
    return NextResponse.json(r, { headers: NO_STORE })
  } catch (e) {
    console.error('[support-assistant]:', (e as Error)?.message)
    return NextResponse.json(apiErrorFor('server_error'), { status: 500 })
  }
}
