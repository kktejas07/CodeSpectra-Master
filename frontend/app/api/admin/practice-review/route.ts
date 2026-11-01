/**
 * Practice review: approve or reject generated challenges before learners see
 * them.
 *
 * Challenges are prose, so they cannot be execution-verified like arena/problem
 * content — the agreed rule is that they stay drafts until a human approves
 * them. This is that surface (there was none: `question-bank` reviews
 * `question_bank`, `sme-review` reviews `sme-reviews`).
 *
 * GET   → drafts + counts
 * PATCH → { id, action: 'approve' | 'reject' }
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { normalizeChallengeRow } from '@/lib/challenges/normalize'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VISIBLE_FILTER = { review_status: { $nin: ['draft', 'rejected'] } }

export async function GET() {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const db = await getMongoDb()
  const col = db.collection('challenges')
  const [drafts, draft, approved, rejected] = await Promise.all([
    col.find({ review_status: 'draft' }).sort({ created_at: -1 }).limit(200).toArray(),
    col.countDocuments({ review_status: 'draft' }),
    col.countDocuments(VISIBLE_FILTER),
    col.countDocuments({ review_status: 'rejected' }),
  ])

  return NextResponse.json({
    data: drafts.map(d => ({
      ...normalizeChallengeRow(d as Record<string, unknown>),
      review_status: String(d.review_status ?? ''),
      source: String(d.source ?? ''),
    })),
    counts: { draft, approved, rejected },
  })
}

export async function PATCH(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  let body: { id?: string; ids?: string[]; all?: boolean; action?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON', code: 'invalid_json' }, { status: 400 })
  }

  const id = String(body.id ?? '').trim()
  const action = String(body.action ?? '')
  const ids = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean) : []
  const all = body.all === true
  if ((!id && ids.length === 0 && !all) || !['approve', 'reject'].includes(action)) {
    // Message must match the catalog text for `invalid_request` (tests/i18n-api-errors).
    return NextResponse.json({ error: 'Invalid request', code: 'invalid_request' }, { status: 400 })
  }

  const db = await getMongoDb()
  const set = {
    review_status: action === 'approve' ? 'approved' : 'rejected',
    reviewed_by: gate.user.id,
    reviewed_at: new Date().toISOString(),
  }

  // Bulk: `all` clears every draft (one click for a 40-item queue),
  // `ids` handles a selection. Single `id` stays supported.
  const filter = all
    ? { review_status: 'draft' }
    : ids.length > 0
      ? { $or: [{ id: { $in: ids } }, { slug: { $in: ids } }] }
      : { $or: [{ id }, { slug: id }] }

  const res = await db.collection('challenges').updateMany(filter, { $set: set })
  if (!res.matchedCount) {
    return NextResponse.json({ error: 'Not found', code: 'not_found' }, { status: 404 })
  }
  return NextResponse.json({
    ok: true,
    action,
    updated: res.modifiedCount,
    ...(all ? {} : ids.length ? { ids } : { id }),
  })
}
