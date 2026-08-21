import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { findBusyJob, clearCourseVideos } from '@/lib/courses/process-job'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface JobLog {
  timestamp: string
  message: string
  type: 'info' | 'success' | 'error' | 'warning'
}

interface GenerationJob {
  id: string
  courseId: string
  courseTitle: string
  type: 'curriculum' | 'video' | 'quiz' | 'poster' | 'all'
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  progress: number
  totalItems: number
  completedItems: number
  failedItems: number
  logs: JobLog[]
  startedAt: string
  completedAt?: string
  error?: string
}

// GET - List all generation jobs
export async function GET(request: NextRequest) {
  const user = await getAPIUser()
  if (!user || user.role !== 'superadmin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const db = await getMongoDb()
    const jobs = await db.collection('generation_jobs')
      .find({})
      .sort({ startedAt: -1 })
      .limit(50)
      .toArray()

    // Old worker marked mixed/zero-success runs as completed. Surface them as failed.
    const normalized = jobs.map((job: any) => {
      if (job.status === 'completed' && (job.failedItems || 0) > 0) {
        return { ...job, status: 'failed' }
      }
      return job
    })

    return NextResponse.json({ jobs: normalized })
  } catch (e) {
    console.error('[jobs] GET error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// POST - Create a new generation job
export async function POST(request: NextRequest) {
  const user = await getAPIUser()
  if (!user || user.role !== 'superadmin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { courseId, courseTitle, type, totalItems, force } = await request.json()

    const db = await getMongoDb()

    const busy = await findBusyJob()
    if (busy) {
      return NextResponse.json(
        { error: `Another generation is already ${busy.status} for "${busy.courseTitle || busy.id}". One job at a time.` },
        { status: 409 },
      )
    }

    if (force) await clearCourseVideos(courseId)

    const job: GenerationJob = {
      id: `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      courseId,
      courseTitle,
      type: type || 'all',
      status: 'pending',
      progress: 0,
      totalItems: totalItems || 0,
      completedItems: 0,
      failedItems: 0,
      logs: [{
        timestamp: new Date().toISOString(),
        message: `Job created for "${courseTitle}"`,
        type: 'info',
      }, {
        timestamp: new Date().toISOString(),
        message: 'Queued — waiting for course-worker (one job at a time)',
        type: 'info',
      }],
      startedAt: new Date().toISOString(),
    }

    await db.collection('generation_jobs').insertOne(job)

    return NextResponse.json({ success: true, job })
  } catch (e) {
    console.error('[jobs] POST error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const user = await getAPIUser()
  if (!user || user.role !== 'superadmin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const jobId = request.nextUrl.searchParams.get('jobId')
    const allFailed = request.nextUrl.searchParams.get('failed') === '1'
    const db = await getMongoDb()

    if (allFailed) {
      const res = await db.collection('generation_jobs').deleteMany({
        $or: [
          { status: 'failed' },
          { status: 'cancelled' },
          { status: 'completed', completedItems: 0, failedItems: { $gt: 0 } },
        ],
      })
      return NextResponse.json({ success: true, deleted: res.deletedCount })
    }

    if (!jobId) return NextResponse.json({ error: 'jobId required' }, { status: 400 })
    const job = await db.collection('generation_jobs').findOne({ id: jobId })
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    if (job.status === 'running') {
      return NextResponse.json({ error: 'Stop or cancel a running job before deleting it' }, { status: 409 })
    }
    await db.collection('generation_jobs').deleteOne({ id: jobId })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[jobs] DELETE error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// PATCH - Update job status/progress
export async function PATCH(request: NextRequest) {
  const user = await getAPIUser()
  if (!user || user.role !== 'superadmin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { jobId, updates } = await request.json()

    if (!jobId) {
      return NextResponse.json({ error: 'jobId required' }, { status: 400 })
    }

    const db = await getMongoDb()
    
    // If adding a log, push to the logs array
    if (updates.log) {
      await db.collection('generation_jobs').updateOne(
        { id: jobId },
        {
          $push: { logs: updates.log },
          $set: { ...updates, log: undefined },
        }
      )
    } else {
      await db.collection('generation_jobs').updateOne(
        { id: jobId },
        { $set: updates }
      )
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[jobs] PATCH error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
