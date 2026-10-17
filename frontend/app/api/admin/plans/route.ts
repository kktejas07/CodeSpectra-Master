import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { getDefaultPlans, type PlanFeature } from '@/lib/plans-client'
import { invalidatePlanCache } from '@/lib/plans'
import { isValidPlanId } from '@/lib/billing-plan-mode'
import { mergePlanDefinition } from '@/lib/entitlements-core'
import { billingSubscriptions } from '@/lib/db/billing'
import { auditAdmin } from '@/lib/admin-audit'

export const dynamic = 'force-dynamic'

const FEATURE_TYPES = new Set(['boolean', 'count', 'pages'])

function str(v: unknown, max: number): string | undefined {
  return typeof v === 'string' ? v.trim().slice(0, max) : undefined
}

/** Whitelist a plan body (D21). Returns the doc fields or an error. */
function parsePlan(body: Record<string, unknown>): { ok: true; doc: Record<string, unknown> } | { ok: false; error: string } {
  if (!isValidPlanId(body.plan)) return { ok: false, error: 'Plan ID must be 1–64 letters, numbers, _ or -' }
  const name = str(body.name, 80)
  if (!name) return { ok: false, error: 'Name is required' }
  const doc: Record<string, unknown> = { plan: String(body.plan).toLowerCase(), name, description: str(body.description, 500) ?? '' }
  if (body.price !== undefined) {
    if (typeof body.price === 'number' && Number.isFinite(body.price) && body.price >= 0) doc.price = body.price
    else if (typeof body.price === 'string') doc.price = body.price.trim().slice(0, 40)
    else return { ok: false, error: 'Price must be a number or text like "29/month" or "Contact us"' }
  }
  if (body.yearlyPrice !== undefined && body.yearlyPrice !== null && body.yearlyPrice !== '') {
    const y = Number(body.yearlyPrice)
    if (!Number.isFinite(y) || y < 0) return { ok: false, error: 'Yearly price must be 0 or more' }
    doc.yearlyPrice = y
  }
  if (body.contactSales !== undefined) doc.contactSales = body.contactSales === true
  if (body.popular !== undefined) doc.popular = body.popular === true
  if (body.currency !== undefined && body.currency !== null && body.currency !== '') {
    if (typeof body.currency !== 'string' || !/^[A-Z]{3}$/.test(body.currency)) return { ok: false, error: 'Currency must be a 3-letter code like INR or USD' }
    doc.currency = body.currency
  }
  if (body.features !== undefined) {
    if (!Array.isArray(body.features) || body.features.length > 50) return { ok: false, error: 'Features must be a list (max 50)' }
    const features: PlanFeature[] = []
    for (const f of body.features as Array<Record<string, unknown>>) {
      if (!f || typeof f !== 'object' || typeof f.key !== 'string' || !/^[a-z0-9_]{1,64}$/.test(f.key)) {
        return { ok: false, error: 'Each feature needs a key (lowercase letters, numbers, _)' }
      }
      const limit = f.limit === undefined ? undefined : Number(f.limit)
      if (limit !== undefined && (!Number.isInteger(limit) || limit < -1 || limit > 10_000_000)) {
        return { ok: false, error: `Limit for ${f.key} must be a whole number (-1 = unlimited)` }
      }
      features.push({
        key: f.key,
        label: str(f.label, 80) || f.key,
        description: str(f.description, 200) || '',
        enabled: f.enabled === true,
        ...(limit !== undefined ? { limit } : {}),
        type: (FEATURE_TYPES.has(String(f.type)) ? f.type : 'boolean') as PlanFeature['type'],
      })
    }
    doc.features = features
  }
  return { ok: true, doc }
}

/**
 * GET /api/admin/plans — list all plans (auto-seeds if empty). Features the
 * stored plan lacks are filled from the defaults, so new enforced limits
 * (seats, assessments, AI credits) show up in the editor.
 */
export async function GET() {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  try {
    const db = await getMongoDb()
    const col = db.collection('plans')
    let plans = await col.find({}, { projection: { _id: 0 } }).toArray()

    if (plans.length === 0) {
      const now = new Date().toISOString()
      await col.insertMany(getDefaultPlans().map((p) => ({ ...p, createdAt: now, updatedAt: now })) as never)
      invalidatePlanCache()
      plans = await col.find({}, { projection: { _id: 0 } }).toArray()
    }

    return NextResponse.json({ plans: plans.map((p) => mergePlanDefinition(String(p.plan), p as never)) })
  } catch (e: unknown) {
    console.error('[CodeSpectra] admin/plans:', e)
    return NextResponse.json({ error: 'Something went wrong with plans. Try again.' }, { status: 500 })
  }
}

/** POST /api/admin/plans — create or update a plan (validated, audited). */
export async function POST(request: Request) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  const parsed = parsePlan(body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const doc: Record<string, unknown> & { plan: string } = { ...parsed.doc, plan: String(parsed.doc.plan), updatedAt: new Date().toISOString() }

  try {
    const col = (await getMongoDb()).collection('plans')
    const existing = await col.findOne({ plan: doc.plan })
    if (existing) await col.updateOne({ plan: doc.plan }, { $set: doc })
    else await col.insertOne({ ...doc, createdAt: new Date().toISOString() })
    invalidatePlanCache()
    await auditAdmin(gate.user, existing ? 'admin.plan.update' : 'admin.plan.create', 'plan', `plan/${doc.plan}`)
    return NextResponse.json({ plan: doc })
  } catch (e: unknown) {
    console.error('[CodeSpectra] admin/plans:', e)
    return NextResponse.json({ error: 'Something went wrong with plans. Try again.' }, { status: 500 })
  }
}

/** DELETE /api/admin/plans?plan= — remove a plan nobody is subscribed to. Free can't be removed. */
export async function DELETE(request: Request) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const plan = new URL(request.url).searchParams.get('plan') || ''
  if (!isValidPlanId(plan)) return NextResponse.json({ error: 'plan required' }, { status: 400 })
  if (plan === 'free') return NextResponse.json({ error: 'The free plan cannot be deleted.' }, { status: 400 })
  try {
    const live = await (await billingSubscriptions()).countDocuments({ plan_id: plan, status: 'active', ends_at: { $gt: new Date().toISOString() } })
    if (live > 0) return NextResponse.json({ error: `${live} active subscription(s) use this plan. Wait for them to end first.` }, { status: 409 })
    const res = await (await getMongoDb()).collection('plans').deleteOne({ plan })
    if (res.deletedCount === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    invalidatePlanCache()
    await auditAdmin(gate.user, 'admin.plan.delete', 'plan', `plan/${plan}`, undefined, 'warning')
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    console.error('[CodeSpectra] admin/plans DELETE:', e)
    return NextResponse.json({ error: 'Something went wrong with plans. Try again.' }, { status: 500 })
  }
}
