import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { jobApplications, jobs } from '@/lib/db/content'

export async function GET() {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  try {
    const appsCol = await jobApplications()
    const apps = await appsCol
      .find({ user_id: gate.user.id })
      .sort({ applied_at: -1 })
      .toArray()
    if (apps.length === 0) return NextResponse.json([])

    const jobIds = apps.map((a) => a.job_id)
    const jobsCol = await jobs()
    const jobsList = await jobsCol.find({ id: { $in: jobIds } }).toArray()
    const byId = new Map(jobsList.map((j) => [j.id, j]))

    return NextResponse.json(
      apps.map((a) => {
        const j = byId.get(a.job_id)
        return {
          id: a.id,
          jobId: a.job_id,
          jobTitle: j?.title ?? 'Unknown role',
          company: j?.company ?? '',
          appliedAt: a.applied_at,
          status: a.status,
          resumeName: a.resume_id ?? null,
        }
      }),
    )
  } catch (error) {
    console.error('[CodeSpectra] jobs/applications GET:', error)
    return NextResponse.json([])
  }
}
