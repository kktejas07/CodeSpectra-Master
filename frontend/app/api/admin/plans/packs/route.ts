import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { billingPacks, DEFAULT_PROBLEM_PACKS, nowIso, type ProblemPackDoc } from '@/lib/db/billing'
import { problems } from '@/lib/db/problems'
import { getMongoDb } from '@/lib/mongodb'
import { isValidPlanId } from '@/lib/billing-plan-mode'
import { invalidateProblemPacks, loadProblemPacks } from '@/lib/entitlements'
import { auditAdmin } from '@/lib/admin-audit'

export const dynamic = 'force-dynamic'

const SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,127}$/i
const TOPIC_RE = /^[a-z0-9][a-z0-9 _+#.-]{0,63}$/i

function list(v: unknown, re: RegExp, max: number): string[] | null {
  const raw = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[\n,]/) : []
  const out = [...new Set(raw.map((x) => (typeof x === 'string' ? x.trim().toLowerCase() : '')).filter(Boolean))]
  if (out.length > max || out.some((x) => !re.test(x))) return null
  return out
}

/** Whitelist a pack body. Pack ids are checkout plan ids, so they must not clash with plan keys. */
function parsePack(b: Record<string, unknown>): { ok: true; doc: ProblemPackDoc } | { ok: false; error: string } {
  if (!isValidPlanId(b.id)) return { ok: false, error: 'Pack ID must be 1–64 letters, numbers, _ or -' }
  const id = String(b.id).toLowerCase()
  if (['free', 'pro', 'enterprise', 'pro_monthly', 'pro_yearly'].includes(id)) return { ok: false, error: 'That ID is used by a plan' }
  const name = typeof b.name === 'string' ? b.name.trim().slice(0, 80) : ''
  if (!name) return { ok: false, error: 'Name is required' }
  const price = Number(b.price)
  if (!Number.isFinite(price) || price < 0 || price > 1_000_000) return { ok: false, error: 'Price must be 0 or more' }
  const currency = typeof b.currency === 'string' ? b.currency.trim().toUpperCase() : ''
  if (!/^[A-Z]{3}$/.test(currency)) return { ok: false, error: 'Currency must be a 3-letter code like INR or USD' }
  const slugs = list(b.problem_slugs, SLUG_RE, 2000)
  if (!slugs) return { ok: false, error: 'Problem slugs must be valid slugs (max 2000)' }
  const topics = list(b.topics, TOPIC_RE, 50)
  if (!topics) return { ok: false, error: 'Topics must be short words (max 50)' }
  const plans = list(b.included_in_plans, /^[a-z0-9][a-z0-9_-]{0,63}$/, 20)
  if (!plans) return { ok: false, error: 'Included plans must be plan IDs' }
  return {
    ok: true,
    doc: {
      id,
      name,
      description: typeof b.description === 'string' ? b.description.trim().slice(0, 300) : '',
      price: Math.round(price * 100) / 100,
      currency,
      problem_slugs: slugs,
      topics,
      included_in_plans: plans,
      active: b.active !== false,
    },
  }
}

/** GET /api/admin/plans/packs — the pack catalog (defaults + saved). */
export async function GET() {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  try {
    return NextResponse.json({ packs: await loadProblemPacks({ fresh: true }) })
  } catch (e) {
    console.error('[admin/plans/packs] GET', e)
    return NextResponse.json({ error: 'Could not load packs. Try again.' }, { status: 500 })
  }
}

/** POST /api/admin/plans/packs — create or update a pack and the problems in it. */
export async function POST(request: Request) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  const parsed = parsePack(body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const doc = parsed.doc
  try {
    if (await (await getMongoDb()).collection('plans').findOne({ plan: doc.id }, { projection: { _id: 1 } })) {
      return NextResponse.json({ error: 'That ID is used by a plan' }, { status: 400 })
    }
    if (doc.problem_slugs.length) {
      const found = await (await problems())
        .find({ slug: { $in: doc.problem_slugs } }, { projection: { slug: 1 } })
        .toArray()
      const known = new Set(found.map((p) => p.slug))
      const missing = doc.problem_slugs.filter((s) => !known.has(s))
      if (missing.length) {
        return NextResponse.json({ error: `Unknown problem slug(s): ${missing.slice(0, 10).join(', ')}` }, { status: 400 })
      }
    }
    const col = await billingPacks()
    const ts = nowIso()
    const res = await col.updateOne({ id: doc.id }, { $set: { ...doc, updated_at: ts }, $setOnInsert: { created_at: ts } }, { upsert: true })
    invalidateProblemPacks()
    const created = res.upsertedCount > 0 && !DEFAULT_PROBLEM_PACKS.some((p) => p.id === doc.id)
    await auditAdmin(gate.user, created ? 'admin.pack.create' : 'admin.pack.update', 'plan', `pack/${doc.id}`)
    return NextResponse.json({ pack: doc })
  } catch (e) {
    console.error('[admin/plans/packs] POST', e)
    return NextResponse.json({ error: 'Could not save the pack. Try again.' }, { status: 500 })
  }
}

/**
 * DELETE /api/admin/plans/packs?id= — remove a saved pack: its problems
 * unlock for everyone. Buyers keep the pack id on their account.
 */
export async function DELETE(request: Request) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const id = new URL(request.url).searchParams.get('id') || ''
  if (!isValidPlanId(id)) return NextResponse.json({ error: 'id required' }, { status: 400 })
  if (DEFAULT_PROBLEM_PACKS.some((p) => p.id === id)) {
    return NextResponse.json({ error: 'Built-in packs cannot be deleted. Remove their problems or stop selling them instead.' }, { status: 400 })
  }
  try {
    const res = await (await billingPacks()).deleteOne({ id })
    if (res.deletedCount === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    invalidateProblemPacks()
    await auditAdmin(gate.user, 'admin.pack.delete', 'plan', `pack/${id}`, undefined, 'warning')
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[admin/plans/packs] DELETE', e)
    return NextResponse.json({ error: 'Could not delete the pack. Try again.' }, { status: 500 })
  }
}
