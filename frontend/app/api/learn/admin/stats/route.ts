/** GET /api/learn/admin/stats — views, shares by channel, top posts (superadmin). */
import { NextResponse } from 'next/server'
import { learnPosts } from '@/lib/learn/store'
import { learnAdmin, serverError } from '@/lib/learn/http'
import { SHARE_CHANNELS } from '@/lib/learn/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const g = await learnAdmin()
  if ('res' in g) return g.res
  try {
    const col = await learnPosts()
    const shareSums = Object.fromEntries(SHARE_CHANNELS.map((c) => [c, { $sum: { $ifNull: [`$stats.shares.${c}`, 0] } }]))
    const [totals] = await col.aggregate<Record<string, number>>([
      { $match: { status: 'published' } },
      { $group: { _id: null, posts: { $sum: 1 }, views: { $sum: { $ifNull: ['$stats.views', 0] } }, shares: { $sum: { $ifNull: ['$stats.share_total', 0] } }, ...shareSums } },
    ]).toArray()
    const top = await col.find({ status: 'published' }, { projection: { _id: 0, slug: 1, title: 1, 'stats.views': 1, 'stats.share_total': 1 } })
      .sort({ 'stats.views': -1 }).limit(10).toArray()
    return NextResponse.json({
      posts: totals?.posts ?? 0,
      views: totals?.views ?? 0,
      shares: totals?.shares ?? 0,
      byChannel: Object.fromEntries(SHARE_CHANNELS.map((c) => [c, totals?.[c] ?? 0])),
      top,
    })
  } catch (e) {
    return serverError('stats', e)
  }
}
