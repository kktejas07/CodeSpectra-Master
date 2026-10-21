/** POST { type, currency, price } → what the learner pays and what the mentor earns (the marketplace's own math). */
import type { NextRequest } from 'next/server'
import { bodyOf, errorResponse, json, userGate } from '@/lib/mentors/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const g = await userGate(req, { write: true, bucket: 'mentor-quote', max: 60 })
  if ('res' in g) return g.res
  try {
    const { previewQuote } = await import('@/lib/mentors/service')
    return json({ quote: await previewQuote(g.user.id, await bodyOf(req)) })
  } catch (e) {
    return errorResponse(e, 'mentor quote')
  }
}
