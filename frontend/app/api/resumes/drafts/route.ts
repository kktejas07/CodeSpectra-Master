/**
 * /api/resumes/drafts — résumé builder drafts saved to the account.
 *   GET            -> { draft } the latest draft (or `?id=` a specific one), null if none
 *   GET ?list=1    -> { drafts: [{ id, name, template, target_role, created_at, updated_at }] } newest first
 *   POST           -> { id?, name, template, data } create, or update your own draft by id
 *   DELETE ?id=    -> remove one of your drafts
 * Owner-scoped; body is whitelisted by sanitizeBuilderData.
 */
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { newId, nowIso } from '@/lib/db/ids'
import { rateLimitSlidingWindow } from '@/lib/in-memory-rate-limit'
import { resumeDrafts, sanitizeBuilderData, sanitizeTemplate, type ResumeDraftDoc } from '../_lib/builder-data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_DRAFTS = 20
const MAX_BODY_BYTES = 100_000
const ID_RE = /^[A-Za-z0-9-]{8,64}$/

const shape = (d: ResumeDraftDoc) => ({
  id: d.id, name: d.name, template: d.template, data: d.data, created_at: d.created_at, updated_at: d.updated_at,
})

export async function GET(request: Request) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  try {
    const col = await resumeDrafts()
    const sp = new URL(request.url).searchParams
    if (sp.get('list') === '1') {
      const rows = await col
        .find({ user_id: gate.user.id }, { projection: { _id: 0, id: 1, name: 1, template: 1, created_at: 1, updated_at: 1, 'data.targetRole': 1 } })
        .sort({ updated_at: -1 })
        .limit(MAX_DRAFTS)
        .toArray()
      // Versions per target role: the role travels with each draft.
      return NextResponse.json({ drafts: rows.map(({ data, ...r }) => ({ ...r, target_role: data?.targetRole || '' })) })
    }
    const wanted = sp.get('id')
    const filter = wanted && ID_RE.test(wanted) ? { id: wanted, user_id: gate.user.id } : { user_id: gate.user.id }
    const [draft] = await col.find(filter, { projection: { _id: 0 } }).sort({ updated_at: -1 }).limit(1).toArray()
    return NextResponse.json({ draft: draft ? shape(draft) : null })
  } catch (e) {
    console.error('[resume drafts] GET', e)
    return NextResponse.json({ error: 'Could not load your draft' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const rl = rateLimitSlidingWindow(`resume-draft:${gate.user.id}`, 30, 60_000)
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Saving too often. Try again in a moment.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  try {
    const text = await request.text()
    if (text.length > MAX_BODY_BYTES) return NextResponse.json({ error: 'This draft is too large to save' }, { status: 413 })
    let body: Record<string, unknown>
    try {
      body = JSON.parse(text) as Record<string, unknown>
    } catch {
      return NextResponse.json({ error: 'Invalid draft' }, { status: 400 })
    }
    const data = sanitizeBuilderData(body.data)
    if (!data) return NextResponse.json({ error: 'Invalid draft' }, { status: 400 })
    const name = (typeof body.name === 'string' ? body.name.trim().slice(0, 120) : '') || 'Untitled resume'
    const template = sanitizeTemplate(body.template)
    const now = nowIso()
    const col = await resumeDrafts()

    const existingId = typeof body.id === 'string' && ID_RE.test(body.id) ? body.id : null
    if (existingId) {
      const res = await col.findOneAndUpdate(
        { id: existingId, user_id: gate.user.id },
        { $set: { name, template, data, updated_at: now } },
        { returnDocument: 'after', projection: { _id: 0 } },
      )
      if (res) return NextResponse.json({ draft: shape(res) })
      // Draft was deleted (or isn't yours): fall through and save a new one.
    }

    const count = await col.countDocuments({ user_id: gate.user.id })
    if (count >= MAX_DRAFTS) {
      return NextResponse.json({ error: `You can keep up to ${MAX_DRAFTS} drafts. Delete one to save another.` }, { status: 409 })
    }
    const doc: ResumeDraftDoc = { id: newId(), user_id: gate.user.id, name, template, data, created_at: now, updated_at: now }
    await col.insertOne({ ...doc })
    return NextResponse.json({ draft: shape(doc) }, { status: 201 })
  } catch (e) {
    console.error('[resume drafts] POST', e)
    return NextResponse.json({ error: 'Could not save your draft' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const id = new URL(request.url).searchParams.get('id')
  if (!id || !ID_RE.test(id)) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  try {
    const col = await resumeDrafts()
    const res = await col.deleteOne({ id, user_id: gate.user.id })
    if (res.deletedCount === 0) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[resume drafts] DELETE', e)
    return NextResponse.json({ error: 'Could not delete the draft' }, { status: 500 })
  }
}
