/**
 * POST /api/ats/analytics/ratings { application_id, period: 30 | 90, value: 1–5 }
 * On-the-job rating a recruiter enters after hire; feeds the "assessment vs
 * on-the-job" correlation. Hired applications in the actor's job scope only.
 */
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { bodyOf, gate, json } from '@/lib/ats/http'

export const dynamic = 'force-dynamic'

const Body = z.object({
  application_id: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  period: z.union([z.literal(30), z.literal(90)]),
  value: z.number().int().min(1).max(5),
}).strict()

export async function POST(req: NextRequest) {
  const g = await gate(req, 'analytics.view')
  if ('res' in g) return g.res
  const b = Body.safeParse(await bodyOf(req))
  if (!b.success) return json({ error: 'Choose a rating from 1 to 5 for 30 or 90 days.', code: 'ats_rating_invalid' }, 400)
  try {
    const { saveRating, InsightError } = await import('@/lib/ats/hiring-insights-server')
    try {
      const r = await saveRating(g.actor, b.data)
      return json({ ok: true, rating: { application_id: r.application_id, period: r.period, value: r.value } })
    } catch (e) {
      if (e instanceof InsightError) return json({ error: e.message, code: e.code }, e.status)
      throw e
    }
  } catch (e) {
    console.error('[ats insights] rating:', (e as Error)?.message)
    return json({ error: 'Something went wrong. Try again.' }, 500)
  }
}
