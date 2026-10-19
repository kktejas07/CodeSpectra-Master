import { NextRequest } from 'next/server'
import { atsCandidates } from '@/lib/ats/db'
import { candidateIdsForJobs, errorResponse, gate, json, scopedJobIds } from '@/lib/ats/http'
import type { AtsCandidate } from '@/lib/ats/contract'

/** GET /api/ats/candidates?q=&tag=&limit= — this organisation's candidates. */
export async function GET(req: NextRequest) {
  const g = await gate(req, 'candidate.add')
  if ('res' in g) return g.res
  try {
    const sp = new URL(req.url).searchParams
    const q = (sp.get('q') || '').trim().slice(0, 80)
    const tag = (sp.get('tag') || '').trim().slice(0, 40)
    const limit = Math.max(1, Math.min(200, Number(sp.get('limit')) || 50))
    const filter: Record<string, unknown> = { tenant_id: g.actor.tenantId }
    if (q) {
      const re = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }
      filter.$or = [{ name: re }, { email: re }, { phone: re }, { 'parsed.skills': re }, { 'parsed.titles': re }]
    }
    if (tag) filter.tags = tag
    // Recruiters limited to their jobs only see candidates who applied to one of them.
    const jobIds = await scopedJobIds(g.actor)
    if (jobIds) filter.id = { $in: await candidateIdsForJobs(g.actor.tenantId, jobIds) }
    const rows = (await (await atsCandidates()).find(filter, { projection: { _id: 0, 'resume.text': 0 } }).sort({ updated_at: -1 }).limit(limit).toArray()) as AtsCandidate[]
    return json({ candidates: rows })
  } catch (e) {
    return errorResponse(e, 'candidates GET')
  }
}
