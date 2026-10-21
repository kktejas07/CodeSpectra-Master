/**
 * Admin → Company patterns. GET lists every pattern with the status of its
 * Easy / Moderate / Tough versions, the bot settings and today's AI usage.
 * POST creates a pattern. Superadmin only.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { aiUsageState, getCompanyTestSettings, listPatterns, patterns, versions } from '@/lib/company-tests/db'
import { PRACTICE_LEVELS, patternFromInput, patternInputSchema, versionSummary, type CompanyTestVersion } from '@/lib/company-tests/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  try {
    const [list, settings, usage] = await Promise.all([listPatterns(), getCompanyTestSettings(true), aiUsageState()])
    const vs = await (await versions()).find({ patternId: { $in: list.map((p) => p.id) } }, { projection: { _id: 0 } }).toArray()
    const byId = new Map<string, CompanyTestVersion>(vs.map((v) => [v.id, v]))
    const items = list.map((p) => ({
      ...p,
      versions: PRACTICE_LEVELS.map((l) => versionSummary(p, l, byId.get(`${p.id}:${l}`))),
    }))
    return NextResponse.json({ items, settings, usage })
  } catch (e) {
    console.error('[admin/company-patterns] GET:', (e as Error)?.message)
    return NextResponse.json({ error: 'Could not load company patterns. Please try again.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const body = await req.json().catch(() => null)
  const parsed = patternInputSchema.safeParse(body)
  if (!parsed.success) {
    const i = parsed.error.issues[0]
    return NextResponse.json({ error: i ? `${i.path.join('.') || 'pattern'}: ${i.message}` : 'Invalid pattern' }, { status: 400 })
  }
  try {
    const doc = patternFromInput(parsed.data, new Date().toISOString(), gate.user.id)
    const col = await patterns()
    if (await col.findOne({ id: doc.id }, { projection: { _id: 1 } })) {
      return NextResponse.json({ error: `A pattern with id “${doc.id}” already exists. Pick another id.` }, { status: 409 })
    }
    await col.insertOne({ ...doc })
    return NextResponse.json({ pattern: doc }, { status: 201 })
  } catch (e) {
    console.error('[admin/company-patterns] POST:', (e as Error)?.message)
    return NextResponse.json({ error: 'Could not save the pattern. Please try again.' }, { status: 500 })
  }
}
