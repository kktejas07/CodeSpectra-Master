import { NextRequest, NextResponse } from 'next/server'
import { getMongoDb } from '@/lib/mongodb'
import { jobs } from '@/lib/db/content'
import { requireAuth, requireAdmin } from '@/lib/route-auth'

export async function GET(request: NextRequest) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  try {
    const db = await getMongoDb()
    const { searchParams } = new URL(request.url)
    const onlyActive = searchParams.get('active') !== 'false'

    const filter: Record<string, unknown> = onlyActive ? { is_active: true } : {}
    if (gate.user.role === 'tenant_admin') {
      Object.assign(filter, gate.user.tenantId ? { tenant_id: gate.user.tenantId } : { _id: null })
    }
    const data = await db.collection('job_postings')
      .find(filter, { projection: { _id: 0 } })
      .sort({ created_at: -1 })
      .toArray()
    return NextResponse.json({ data })
  } catch { return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}

export async function POST(request: NextRequest) {
  const gate = await requireAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  try {
    const body = await request.json()
    const {
      title, company, location, job_type, experience_level,
      description, requirements, benefits, skills, salary,
    } = body

    if (!title || !company) {
      return NextResponse.json({ error: 'title and company are required' }, { status: 400 })
    }

    const db = await getMongoDb()
    const { newId, nowIso } = await import('@/lib/db/content')
    const doc = {
      id: newId(),
      title: String(title),
      company: String(company),
      location: location ? String(location) : null,
      job_type: job_type ? String(job_type) : null,
      experience_level: experience_level ? String(experience_level) : null,
      description: description ? String(description) : null,
      requirements: requirements ? String(requirements) : null,
      benefits: benefits ? String(benefits) : null,
      skills: Array.isArray(skills) ? skills.map(String) : [],
      salary: salary || null,
      applicants: 0,
      is_active: body.is_active !== false,
      tenant_id: gate.user.tenantId || null,
      created_by: gate.user.id,
      created_at: nowIso(),
    }

    await db.collection('job_postings').insertOne(doc)
    return NextResponse.json({ data: doc }, { status: 201 })
  } catch (e) {
    console.error('[CodeSpectra] jobs POST:', e)
    return NextResponse.json({ error: 'Failed to create job' }, { status: 500 })
  }
}