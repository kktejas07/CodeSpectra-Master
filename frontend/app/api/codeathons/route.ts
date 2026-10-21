import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { knowledgeOnEventChange } from '@/lib/rag/hooks'
import { createCodeathon } from '@/lib/services/codeathons'
import { isTenantStaff, publicCodeathonView } from '@/lib/exam-access'
import { codeathonListFilter } from '@/lib/hackathons/tenant-scope'

export async function GET(request: Request) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  try {
    const db = await getMongoDb()
    // Company admins: own organization only. Superadmin: everything, or ?tenant=global|<id>.
    // Everyone else: published codeathons that are public or their organisation's (CORE-014).
    const filter = codeathonListFilter(gate.user, new URL(request.url).searchParams.get('tenant'))
    const docs = await db.collection('codeathons').find(filter).toArray()
    // Participants never get hidden test cases (they are the grading key).
    const data = docs.map((d) => (isTenantStaff(gate.user, d) ? d : publicCodeathonView(d)))
    return NextResponse.json({ data })
  } catch { return NextResponse.json({ error: 'Failed', code: 'failed' }, { status: 500 }) }
}

export async function POST(request: Request) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  if (gate.user.role !== 'superadmin' && gate.user.role !== 'tenant_admin') {
    return NextResponse.json({ error: 'Forbidden', code: 'forbidden' }, { status: 403 })
  }
  // A company admin without an organization would create an unowned (platform) event.
  if (gate.user.role === 'tenant_admin' && !gate.user.tenantId) {
    return NextResponse.json({ error: 'Forbidden', code: 'forbidden' }, { status: 403 })
  }
  try {
    const body = await request.json()
    // Shared with the admin agent: lib/services/codeathons createCodeathon.
    const r = await createCodeathon(gate.user, body)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
    return NextResponse.json(r.data, { status: 201 })
  } catch { return NextResponse.json({ error: 'Failed', code: 'failed' }, { status: 500 }) }
}

export async function DELETE(request: Request) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required', code: 'id_required' }, { status: 400 })
    const db = await getMongoDb()
    const existing = await db.collection('codeathons').findOne({ id })
    if (!existing) return NextResponse.json({ error: 'Not found', code: 'not_found' }, { status: 404 })
    if (!isTenantStaff(gate.user, existing)) return NextResponse.json({ error: 'Forbidden', code: 'forbidden' }, { status: 403 })
    await db.collection('codeathons').deleteOne({ id })
    knowledgeOnEventChange('codeathon', id)
    return NextResponse.json({ ok: true })
  } catch { return NextResponse.json({ error: 'Failed', code: 'failed' }, { status: 500 }) }
}
