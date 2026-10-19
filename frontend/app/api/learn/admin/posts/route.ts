/**
 * GET /api/learn/admin/posts — review queue (superadmin).
 * Query: status (draft|approved|scheduled|published|rejected|archived|all), q, page.
 * Returns cards plus per-status counts.
 */
import { NextRequest, NextResponse } from 'next/server'
import type { Filter } from 'mongodb'
import { learnPosts } from '@/lib/learn/store'
import { learnAdmin, serverError } from '@/lib/learn/http'
import { sanitizeRegex } from '@/lib/sanitize'
import { LEARN_STATUSES, type LearnPostDoc, type LearnStatus } from '@/lib/learn/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const g = await learnAdmin()
  if ('res' in g) return g.res
  try {
    const sp = req.nextUrl.searchParams
    const status = sp.get('status') || 'draft'
    const filter: Filter<LearnPostDoc> = {}
    if ((LEARN_STATUSES as readonly string[]).includes(status)) filter.status = status as LearnStatus
    const q = (sp.get('q') || '').trim().slice(0, 80)
    if (q) filter.title = new RegExp(sanitizeRegex(q), 'i')
    const page = Math.max(1, Math.min(200, Number(sp.get('page')) || 1))
    const limit = 25
    const col = await learnPosts()
    const [items, total, counts] = await Promise.all([
      col.find(filter, { projection: { _id: 0, body: 0 } }).sort({ updated_at: -1 }).skip((page - 1) * limit).limit(limit).toArray(),
      col.countDocuments(filter),
      col.aggregate<{ _id: string; n: number }>([{ $group: { _id: '$status', n: { $sum: 1 } } }]).toArray(),
    ])
    return NextResponse.json({
      items, total, page, pages: Math.max(1, Math.ceil(total / limit)),
      counts: Object.fromEntries(counts.map((c) => [c._id, c.n])),
    })
  } catch (e) {
    return serverError('admin list', e)
  }
}
