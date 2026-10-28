import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin, gateErrorBody } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { cancelJob, readWorkerStatus, recoverStaleRunningJobs, requeueJob, requeueOrphanRunningJobs } from '@/lib/courses/process-job'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Worker liveness for the Course Generator UI. */
export async function GET() {
  const gate = await requireSuperAdmin() // SEC-029: enforces admin 2FA
  if ('error' in gate) return NextResponse.json(gateErrorBody(gate), { status: gate.status })

  const status = await readWorkerStatus()
  const db = await getMongoDb()
  const running = await db.collection('generation_jobs').findOne(
    { status: 'running' },
    { projection: { id: 1, courseTitle: 1, progress: 1 } },
  )

  const stuck = Boolean(running && (!status.online || !status.currentJobId))
  return NextResponse.json({
    ...status,
    stuck,
    runningJob: running ? { id: running.id, courseTitle: running.courseTitle, progress: running.progress } : null,
    hint: status.online
      ? (stuck
        ? 'A job is marked running but the worker is idle. Click Unstick hung job.'
        : 'Worker is polling. Pending jobs start automatically.')
      : 'Worker is offline. Restart the course-worker app in Dokploy, or click Unstick hung job after it is back.',
  })
}

/** Enqueue / retry / cancel. Generation itself runs in the course-worker container. */
export async function POST(request: NextRequest) {
  const gate = await requireSuperAdmin() // SEC-029: enforces admin 2FA
  if ('error' in gate) return NextResponse.json(gateErrorBody(gate), { status: gate.status })

  try {
    const body = await request.json()
    const action = body.action || 'enqueue'
    const jobId = body.jobId

    if (action === 'unstick') {
      const n = await requeueOrphanRunningJobs()
      return NextResponse.json({ ok: true, requeued: n, message: n ? `Requeued ${n} stuck job(s). Worker will pick them up.` : 'Nothing was stuck.' })
    }

    if (!jobId) return NextResponse.json({ error: 'jobId required' }, { status: 400 })

    if (action === 'retry') {
      const recovered = await recoverStaleRunningJobs()
      const regenerateAll = Boolean(body.regenerateAll)
      const result = await requeueJob(jobId, { regenerateAll })
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 })
      return NextResponse.json({
        ok: true,
        recovered,
        message: regenerateAll
          ? 'Regenerating all videos. Worker will pick this up if it is online.'
          : 'Retrying remaining lessons (keeping successful videos). Worker will pick this up if it is online.',
      })
    }

    if (action === 'cancel') {
      const result = await cancelJob(jobId)
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 })
      return NextResponse.json({ ok: true, message: 'Job cancelled' })
    }

    const db = await getMongoDb()
    const job = await db.collection('generation_jobs').findOne({ id: jobId })
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

    if (job.status === 'running') {
      return NextResponse.json({ queued: true, message: 'Job already running in course-worker' })
    }
    if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
      return NextResponse.json({ error: `Job already ${job.status}` }, { status: 409 })
    }

    return NextResponse.json({
      queued: true,
      message: 'Job is pending. The course-worker container will pick it up automatically.',
    })
  } catch (e) {
    console.error('[worker] POST error:', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.', code: 'server_error' }, { status: 500 })
  }
}
