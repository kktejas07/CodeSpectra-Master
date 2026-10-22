/** GET /api/admin/pro-certs/reviews?view=pending|decided — proctored passes waiting for (or after) human review. Superadmin. */
import { requireSuperAdmin } from '@/lib/route-auth'
import { errorJson, json } from '@/lib/pro-certs/http'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const g = await requireSuperAdmin()
  if ('error' in g) return json({ error: g.error }, g.status)
  const view = new URL(req.url).searchParams.get('view') === 'decided' ? 'decided' : 'in_review'
  try {
    const { reviewQueue } = await import('@/lib/pro-certs/service')
    return json({ attempts: await reviewQueue(view) })
  } catch (e) {
    return errorJson(e, 'review queue')
  }
}
