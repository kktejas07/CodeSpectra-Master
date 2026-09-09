/**
 * Invite recovery — finds and resets invites stuck in `used` with no
 * matching submission (the invite-lockout chain: invite consumed before
 * the save, then a later failure left the candidate permanently blocked).
 *
 * GET  /api/admin/exams/[id]/invites/recover — list stuck invites
 * POST /api/admin/exams/[id]/invites/recover — reset to pending
 *        body: { tokens?: string[] } | { all?: true }
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, requireTenantEntity } from '@/lib/api-auth'
import { getMongoDb } from '@/lib/mongodb'
import { nowIso } from '@/lib/db/ai'
import type { IdRouteContext } from '@/lib/app-route-context'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function stuckInvites(db: Awaited<ReturnType<typeof getMongoDb>>, examId: string) {
  const escaped = examId.replace(/-/g, '\\-')
  const invites = await db.collection('candidate_invites').find({
    $or: [
      { exam_id: examId },
      { target_url: { $regex: escaped } },
      { 'assigned_assessments.target_url': { $regex: escaped } },
    ],
    status: 'used',
  }).toArray()

  if (invites.length === 0) return []

  const submissions = await db.collection('exam_submissions').find({
    exam_id: examId,
  }, { projection: { user_id: 1, email: 1 } }).toArray()
  const submittedUserIds = new Set(submissions.map((s) => String(s.user_id || '')))
  const submittedEmails = new Set(submissions.map((s) => String(s.email || '').toLowerCase()))

  const stuck = invites.filter((inv) => {
    if (submittedUserIds.has(String(inv.user_id || '')) && inv.user_id) return false
    if (inv.email && submittedEmails.has(String(inv.email).toLowerCase())) return false
    return true
  })

  // Best-effort: flag whether the candidate has an auto-saved draft
  // (answers recoverable from exam_drafts or their browser localStorage).
  const drafts = await db.collection('exam_drafts').find({
    exam_id: examId,
  }, { projection: { user_id: 1, updated_at: 1 } }).toArray()
  const draftUserIds = new Set(drafts.map((d) => String(d.user_id || '')))

  const out: Array<Record<string, unknown>> = []
  for (const inv of stuck) {
    let hasDraft: boolean | null = null
    if (inv.user_id) {
      hasDraft = draftUserIds.has(String(inv.user_id))
    } else if (inv.email) {
      const u = await db.collection('user').findOne(
        { email: String(inv.email).toLowerCase() },
        { projection: { _id: 1, id: 1 } },
      )
      const uid = u ? String((u as { id?: string }).id || (u as unknown as { _id: string })._id || '') : ''
      hasDraft = uid ? draftUserIds.has(uid) : false
    }
    out.push({
      token: inv.token,
      email: inv.email || '',
      full_name: inv.full_name || '',
      status: inv.status,
      created_at: inv.created_at || null,
      updated_at: inv.updated_at || null,
      has_draft: hasDraft,
    })
  }
  return out
}

export async function GET(_request: Request, { params }: IdRouteContext) {
  const gate = await requireAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  const { id } = await params
  try {
    const db = await getMongoDb()
    const owned = await requireTenantEntity(db, 'exams', id, gate.user)
    if ('error' in owned) {
      return NextResponse.json({ error: owned.error }, { status: owned.status })
    }
    const data = await stuckInvites(db, id)
    return NextResponse.json({ data, count: data.length })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to load stuck invites'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: IdRouteContext) {
  const gate = await requireAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  const { id } = await params
  try {
    const db = await getMongoDb()
    const owned = await requireTenantEntity(db, 'exams', id, gate.user)
    if ('error' in owned) {
      return NextResponse.json({ error: owned.error }, { status: owned.status })
    }

    // Recompute stuck set server-side — never trust client-supplied tokens
    // beyond intersecting with the verified stuck list.
    const stuck = await stuckInvites(db, id)
    const stuckTokens = new Set(stuck.map((s) => String(s.token)))
    if (stuckTokens.size === 0) {
      return NextResponse.json({ ok: true, reset: 0 })
    }

    const body = (await req.json().catch(() => ({}))) as { tokens?: string[]; all?: boolean }
    let tokens: string[]
    if (body.all) {
      tokens = [...stuckTokens]
    } else if (Array.isArray(body.tokens) && body.tokens.length > 0) {
      tokens = body.tokens.filter((t) => stuckTokens.has(String(t)))
    } else {
      return NextResponse.json({ error: 'Provide tokens[] or all:true' }, { status: 400 })
    }
    if (tokens.length === 0) {
      return NextResponse.json({ ok: true, reset: 0 })
    }

    const res = await db.collection('candidate_invites').updateMany(
      { token: { $in: tokens } },
      { $set: { status: 'pending', updatedAt: nowIso() } },
    )
    return NextResponse.json({ ok: true, reset: res.modifiedCount ?? tokens.length })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to reset invites'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
