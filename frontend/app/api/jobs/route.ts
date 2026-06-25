import { NextResponse, NextRequest } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { jobs, newId, nowIso, type JobDoc } from '@/lib/db/content'
import type { Filter } from 'mongodb'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const location = searchParams.get('location')
    const jobType = searchParams.get('jobType')
    const level = searchParams.get('level')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '10')

    const filter: Filter<JobDoc> = { is_active: true }
    if (jobType) filter.job_type = jobType
    if (level) filter.experience_level = level
    if (location) filter.location = { $regex: location, $options: 'i' }

    const col = await jobs()
    const total = await col.countDocuments(filter)
    const data = await col
      .find(filter)
      .sort({ created_at: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray()

    return NextResponse.json({ data, pagination: { page, limit, total } })
  } catch (error) {
    console.error('[CodeSpectra] Jobs API error:', error)
    return NextResponse.json({ data: [], error: 'Failed to fetch jobs' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  try {
    const body = (await request.json()) as Partial<JobDoc>
    const doc: JobDoc = {
      id: newId(),
      title: String(body.title || 'Untitled role'),
      company: body.company ?? null,
      location: body.location ?? null,
      job_type: body.job_type ?? null,
      experience_level: body.experience_level ?? null,
      description: body.description ?? null,
      requirements: body.requirements ?? null,
      benefits: body.benefits ?? null,
      skills: Array.isArray(body.skills) ? body.skills : [],
      salary: body.salary ?? null,
      applicants: 0,
      is_active: body.is_active !== false,
      created_by: gate.user.id,
      created_at: nowIso(),
    }
    const col = await jobs()
    await col.insertOne(doc)
    return NextResponse.json(doc, { status: 201 })
  } catch (error) {
    console.error('[CodeSpectra] Create job error:', error)
    return NextResponse.json({ error: 'Failed to create job' }, { status: 400 })
  }
}
