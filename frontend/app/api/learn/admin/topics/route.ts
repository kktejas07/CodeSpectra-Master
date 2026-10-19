/**
 * /api/learn/admin/topics (superadmin)
 *  GET   topics with their post status (query: category, q)
 *  POST  add { title, category, level, tags, series, series_order, refs, priority } — duplicates refused
 *  PATCH { id, ...fields } — enable/disable, priority, level, tags, series, refs, title
 */
import { NextRequest, NextResponse } from 'next/server'
import type { Filter } from 'mongodb'
import { addTopic, ensureTopicSeed, learnPosts, learnTopics, updateTopic } from '@/lib/learn/store'
import { fail, learnAdmin, readJson, serverError } from '@/lib/learn/http'
import { sanitizeRegex } from '@/lib/sanitize'
import { isLearnCategory, type LearnTopicDoc } from '@/lib/learn/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const g = await learnAdmin()
  if ('res' in g) return g.res
  try {
    await ensureTopicSeed()
    const sp = req.nextUrl.searchParams
    const filter: Filter<LearnTopicDoc> = {}
    const cat = sp.get('category')
    if (isLearnCategory(cat)) filter.category = cat
    const q = (sp.get('q') || '').trim().slice(0, 80)
    if (q) filter.title = new RegExp(sanitizeRegex(q), 'i')
    const [topics, posts] = await Promise.all([
      (await learnTopics()).find(filter, { projection: { _id: 0 } }).sort({ category: 1, series: 1, series_order: 1, title: 1 }).limit(1000).toArray(),
      (await learnPosts()).find({ topic_id: { $type: 'string' } }, { projection: { _id: 0, topic_id: 1, status: 1, slug: 1 } }).limit(5000).toArray(),
    ])
    const byTopic = new Map<string, { status: string; slug: string }>()
    for (const p of posts) if (p.topic_id && (!byTopic.has(p.topic_id) || p.status !== 'rejected')) byTopic.set(p.topic_id, { status: p.status, slug: p.slug })
    const series = [...new Set(topics.map((t) => t.series).filter(Boolean))].sort()
    return NextResponse.json({ topics: topics.map((t) => ({ ...t, post: byTopic.get(t.id) ?? null })), series })
  } catch (e) {
    return serverError('topics list', e)
  }
}

export async function POST(req: NextRequest) {
  const g = await learnAdmin()
  if ('res' in g) return g.res
  try {
    const r = await addTopic(await readJson(req))
    if (r.error) return fail(r.error, 409)
    return NextResponse.json({ topic: r.topic }, { status: 201 })
  } catch (e) {
    return serverError('topic add', e)
  }
}

export async function PATCH(req: NextRequest) {
  const g = await learnAdmin()
  if ('res' in g) return g.res
  try {
    const body = await readJson(req)
    if (typeof body.id !== 'string' || !body.id) return fail('Missing topic id.')
    const r = await updateTopic(body.id, body)
    if (r.error) return fail(r.error, r.error === 'Topic not found.' ? 404 : 409)
    return NextResponse.json({ topic: r.topic })
  } catch (e) {
    return serverError('topic edit', e)
  }
}
