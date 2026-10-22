/** GET ?category=&sort=&page= — visible threads (public categories). POST — start a thread (signed in, moderated, rate limited). */
import type { NextRequest } from 'next/server'
import { bodyOf, errJson, errorResponse, json, userGate } from '@/lib/community/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams
  const sort = (['hot', 'new', 'top', 'unanswered'] as const).find((s) => s === q.get('sort')) ?? 'new'
  try {
    const { getCategory, listThreads } = await import('@/lib/community/service')
    const slug = q.get('category')
    let categoryId: string | null = null
    if (slug) {
      const c = await getCategory(slug)
      if (!c || c.members_only) return errJson(404, 'Category not found', 'community_category_missing')
      categoryId = c.id
    }
    return json(await listThreads({ categoryId, sort, page: Number(q.get('page')) || 1 }))
  } catch (e) { return errorResponse(e, 'community threads') }
}

export async function POST(req: NextRequest) {
  const g = await userGate(req, { write: true, bucket: 'community-thread', max: 6 })
  if ('res' in g) return g.res
  try {
    const { createThread } = await import('@/lib/community/service')
    return json(await createThread(g.user, await bodyOf(req)), 201)
  } catch (e) { return errorResponse(e, 'community thread create') }
}
