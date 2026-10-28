/**
 * POST /api/learn/admin/generate (superadmin) — "Generate now".
 * Body: { count?: 1–3 } picks the next topics like the daily run; or { topic_id } for one topic.
 * Posts land as drafts (unless auto-approve is on). Also GET → the next topics the planner would pick.
 */
import { NextRequest, NextResponse } from 'next/server'
import { limitRequest } from '@/lib/rate-limit'
import { generateNow, planNext } from '@/lib/learn/generate'
import { ensureTopicSeed } from '@/lib/learn/store'
import { learnAdmin, readJson, serverError } from '@/lib/learn/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET() {
  const g = await learnAdmin()
  if ('res' in g) return g.res
  try {
    await ensureTopicSeed()
    const next = await planNext(5)
    return NextResponse.json({ next: next.map((t) => ({ id: t.id, title: t.title, category: t.category, level: t.level })) })
  } catch (e) {
    return serverError('plan', e)
  }
}

export async function POST(req: NextRequest) {
  const g = await learnAdmin()
  if ('res' in g) return g.res
  const limited = await limitRequest(req, 'learn-generate', g.user.id, 5, 10 * 60_000)
  if (limited) return limited
  try {
    const body = await readJson(req)
    const results = await generateNow({
      count: Number(body.count) || 1,
      topicId: typeof body.topic_id === 'string' && body.topic_id ? body.topic_id.slice(0, 100) : null,
      actorId: g.user.id,
    })
    return NextResponse.json({ results })
  } catch (e) {
    return serverError('generate', e)
  }
}
