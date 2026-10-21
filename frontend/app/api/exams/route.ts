import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { knowledgeOnTestChange } from '@/lib/rag/hooks'
import { isExamStaff } from '@/lib/exam-access'
import { createExam, updateExam } from '@/lib/services/exams'
import { errorBody } from '@/lib/services/result'
import { revokeExamCertificates } from '@/lib/db/certifications'
import { writeAuditLog, auditLogAction } from '@/lib/db/misc'
import { clientLimiterKeyFromRequest } from '@/lib/in-memory-rate-limit'

export const runtime = 'nodejs'

export async function GET() {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  try {
    const db = await getMongoDb()

    const tenantFilter: Record<string, unknown> = {}
    if (gate.user.role === 'tenant_admin' && gate.user.tenantId) {
      tenantFilter.tenant_id = gate.user.tenantId
    }

    // Non-admin users see open exams + exams they were invited to or have submitted
    let filter: Record<string, unknown> = {}
    if (gate.user.role === 'superadmin') {
      filter = {}
    } else if (gate.user.role === 'tenant_admin') {
      // Tenant admins only see exams created within their organization
      filter = gate.user.tenantId ? { tenant_id: gate.user.tenantId } : { _id: null }
    } else {
      const userId = gate.user.id
      const [submissions, invites] = await Promise.all([
        db.collection('exam_submissions').find({ user_id: userId }).project({ exam_id: 1 }).toArray(),
        db.collection('candidate_invites').find({
          $or: [
            { user_id: userId },
            { email: gate.user.email },
            { email: { $regex: new RegExp(`^${String(gate.user.email).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } },
          ],
        }).project({ target_url: 1, assigned_assessments: 1, email: 1 }).toArray(),
      ])
      const userExamIds = new Set<string>()
      submissions.forEach((s: any) => { if (s.exam_id) userExamIds.add(s.exam_id) })
      invites.forEach((inv: any) => {
        const fromUrl = inv.target_url?.match(/\/assessment\/([^/?]+)/)?.[1]
        if (fromUrl) userExamIds.add(fromUrl)
        inv.assigned_assessments?.forEach((a: any) => { if (a.id) userExamIds.add(a.id) })
      })
      if (userExamIds.size > 0) {
        filter = { $or: [{ access_type: 'open' }, { id: { $in: [...userExamIds] } }] }
      } else {
        filter = { access_type: 'open' }
      }
    }
    const data = await db.collection('exams').find(filter).toArray()
    
    // Aggregate attempts, released scores, and average scores from submissions
    const stats = await db.collection('exam_submissions').aggregate([
      {
        $group: {
          _id: '$exam_id',
          attempts: { $sum: 1 },
          released: { $sum: { $cond: [ { $gt: ["$released_at", null] }, 1, 0 ] } },
          totalScore: { $sum: '$score' },
          totalMaxScore: { $sum: '$max_score' },
        }
      }
    ]).toArray()
    const statsMap = new Map(stats.map(s => [s._id, s]))

    const allInvites = await db.collection('candidate_invites').find({}, { projection: { target_url: 1, assigned_assessments: 1, email: 1, user_id: 1 } }).toArray()
    const invitesMap = new Map<string, number>()
    // ponytail: count PEOPLE, not invite docs. Every re-invite expires the old
    // row and inserts a new one, so raw doc counts showed 2x (or more) the
    // actual recipients. Dedupe by email per exam, same as the results page.
    const seenInvitee = new Set<string>()
    for (const inv of allInvites) {
      const urls = [inv.target_url, ...(inv.assigned_assessments || []).map((a: any) => a.target_url)].filter(Boolean)
      const examIds = urls.map(url => url.match(/\/assessment\/([a-zA-Z0-9-]+)/)?.[1]).filter(Boolean)
      const who = String(inv.email || inv.user_id || '').toLowerCase()
      for (const eid of examIds) {
        const key = eid + '|' + who
        if (seenInvitee.has(key)) continue
        seenInvitee.add(key)
        invitesMap.set(eid, (invitesMap.get(eid) || 0) + 1)
      }
    }

    // Get current user's submissions to set completed/pending status
    const userSubmissions = await db.collection('exam_submissions').find({ user_id: gate.user.id }).toArray()
    const submissionMap = new Map(userSubmissions.map(s => [s.exam_id, s]))

    const examsList = data.map(exam => {
      const examStats = statsMap.get(exam.id) || { attempts: 0, totalScore: 0, totalMaxScore: 0 }
      const userSub = submissionMap.get(exam.id)
      const avgPercent = examStats.totalMaxScore > 0 
        ? Math.round((examStats.totalScore / examStats.totalMaxScore) * 100)
        : 0

      const isReleased = userSub?.score_released === true
      const isAdmin = gate.user.role === 'superadmin' || gate.user.role === 'tenant_admin'
      // Non-admins must never receive answer keys via the list endpoint.
      // ponytail: the old destructure (`...safeExam`) dropped questionList
      // in BOTH branches, so the admin edit page always saw Questions (0).
      // Re-attach it for admins explicitly.
      const { questionList: _q, ...safeExam } = exam
      void _q
      return {
        ...safeExam,
        ...(isAdmin ? { questionList: (exam as any).questionList ?? [] } : {}),
        attempts: examStats.attempts,
        released: examStats.released || 0,
        invites: invitesMap.get(exam.id) || 0,
        avgScore: avgPercent,
        status: userSub ? (isReleased ? 'completed' : 'submitted') : 'pending',
        ...(isReleased && { score: Math.round((userSub.score / (userSub.max_score || 1)) * 100) }),
      }
    })

    return NextResponse.json({ data: examsList })
  } catch (e: unknown) {
    const msg = 'Failed to fetch exams'
    console.error('[CodeSpectra] GET /api/exams error:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const user = gate.user
  if (user.role !== 'superadmin' && user.role !== 'tenant_admin') {
    return NextResponse.json({ error: 'Forbidden', code: 'forbidden' }, { status: 403 })
  }
  try {
    const body = await request.json()
    // Business logic (plan limit, bank pick + AI top-up, tenant) lives in lib/services/exams.
    const r = await createExam(user, body)
    if (!r.ok) return NextResponse.json(errorBody(r), { status: r.status })
    return NextResponse.json(r.data, { status: r.status })
  } catch (e) {
    console.error('[exams] POST error:', e)
    return NextResponse.json({ error: 'Failed to create' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const user = gate.user
  if (user.role !== 'superadmin' && user.role !== 'tenant_admin') {
    return NextResponse.json({ error: 'Forbidden', code: 'forbidden' }, { status: 403 })
  }
  try {
    const body = await request.json()
    const id = typeof body?.id === 'string' ? body.id : ''
    const r = await updateExam(user, id, body)
    if (!r.ok) return NextResponse.json(errorBody(r), { status: r.status })
    return NextResponse.json({ ok: true })
  } catch { return NextResponse.json({ error: 'Failed', code: 'failed' }, { status: 500 }) }
}

export async function DELETE(request: Request) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const user = gate.user
  if (user.role !== 'superadmin' && user.role !== 'tenant_admin') {
    return NextResponse.json({ error: 'Forbidden', code: 'forbidden' }, { status: 403 })
  }
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required', code: 'id_required' }, { status: 400 })
    const db = await getMongoDb()
    const exam = await db.collection('exams').findOne({ id })
    if (!exam) return NextResponse.json({ error: 'Not found', code: 'not_found' }, { status: 404 })
    // Tenant-scoped: superadmin, or a tenant_admin of this exam's tenant (a
    // missing tenantId never matches).
    if (!isExamStaff(user, exam)) return NextResponse.json({ error: 'Forbidden', code: 'forbidden' }, { status: 403 })

    // No soft-delete pattern exists for exams, so delete the dependents in the
    // same handler — before the exam itself, so a failure part-way leaves the
    // exam in place and the delete can simply be retried.
    const examUrl = new RegExp(`/assessment/${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[/?#]|$)`)
    const examFilter = { exam_id: id }
    const removed: Record<string, number> = {}

    // Certificates outlive the exam as records, but must stop verifying as
    // valid: revoke them (the public verify page then shows "Revoked on …").
    // First, so a failure leaves everything in place for a retry.
    const subIds = (await db.collection('exam_submissions')
      .find(examFilter, { projection: { _id: 0, id: 1 } }).toArray()).map((s) => String(s.id))
    const archivedIds = (await db.collection('exam_submission_attempts')
      .find(examFilter, { projection: { _id: 0, id: 1 } }).toArray()).map((s) => String(s.id))
    const revoked = await revokeExamCertificates(id, [...subIds, ...archivedIds], user.id, 'Test deleted')
    removed.certificates_revoked = revoked
    if (revoked > 0) {
      await writeAuditLog({
        ...auditLogAction('certificate.revoke', 'success', user.id, clientLimiterKeyFromRequest(request, null), `exam/${id}`, 'certificate', 'warning', `Test deleted: ${revoked} certificate(s) revoked`),
        tenant_id: user.role === 'tenant_admin' ? user.tenantId ?? null : null,
      })
    }

    const del = async (col: string, filter: Record<string, unknown>) => {
      removed[col] = (await db.collection(col).deleteMany(filter)).deletedCount
    }
    await del('exam_submissions', examFilter)
    await del('exam_submission_attempts', examFilter)
    // Uploaded answer / CAD files in the private bucket go with their records.
    const { deleteBlobsFor } = await import('@/lib/storage/blobs')
    const blobFailures = await deleteBlobsFor(db.collection('exam_submission_files'), examFilter)
    if (blobFailures) removed.file_objects_failed = blobFailures
    await del('exam_submission_files', examFilter)
    await del('exam_drafts', examFilter)
    await del('exam_identity_checks', examFilter)
    await del('assessment_link_usage', examFilter)
    await del('assessment_links', examFilter)
    await del('proctor_events', { session_kind: 'exam', session_id: id })
    // Invites for this exam only. Multi-step invites that also point at other
    // assessments keep those steps; only this exam's step is pulled.
    await del('candidate_invites', { $or: [{ exam_id: id }, { target_url: examUrl }] })
    await db.collection('candidate_invites').updateMany(
      { 'assigned_assessments.target_url': examUrl },
      { $pull: { assigned_assessments: { target_url: examUrl } } } as never,
    )
    await db.collection('exams').deleteOne({ id })
    knowledgeOnTestChange(id, exam.tenant_id)
    console.info(`[exams] DELETE ${id} by ${user.id}: removed`, removed)
    return NextResponse.json({ ok: true, removed })
  } catch (e) {
    console.error('[exams] DELETE error:', e)
    return NextResponse.json({ error: 'Failed to delete assessment' }, { status: 500 })
  }
}
