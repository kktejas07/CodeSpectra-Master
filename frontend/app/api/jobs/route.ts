import { NextRequest, NextResponse } from 'next/server'
import { getMongoDb } from '@/lib/mongodb'
import { jobs } from '@/lib/db/content'
import { requireAdmin, getAPIUser, isAdminCaller } from '@/lib/route-auth'
import { limitRequest } from '@/lib/rate-limit'

const PUBLIC_JOB_PROJECTION = { _id: 0, created_by: 0, tenant_id: 0 } as const

/**
 * GET /api/jobs — public list of active job postings (the /jobs board works
 * signed out). Staff (superadmin / tenant_admin) get their management view:
 * `?active=false` includes inactive posts, and tenant_admin sees only their tenant.
 */
export async function GET(request: NextRequest) {
  const user = await getAPIUser()
  if (!user) {
    const limited = await limitRequest(request, 'jobs-public', null, 60, 60_000)
    if (limited) return limited
  }
  try {
    const db = await getMongoDb()
    const { searchParams } = new URL(request.url)
    // SEC-029: an admin who still owes 2FA gets the public list.
    const isStaff = isAdminCaller(user)

    if (!isStaff) {
      const data = await db.collection('job_postings')
        .find({ is_active: true }, { projection: PUBLIC_JOB_PROJECTION })
        .sort({ created_at: -1 })
        .limit(500)
        .toArray()
      return NextResponse.json({ data })
    }

    const onlyActive = searchParams.get('active') !== 'false'
    const filter: Record<string, unknown> = onlyActive ? { is_active: true } : {}
    // role-scope: a tenant admin sees only their tenant's posts
    if (user!.role === 'tenant_admin') {
      Object.assign(filter, user!.tenantId ? { tenant_id: user!.tenantId } : { _id: null })
    }
    const data = await db.collection('job_postings')
      .find(filter, { projection: { _id: 0 } })
      .sort({ created_at: -1 })
      .toArray()
    return NextResponse.json({ data })
  } catch { return NextResponse.json({ error: 'Failed to load jobs' }, { status: 500 }) }
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