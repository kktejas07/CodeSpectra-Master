import { NextRequest } from 'next/server'
import { getMongoDb } from '@/lib/mongodb'
import { atsJobs } from '@/lib/ats/db'
import { errorResponse, gate, json, jobScopeFilter } from '@/lib/ats/http'

/** GET /api/ats/talent/targets — what an invite can point at: published tests and open jobs of this organisation. */
export async function GET(req: NextRequest) {
  const g = await gate(req, 'candidate.add', ['admin', 'recruiter'])
  if ('res' in g) return g.res
  try {
    const db = await getMongoDb()
    const scope = await jobScopeFilter(g.actor)
    const [tests, jobs] = await Promise.all([
      db.collection('exams').find({ tenant_id: g.actor.tenantId, status: 'available' }, { projection: { _id: 0, id: 1, title: 1 } }).sort({ created_at: -1 }).limit(100).toArray(),
      scope ? (await atsJobs()).find({ ...scope, status: 'open' }, { projection: { _id: 0, id: 1, title: 1 } }).sort({ updated_at: -1 }).limit(100).toArray() : Promise.resolve([]),
    ])
    return json({
      tests: tests.map((t) => ({ id: String(t.id), title: String(t.title || 'Assessment') })),
      jobs: jobs.map((j) => ({ id: String(j.id), title: String(j.title || 'Job') })),
    })
  } catch (e) {
    return errorResponse(e, 'talent targets')
  }
}
