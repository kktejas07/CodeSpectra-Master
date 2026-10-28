import { NextRequest } from 'next/server'
import { getMongoDb } from '@/lib/mongodb'
import { errorResponse, gate, json } from '@/lib/ats/http'

/** GET /api/ats/exams — this organisation's tests, for the pipeline builder's assessment picker. */
export async function GET(req: NextRequest) {
  const g = await gate(req, 'job.create', ['admin', 'recruiter'])
  if ('res' in g) return g.res
  try {
    const rows = await (await getMongoDb()).collection('exams')
      .find({ tenant_id: g.actor.tenantId, status: { $ne: 'archived' } }, { projection: { _id: 0, id: 1, title: 1, status: 1, duration: 1, passing_score: 1, ends_at: 1, created_at: 1 } })
      .sort({ created_at: -1 })
      .limit(500)
      .toArray()
    return json({ exams: rows })
  } catch (e) {
    return errorResponse(e, 'exams GET')
  }
}
