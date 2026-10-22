/** POST /api/jobs/for-you/apply  { job_id, draft_id, cover_letter? } — apply to an open job with one of your résumé versions. */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAPIUser } from '@/lib/route-auth'
import { limitRequest } from '@/lib/rate-limit'
import { apiErrorBody } from '@/lib/api-errors'
import { applyWithVersion, MatchError } from '@/lib/job-match/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const ID = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/)
const schema = z.object({ job_id: ID, draft_id: ID, cover_letter: z.string().trim().max(5000).optional() }).strict()

export async function POST(req: Request) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })
  const limited = await limitRequest(req, 'jobs-apply-version', user.id, 20, 60 * 60_000)
  if (limited) return limited
  const p = schema.safeParse(await req.json().catch(() => null))
  if (!p.success) return NextResponse.json({ error: 'Invalid request', code: 'invalid_request' }, { status: 400 })
  try {
    return NextResponse.json(await applyWithVersion(user, p.data.job_id, p.data.draft_id, p.data.cover_letter), { status: 201 })
  } catch (e) {
    if (e instanceof MatchError) return NextResponse.json(apiErrorBody(e.message, e.code), { status: e.status })
    console.error('[jobs/for-you/apply] failed:', (e as Error)?.message)
    return NextResponse.json({ error: 'Something went wrong. Try again in a moment.', code: 'server_error_moment' }, { status: 500 })
  }
}
