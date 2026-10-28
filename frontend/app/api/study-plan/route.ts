/**
 * The signed-in learner's study plan.
 * GET → { view | null, targets } · POST { kind, pattern_id?, domains[], days, hours_per_week, timezone?, reminders? } → new plan
 * PATCH { email?, whatsapp?, hour?, timezone? } → reminders · DELETE → remove the plan
 */
import type { NextRequest } from 'next/server'
import { bodyOf, errorResponse, gate, json } from '@/lib/study-plan/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const g = await gate(req)
  if ('res' in g) return g.res
  try {
    const { planView, planTargets } = await import('@/lib/study-plan/service')
    const [view, targets] = await Promise.all([planView(g.user.id), planTargets()])
    return json({ view, targets })
  } catch (e) {
    return errorResponse(e, 'plan read')
  }
}

export async function POST(req: NextRequest) {
  const g = await gate(req, { write: true, bucket: 'study-plan-create', max: 10, windowMs: 60 * 60_000 })
  if ('res' in g) return g.res
  try {
    const { createPlan, planView } = await import('@/lib/study-plan/service')
    await createPlan({ id: g.user.id, tenantId: g.user.tenantId ?? null }, await bodyOf(req))
    return json({ view: await planView(g.user.id) }, 201)
  } catch (e) {
    return errorResponse(e, 'plan create')
  }
}

export async function PATCH(req: NextRequest) {
  const g = await gate(req, { write: true })
  if ('res' in g) return g.res
  try {
    const { updateReminders } = await import('@/lib/study-plan/service')
    return json({ reminders: await updateReminders(g.user.id, await bodyOf(req)) })
  } catch (e) {
    return errorResponse(e, 'plan reminders')
  }
}

export async function DELETE(req: NextRequest) {
  const g = await gate(req, { write: true })
  if ('res' in g) return g.res
  try {
    const { deletePlan } = await import('@/lib/study-plan/service')
    await deletePlan(g.user.id)
    return json({ ok: true })
  } catch (e) {
    return errorResponse(e, 'plan delete')
  }
}
