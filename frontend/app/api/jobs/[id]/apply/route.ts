import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { jobs, jobApplications, newId, nowIso } from '@/lib/db/content'
import type { IdRouteContext } from '@/lib/app-route-context'

// One application per (job, user), enforced by a unique index (created once per process).
let indexReady: Promise<void> | null = null
async function ensureIndex() {
  if (!indexReady) {
    indexReady = (async () => {
      try {
        const col = await jobApplications()
        await col.createIndex({ job_id: 1, user_id: 1 }, { unique: true, name: 'job_user_unique' })
      } catch (e: any) {
        console.warn('[jobs/apply] unique index not created:', e?.message)
      }
    })()
  }
  return indexReady
}

export async function POST(request: Request, { params }: IdRouteContext) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  const { id } = await params
  try {
    const body = (await request.json().catch(() => ({}))) as {
      resumeId?: unknown
      coverLetter?: unknown
    }
    const resumeId = typeof body.resumeId === 'string' ? body.resumeId.slice(0, 64) : null
    const coverLetter = typeof body.coverLetter === 'string' ? body.coverLetter.slice(0, 5000) : null

    const jobsCol = await jobs()
    const job = await jobsCol.findOne({ id }, { projection: { id: 1, is_active: 1, ats_job_id: 1 } })
    if (!job || !job.is_active) {
      return NextResponse.json({ error: 'This job is no longer open' }, { status: 404 })
    }

    // Mirrored hiring-pipeline job: the application goes into the ATS (with the
    // applicant's primary résumé). The legacy row below is still written so the
    // job board's "already applied" state and old listings keep working.
    const atsJobId = (job as { ats_job_id?: unknown }).ats_job_id
    if (typeof atsJobId === 'string' && atsJobId) {
      try {
        const { atsJobs } = await import('@/lib/ats/db')
        const { applyToJob } = await import('@/lib/ats/apply')
        const atsJob = await (await atsJobs()).findOne({ id: atsJobId }, { projection: { _id: 0 } })
        if (atsJob) {
          await applyToJob(atsJob as never, {
            user: { id: gate.user.id, email: gate.user.email, name: gate.user.fullName || gate.user.name },
            cover_letter: coverLetter,
          })
        }
      } catch (e: any) {
        if (typeof e?.status === 'number' && e.status < 500) {
          return NextResponse.json({ error: e.message }, { status: e.status })
        }
        throw e
      }
    }

    await ensureIndex()
    const appsCol = await jobApplications()
    const doc = {
      id: newId(),
      job_id: id,
      user_id: gate.user.id,
      resume_id: resumeId,
      cover_letter: coverLetter,
      status: 'submitted' as const,
      applied_at: nowIso(),
    }
    // Atomic: inserts only if this user has not applied yet.
    const r = await appsCol
      .updateOne({ job_id: id, user_id: gate.user.id }, { $setOnInsert: doc }, { upsert: true })
      .catch((e: any) => {
        if (e?.code === 11000) return null
        throw e
      })

    if (!r || r.upsertedCount === 0) {
      const existing = await appsCol.findOne({ job_id: id, user_id: gate.user.id })
      return NextResponse.json({
        success: true,
        applicationId: existing?.id ?? null,
        jobId: id,
        appliedAt: existing?.applied_at ?? null,
        alreadyApplied: true,
      })
    }

    // ATS-mirrored postings are counted by the ATS intake (applyToJob).
    if (!(typeof atsJobId === 'string' && atsJobId)) await jobsCol.updateOne({ id }, { $inc: { applicants: 1 } })

    return NextResponse.json({
      success: true,
      applicationId: doc.id,
      jobId: id,
      appliedAt: doc.applied_at,
    })
  } catch (error) {
    console.error('[CodeSpectra] job apply:', error)
    return NextResponse.json({ error: 'Failed to apply for job' }, { status: 500 })
  }
}
