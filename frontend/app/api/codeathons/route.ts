import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { getGeneralSettings } from '@/lib/platform-general-settings-server'
import { isTenantStaff, publicCodeathonView } from '@/lib/exam-access'
import { eventListTenantFilter } from '@/lib/hackathons/tenant-scope'

export async function GET(request: Request) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  try {
    const db = await getMongoDb()
    // Company admins: own organization only. Superadmin: everything, or ?tenant=global|<id>.
    const filter = eventListTenantFilter(gate.user, new URL(request.url).searchParams.get('tenant'))
    const docs = await db.collection('codeathons').find(filter).toArray()
    // Participants never get hidden test cases (they are the grading key).
    const data = docs.map((d) => (isTenantStaff(gate.user, d) ? d : publicCodeathonView(d)))
    return NextResponse.json({ data })
  } catch { return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}

export async function POST(request: Request) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  if (gate.user.role !== 'superadmin' && gate.user.role !== 'tenant_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  // A company admin without an organization would create an unowned (platform) event.
  if (gate.user.role === 'tenant_admin' && !gate.user.tenantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  try {
    const body = await request.json()
    const db = await getMongoDb()
    const now = new Date().toISOString()
    const doc = {
      id: crypto.randomUUID(),
      title: body.title,
      description: body.description || '',
      difficulty: body.difficulty || 'Medium',
      topics: body.topics || [],
      rules: body.rules || '',
      maxParticipants: body.maxParticipants || 0,
      startDate: body.startDate || '',
      endDate: body.endDate || '',
      status: body.status || 'upcoming',
      participants: 0,
      prizePool: body.prizePool || '',
      cert_template: body.cert_template || (await getGeneralSettings()).certificate_template,
      problems: body.problems || [],
      // New fields for team/individual mode
      event_type: body.event_type || 'individual', // 'individual' | 'team'
      team_size_min: body.team_size_min || 1,
      team_size_max: body.team_size_max || 1,
      problem_visibility: body.problem_visibility || 'during_contest', // 'during_contest' | 'after_start' | 'immediate'
      tenant_id: gate.user.tenantId || null,
      createdAt: now,
      updatedAt: now,
    }
    await db.collection('codeathons').insertOne(doc)
    return NextResponse.json(doc, { status: 201 })
  } catch { return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}

export async function DELETE(request: Request) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const db = await getMongoDb()
    const existing = await db.collection('codeathons').findOne({ id })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (!isTenantStaff(gate.user, existing)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    await db.collection('codeathons').deleteOne({ id })
    return NextResponse.json({ ok: true })
  } catch { return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
