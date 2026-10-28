/**
 * /api/admin/question-bot/drafts (superadmin) — the bank's draft queue for
 * Admin → SME review → Question drafts.
 * GET  ?domain=&type=&difficulty=&source=bot|all&page= — drafts with quality score + reasons, counts per domain.
 * POST { action: 'approve' | 'reject', ids: string[] } — approve (usable in tests) or reject (hidden, kept for dedupe).
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getMongoDb } from '@/lib/mongodb'
import { audit, botAdmin, readBody, serverError } from '@/lib/question-bot/http'
import { knowledgeOnLibraryChange } from '@/lib/rag/hooks'
import { listDomains } from '@/lib/question-bot/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PAGE = 20
const slug = (v: string | null, max = 40) => (v && new RegExp(`^[a-z0-9_]{1,${max}}$`).test(v) ? v : '')

export async function GET(req: NextRequest) {
  const g = await botAdmin()
  if ('res' in g) return g.res
  try {
    const sp = new URL(req.url).searchParams
    const domain = slug(sp.get('domain')?.trim().toLowerCase() ?? null)
    const type = slug(sp.get('type')?.trim().toLowerCase() ?? null)
    const difficulty = ['Easy', 'Medium', 'Hard'].includes(sp.get('difficulty') || '') ? sp.get('difficulty')! : ''
    const botOnly = sp.get('source') !== 'all'
    const page = Math.max(1, Math.min(500, parseInt(sp.get('page') || '1', 10) || 1))

    const base: Record<string, unknown> = { review_status: 'draft', is_active: { $ne: false } }
    if (botOnly) base.domain = { $exists: true }
    const filter: Record<string, unknown> = { ...base }
    if (domain) filter.domain = domain
    if (type) filter.type = type
    if (difficulty) filter.difficulty = difficulty

    const col = (await getMongoDb()).collection('question_bank')
    const [total, items, byDomain, domains] = await Promise.all([
      col.countDocuments(filter),
      col.find(filter, {
        projection: { _id: 0, id: 1, title: 1, question: 1, type: 1, options: 1, answer: 1, explanation: 1, difficulty: 1, domain: 1, branch: 1, subject: 1, test_cases: 1, language: 1, reference_solution: 1, quality_score: 1, quality_reasons: 1, createdAt: 1 },
      }).sort({ createdAt: -1 }).skip((page - 1) * PAGE).limit(PAGE).toArray(),
      col.aggregate<{ _id: string | null; n: number }>([{ $match: base }, { $group: { _id: '$domain', n: { $sum: 1 } } }]).toArray(),
      listDomains(),
    ])
    return NextResponse.json({
      items,
      total,
      page,
      pageSize: PAGE,
      byDomain: Object.fromEntries(byDomain.map((r) => [r._id || 'none', r.n])),
      labels: Object.fromEntries(domains.map((d) => [d.id, d.label])),
    })
  } catch (e) {
    return serverError('drafts', e)
  }
}

const Action = z.object({
  action: z.enum(['approve', 'reject']),
  ids: z.array(z.string().regex(/^[A-Za-z0-9_-]{1,64}$/)).min(1).max(100),
}).strict()

export async function POST(req: NextRequest) {
  const g = await botAdmin()
  if ('res' in g) return g.res
  const v = Action.safeParse(await readBody(req))
  if (!v.success) return NextResponse.json({ error: 'action and ids (1–100) are required' }, { status: 400 })
  try {
    const col = (await getMongoDb()).collection('question_bank')
    const now = new Date().toISOString()
    const ids = [...new Set(v.data.ids)]
    const set = v.data.action === 'approve'
      ? { review_status: 'approved', reviewed_by: g.user.id, reviewed_at: now, updatedAt: now }
      // Rejected drafts stay (inactive) so the bot's dedupe never writes them again.
      : { is_active: false, rejected: true, reviewed_by: g.user.id, reviewed_at: now, updatedAt: now }
    const r = await col.updateMany({ id: { $in: ids }, review_status: 'draft' }, { $set: set })
    knowledgeOnLibraryChange('question', ids)
    await audit(g.user.id, `question_bot.draft_${v.data.action}`, ids.slice(0, 5).join(','), `${v.data.action === 'approve' ? 'Approved' : 'Rejected'} ${r.modifiedCount} draft(s)`)
    return NextResponse.json({ ok: true, updated: r.modifiedCount })
  } catch (e) {
    return serverError('draft action', e)
  }
}
