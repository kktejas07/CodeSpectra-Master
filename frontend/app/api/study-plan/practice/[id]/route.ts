/** GET → the practice set's questions (no answers). POST { answers: { [questionId]: string | string[] } } → graded results. */
import type { NextRequest } from 'next/server'
import type { IdRouteContext } from '@/lib/app-route-context'
import { bodyOf, errorResponse, gate, json } from '@/lib/study-plan/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ID = /^[a-z0-9]{1,16}$/

export async function GET(req: NextRequest, { params }: IdRouteContext) {
  const g = await gate(req)
  if ('res' in g) return g.res
  const { id } = await params
  if (!ID.test(id)) return json({ error: 'Practice set not found' }, 404)
  try {
    const { getPracticeSet } = await import('@/lib/study-plan/service')
    return json(await getPracticeSet(g.user.id, id))
  } catch (e) {
    return errorResponse(e, 'practice read')
  }
}

export async function POST(req: NextRequest, { params }: IdRouteContext) {
  const g = await gate(req, { write: true, bucket: 'study-practice', max: 30 })
  if ('res' in g) return g.res
  const { id } = await params
  if (!ID.test(id)) return json({ error: 'Practice set not found' }, 404)
  try {
    const b = await bodyOf(req)
    const { submitPractice } = await import('@/lib/study-plan/service')
    return json(await submitPractice(g.user.id, id, b.answers))
  } catch (e) {
    return errorResponse(e, 'practice submit')
  }
}
