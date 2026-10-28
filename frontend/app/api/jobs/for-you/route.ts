/**
 * GET /api/jobs/for-you?min=   open public jobs ranked for you, each with an explainable match score
 * PUT /api/jobs/for-you        { city?, country?, open_to_relocate?, experience_years?, expected_salary_minor?, currency? }
 * Your preferences are private: recruiters never see them.
 */
import { NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'
import { apiErrorBody } from '@/lib/api-errors'
import { jobsForYou, MatchError, savePrefs } from '@/lib/job-match/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const NO_STORE = { 'Cache-Control': 'private, no-store' }

function fail(e: unknown, what: string) {
  if (e instanceof MatchError) return NextResponse.json(apiErrorBody(e.message, e.code), { status: e.status })
  console.error(`[jobs/for-you] ${what}:`, (e as Error)?.message)
  return NextResponse.json({ error: 'Something went wrong. Try again in a moment.', code: 'server_error_moment' }, { status: 500 })
}

export async function GET(req: Request) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })
  const rl = await rateLimitRedis(`jobs-for-you:${user.id}`, 30, 60_000)
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests. Please wait a moment and try again.', code: 'rate_limited', params: { seconds: rl.retryAfterSec } }, { status: 429 })
  try {
    const min = Math.max(0, Math.min(100, Number(new URL(req.url).searchParams.get('min')) || 0))
    return NextResponse.json(await jobsForYou(user.id, { min }), { headers: NO_STORE })
  } catch (e) {
    return fail(e, 'GET')
  }
}

export async function PUT(req: Request) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })
  const rl = await rateLimitRedis(`jobs-prefs:${user.id}`, 20, 60_000)
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests. Please wait a moment and try again.', code: 'rate_limited', params: { seconds: rl.retryAfterSec } }, { status: 429 })
  try {
    return NextResponse.json({ prefs: await savePrefs(user.id, await req.json().catch(() => null)) }, { headers: NO_STORE })
  } catch (e) {
    return fail(e, 'PUT')
  }
}
