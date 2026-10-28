/**
 * Admin → Company patterns → one pattern. PATCH replaces it with a validated
 * body (id and createdAt kept); DELETE removes it and its built versions
 * (bank questions stay in the bank). Superadmin only.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { getPattern, patterns, versions } from '@/lib/company-tests/db'
import { patternFromInput, patternInputSchema } from '@/lib/company-tests/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }
const ID_RE = /^[a-z0-9][a-z0-9-]{0,62}$/

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { id } = await params
  if (!ID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  const parsed = patternInputSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    const i = parsed.error.issues[0]
    return NextResponse.json({ error: i ? `${i.path.join('.') || 'pattern'}: ${i.message}` : 'Invalid pattern' }, { status: 400 })
  }
  try {
    const existing = await getPattern(id)
    if (!existing) return NextResponse.json({ error: 'Pattern not found' }, { status: 404 })
    const doc = patternFromInput(parsed.data, new Date().toISOString(), gate.user.id, existing)
    await (await patterns()).replaceOne({ id }, { ...doc })
    return NextResponse.json({ pattern: doc })
  } catch (e) {
    console.error('[admin/company-patterns] PATCH:', (e as Error)?.message)
    return NextResponse.json({ error: 'Could not save the pattern. Please try again.' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { id } = await params
  if (!ID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  try {
    const r = await (await patterns()).deleteOne({ id })
    if (!r.deletedCount) return NextResponse.json({ error: 'Pattern not found' }, { status: 404 })
    await (await versions()).deleteMany({ patternId: id })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[admin/company-patterns] DELETE:', (e as Error)?.message)
    return NextResponse.json({ error: 'Could not delete the pattern. Please try again.' }, { status: 500 })
  }
}
