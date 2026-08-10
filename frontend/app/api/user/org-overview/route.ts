import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/user/org-overview
 *
 * Tenant-scoped overview for organization admins. Returns the org profile plus
 * aggregates over the org's own data (assessments, candidates, members).
 * Regular users get 403 — this is the admin landing page, not the user one.
 */
export async function GET() {
  const gate = await requireAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const tenantId = gate.user.tenantId
  if (!tenantId) {
    return NextResponse.json({
      org: null,
      error: 'This account is not linked to an organization. Ask your platform admin to assign you one.',
    }, { status: 200 })
  }

  try {
    const db = await getMongoDb()

    const [tenant, exams, members] = await Promise.all([
      db.collection('tenants').findOne({ id: tenantId }),
      db.collection('exams').find({ tenant_id: tenantId }).toArray(),
      db.collection('user').countDocuments({ tenantId }),
    ])

    const examIds = exams.map((e: any) => e.id)

    // Candidates = invites whose target_url/assigned_assessments reference one of the org's exams.
    const candidatePipeline = examIds.length > 0
      ? [
          { $match: { $or: examIds.map((id: string) => ({
              $or: [
                { target_url: { $regex: id.replace(/-/g, '\\-') } },
                { 'assigned_assessments.target_url': { $regex: id.replace(/-/g, '\\-') } },
              ],
            })) } },
          { $group: { _id: null, total: { $sum: 1 }, submitted: { $sum: { $cond: [{ $or: [{ status: 'submitted' }, { status: 'completed' }] }, 1, 0] } } } },
        ]
      : []

    const [candidateAgg, submissions] = await Promise.all([
      candidatePipeline.length > 0 ? db.collection('candidate_invites').aggregate(candidatePipeline).toArray() : [],
      examIds.length > 0
        ? db.collection('exam_submissions').aggregate([
            { $match: { exam_id: { $in: examIds } } },
            { $group: { _id: null, attempts: { $sum: 1 }, totalScore: { $sum: '$score' }, totalMaxScore: { $sum: '$max_score' } } },
          ]).toArray()
        : [],
    ])

    const cand = candidateAgg[0] || { total: 0, submitted: 0 }
    const sub = submissions[0] || { attempts: 0, totalScore: 0, totalMaxScore: 0 }

    const recent = exams
      .map((e: any) => ({
        id: e.id,
        title: e.title,
        subject: e.subject,
        level: e.level,
        duration: e.duration,
        questions: e.questions,
        published: e.published === true,
        attempts: e.attempts || 0,
        avgScore: e.avgScore || 0,
        createdAt: e.createdAt || null,
      }))
      .sort((a: any, b: any) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .slice(0, 6)

    return NextResponse.json({
      org: tenant ? { id: tenant.id, name: tenant.name, slug: tenant.slug, plan: tenant.plan } : null,
      assessments: {
        total: exams.length,
        published: exams.filter((e: any) => e.published === true).length,
        attempts: sub.attempts,
        avgScore: sub.totalMaxScore > 0 ? Math.round((sub.totalScore / sub.totalMaxScore) * 100) : 0,
      },
      candidates: { total: cand.total, submitted: cand.submitted },
      members: { total: members },
      recent,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to load organization overview'
    console.error('[CodeSpectra] GET /api/user/org-overview error:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
