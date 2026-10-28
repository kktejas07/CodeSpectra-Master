import { NextRequest } from 'next/server'
import { heuristicParse } from '@/lib/ats/parse'
import { sanitizeCriteria } from '@/lib/ats/pipeline'
import { scoreCandidate } from '@/lib/ats/screening-score'
import { bodyOf, errorResponse, gate, json } from '@/lib/ats/http'
import { limitRequest } from '@/lib/rate-limit'

/**
 * POST /api/ats/jobs/preview-score { criteria, resume_text, work_mode? } — try the
 * screening rules on a sample résumé. Heuristic parse + pure scoring, no AI.
 */
export async function POST(req: NextRequest) {
  const g = await gate(req, 'job.create')
  if ('res' in g) return g.res
  const limited = await limitRequest(req, 'ats-preview-score', g.actor.userId, 30, 60_000)
  if (limited) return limited
  try {
    const b = await bodyOf(req)
    const text = typeof b.resume_text === 'string' ? b.resume_text.slice(0, 60_000) : ''
    if (text.trim().length < 20) return json({ error: 'Paste a résumé to test against' }, 400)
    const criteria = { ...sanitizeCriteria(b.criteria), use_ai_match: false }
    const parsed = heuristicParse(text)
    const work_mode = (['onsite', 'hybrid', 'remote'] as const).find((m) => m === b.work_mode) ?? null
    const s = scoreCandidate(criteria, { text, parsed }, { work_mode })
    return json({ ...s, parsed })
  } catch (e) {
    return errorResponse(e, 'preview-score POST')
  }
}
