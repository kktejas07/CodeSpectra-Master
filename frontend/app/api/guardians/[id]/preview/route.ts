/** GET → this week's summary exactly as the guardian would get it (the learner's preview). */
import type { NextRequest } from 'next/server'
import type { IdRouteContext } from '@/lib/app-route-context'
import { requireAuth } from '@/lib/route-auth'
import { limitRequest } from '@/lib/rate-limit'
import { apiErrorBody } from '@/lib/api-errors'
import { guardianFail, json } from '@/lib/guardian/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: IdRouteContext) {
  const a = await requireAuth()
  if ('error' in a) return json({ error: a.error, code: 'unauthorized' }, a.status)
  const limited = await limitRequest(req, 'guardian-preview', a.user.id, 30, 60 * 60_000)
  if (limited) return limited
  const { id } = await params
  if (!/^[A-Za-z0-9_-]{6,40}$/.test(id)) return json(apiErrorBody('Not found', 'not_found'), 404)
  try {
    const { previewForLearner } = await import('@/lib/guardian/service')
    return json(await previewForLearner(a.user.id, id))
  } catch (e) {
    return guardianFail(e, 'preview')
  }
}
