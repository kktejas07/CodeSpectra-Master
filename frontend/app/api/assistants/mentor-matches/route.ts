/**
 * GET /api/assistants/mentor-matches — up to 3 mentors for the signed-in learner,
 * scored from their own study plan (weak areas, target company), language and
 * time zone against the public mentor directory (lib/assistants/mentors). Read-only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { apiErrorFor } from '@/lib/api-errors'
import { limitRequest } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const user = await getAPIUser().catch(() => null)
  if (!user) return NextResponse.json(apiErrorFor('unauthorized'), { status: 401 })
  const limited = await limitRequest(req, 'mentor-matches', user.id, 30, 60_000)
  if (limited) return limited
  try {
    const { mentorMatchesFor } = await import('@/lib/assistants/mentors/service')
    return NextResponse.json(await mentorMatchesFor(user.id), { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) {
    console.error('[mentor-matches]:', (e as Error)?.message)
    return NextResponse.json(apiErrorFor('server_error'), { status: 500 })
  }
}
