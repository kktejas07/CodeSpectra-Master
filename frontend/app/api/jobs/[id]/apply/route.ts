import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { jobs, jobApplications, newId, nowIso } from '@/lib/db/content'
import type { IdRouteContext } from '@/lib/app-route-context'

export async function POST(request: Request, { params }: IdRouteContext) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  const { id } = await params
  try {
    const body = (await request.json().catch(() => ({}))) as {
      resumeId?: string
      coverLetter?: string
    }

    const appsCol = await jobApplications()
    const existing = await appsCol.findOne({ job_id: id, user_id: gate.user.id })
    if (existing) {
      return NextResponse.json({
        success: true,
        applicationId: existing.id,
        jobId: id,
        appliedAt: existing.applied_at,
        alreadyApplied: true,
      })
    }

    const doc = {
      id: newId(),
      job_id: id,
      user_id: gate.user.id,
      resume_id: body.resumeId ?? null,
      cover_letter: body.coverLetter ?? null,
      status: 'submitted' as const,
      applied_at: nowIso(),
    }
    await appsCol.insertOne(doc)

    const jobsCol = await jobs()
    await jobsCol.updateOne({ id }, { $inc: { applicants: 1 } })

    return NextResponse.json({
      success: true,
      applicationId: doc.id,
      jobId: id,
      appliedAt: doc.applied_at,
    })
  } catch (error) {
    console.error('[CodeSpectra] job apply:', error)
    return NextResponse.json({ error: 'Failed to apply for job' }, { status: 400 })
  }
}
