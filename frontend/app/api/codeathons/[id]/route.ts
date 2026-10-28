import { NextResponse } from 'next/server'
import { requireAuth, isAdminCaller } from '@/lib/route-auth'
import { knowledgeOnEventChange } from '@/lib/rag/hooks'
import { codeathons, codeathonRegistrations, nowIso } from '@/lib/db/content'
import { codeathonProblemsVisible } from '@/lib/codeathon-run'
import type { IdRouteContext } from '@/lib/app-route-context'
import { isTenantStaff, pickFields, publicCodeathonView, CODEATHON_EDITABLE_FIELDS } from '@/lib/exam-access'
import { CODEATHON_STATUSES, CODEATHON_VISIBILITIES, codeathonVisibleTo } from '@/lib/hackathons/tenant-scope'

const RELEASE_LOCKED_FIELDS = ['problems', 'startDate', 'endDate', 'event_type', 'status'] as const

export async function GET(_request: Request, { params }: IdRouteContext) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  const { id } = await params
  try {
    const col = await codeathons()
    const doc = await col.findOne({ id })
    if (!doc) return NextResponse.json({ error: 'Codeathon not found' }, { status: 404 })
    // Participants never get hidden test cases (they are the grading key).
    if (isTenantStaff(gate.user, doc as unknown as Record<string, unknown>)) return NextResponse.json(doc)
    // Drafts and other organisations' internal codeathons don't exist for participants (CORE-014).
    if (!codeathonVisibleTo(gate.user, doc as unknown as Record<string, unknown>)) return NextResponse.json({ error: 'Codeathon not found' }, { status: 404 })
    const registered = !!(await (await codeathonRegistrations()).findOne({ codeathon_id: id, user_id: gate.user.id }, { projection: { _id: 1 } }))
    const view = publicCodeathonView(doc as unknown as Record<string, unknown>)
    // Same visibility rule as /problems: statements stay hidden until the contest starts.
    if (!codeathonProblemsVisible(doc as unknown as Record<string, unknown>)) {
      return NextResponse.json({ ...view, problems: [], problems_hidden: true, registered })
    }
    return NextResponse.json({ ...view, registered })
  } catch (error) {
    console.error('[CodeSpectra] codeathons GET[id]:', error)
    return NextResponse.json({ error: 'Failed to load codeathon' }, { status: 500 })
  }
}

export async function PUT(request: Request, { params }: IdRouteContext) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  if (!isAdminCaller(gate.user)) {
    return NextResponse.json({ error: 'Forbidden', code: 'forbidden' }, { status: 403 })
  }
  const { id } = await params
  try {
    // Allow-list: never id/_id/tenant_id/created_by/participants from the body.
    const data = pickFields(await request.json().catch(() => ({})), CODEATHON_EDITABLE_FIELDS)
    if ('visibility' in data && !(CODEATHON_VISIBILITIES as readonly unknown[]).includes(data.visibility)) delete data.visibility
    if ('status' in data && !(CODEATHON_STATUSES as readonly unknown[]).includes(data.status)) delete data.status
    const col = await codeathons()
    // tenant_admin can only edit codeathons in their own tenant
    const existing = await col.findOne({ id })
    if (!existing) return NextResponse.json({ error: 'Codeathon not found' }, { status: 404 })
    if (!isTenantStaff(gate.user, existing as unknown as Record<string, unknown>)) {
      return NextResponse.json({ error: 'Forbidden', code: 'forbidden' }, { status: 403 })
    }
    // Released results are final: the format, dates and problems can't change underneath them.
    if ((existing as unknown as Record<string, unknown>).results_released === true) {
      const norm = (k: string, v: unknown) => (v === undefined || v === null || v === '' ? (k === 'event_type' ? 'individual' : null) : v)
      const cur = existing as unknown as Record<string, unknown>
      const locked = RELEASE_LOCKED_FIELDS.filter((k) =>
        k in data && JSON.stringify(norm(k, data[k])) !== JSON.stringify(norm(k, cur[k])))
      if (locked.length > 0) {
        return NextResponse.json({ error: 'Results are released, so dates, format, status and problems are locked' }, { status: 409 })
      }
    }
    await col.updateOne({ id }, { $set: { ...data, updated_at: nowIso() } })
    knowledgeOnEventChange('codeathon', id)
    const updated = await col.findOne({ id })
    return NextResponse.json(updated)
  } catch (error) {
    console.error('[CodeSpectra] codeathons PUT[id]:', error)
    return NextResponse.json({ error: 'Failed to update codeathon' }, { status: 400 })
  }
}

export async function DELETE(_request: Request, { params }: IdRouteContext) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  if (!isAdminCaller(gate.user)) {
    return NextResponse.json({ error: 'Forbidden', code: 'forbidden' }, { status: 403 })
  }
  const { id } = await params
  try {
    const col = await codeathons()
    // Deny by default: a tenant_admin without a tenant owns nothing.
    const existing = await col.findOne({ id })
    if (!existing) return NextResponse.json({ error: 'Codeathon not found' }, { status: 404 })
    if (!isTenantStaff(gate.user, existing as unknown as Record<string, unknown>)) {
      return NextResponse.json({ error: 'Forbidden', code: 'forbidden' }, { status: 403 })
    }
    const res = await col.deleteOne({ id })
    knowledgeOnEventChange('codeathon', id)
    if (res.deletedCount === 0) {
      return NextResponse.json({ error: 'Codeathon not found' }, { status: 404 })
    }
    return NextResponse.json({ success: true, deletedId: id })
  } catch (error) {
    console.error('[CodeSpectra] codeathons DELETE[id]:', error)
    return NextResponse.json({ error: 'Failed to delete codeathon' }, { status: 400 })
  }
}
