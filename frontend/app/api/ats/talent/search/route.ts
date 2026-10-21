import { NextRequest } from 'next/server'
import { errorResponse, gate, json } from '@/lib/ats/http'
import { talentSearchSchema } from '@/lib/talent/core'
import { quotaState, searchTalent, TalentError } from '@/lib/talent/db'

/**
 * POST /api/ats/talent/search — opted-in learners by verified skill + level,
 * location, graduation year and availability. Passport summaries only (no
 * contact details). Rate limited per user; every search is audited.
 */
export async function POST(req: NextRequest) {
  const g = await gate(req, 'application.view', ['admin', 'recruiter', 'hiring_manager'])
  if ('res' in g) return g.res
  const parsed = talentSearchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    const i = parsed.error.issues[0]
    return json({ error: i ? `${i.path.join('.') || 'search'}: ${i.message}` : 'Invalid search' }, 400)
  }
  try {
    const [res, quota] = await Promise.all([searchTalent(g.actor, parsed.data, req), quotaState(g.actor.tenantId)])
    return json({ ...res, quota })
  } catch (e) {
    if (e instanceof TalentError) return json({ error: e.message }, e.status)
    return errorResponse(e, 'talent search')
  }
}
