import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { findBusyJob } from '@/lib/courses/process-job'

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

    return NextResponse.json({ jobs })
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

    // If force is true, clear the existing AI scripts and textContent so they regenerate
    if (force) {
      const course = await db.collection('courses').findOne({ id: courseId })
      if (course) {
        const sectionsUpdate = (course.sections || []).map((s: any) => ({
          ...s,
          lessons: (s.lessons || []).map((l: any) => ({
             ...l,
             script: [],
             textContent: null,
             audioUrl: null,
             videoType: null,
             duration: 600,
             type: 'text'
          }))
        }))
        await db.collection('courses').updateOne(
          { id: courseId }, 
          { $set: { sections: sectionsUpdate, updated_at: new Date().toISOString() } }
        )
        await db.collection('course_lesson_audio').deleteMany({ courseId })
      }
    }

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
