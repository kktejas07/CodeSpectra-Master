/** GET ?problem=<id|slug> — solution write-ups for a problem; bodies stay hidden until the viewer solved it. */
import type { NextRequest } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { errJson, errorResponse, json } from '@/lib/community/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const ref = new URL(req.url).searchParams.get('problem') || ''
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(ref)) return errJson(404, 'Problem not found', 'community_problem_missing')
  try {
    const user = await getAPIUser().catch(() => null)
    const { solutionsFor } = await import('@/lib/community/service')
    return json(await solutionsFor(user, ref))
  } catch (e) { return errorResponse(e, 'community solutions') }
}
