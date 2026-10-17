import { formatDateTime } from '@/lib/format-datetime'
import { NextResponse } from 'next/server'
import { requireAdmin, requireTenantEntity } from '@/lib/api-auth'
import { getMongoDb } from '@/lib/mongodb'
import type { IdRouteContext } from '@/lib/app-route-context'

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
    const examTitle = owned.doc?.title || 'Exam'

    const invites = await db.collection('candidate_invites').find({
      $or: [
        { target_url: { $regex: id.replace(/-/g, '\\-') } },
        { 'assigned_assessments.target_url': { $regex: id.replace(/-/g, '\\-') } },
      ],
    }).toArray()

    const submissions = await db.collection('exam_submissions').find({
      exam_id: id,
    }).toArray()

    const submissionsByUser: Record<string, typeof submissions[0]> = {}
    for (const sub of submissions) {
      if (sub.user_id) submissionsByUser[sub.user_id] = sub
    }

    const userMap: Record<string, { name?: string; email?: string }> = {}
    const fetchedIds = new Set<string>()
    const fetchUser = async (uid: string) => {
      if (!uid || fetchedIds.has(uid)) return
      fetchedIds.add(uid)
      const u = await db.collection('user').findOne(
        { $or: [{ _id: uid as any }, { id: uid }] },
        { projection: { name: 1, fullName: 1, email: 1 } },
      )
      if (u) {
        userMap[uid] = { name: u.fullName || u.name || '', email: u.email || '' }
      }
    }

    for (const inv of invites) {
      if (inv.user_id) await fetchUser(inv.user_id)
    }

    interface CandidateResultRow {
      name: string
      email: string
      status: string
      score: string
      submittedAt: string
      proctoringFlags: number
      released: string
      deliveryStatus: string
    }

    const latestInviteByEmail = new Map<string, typeof invites[0]>()
    for (const inv of invites) {
      const key = (inv.email || '').toLowerCase()
      const existing = latestInviteByEmail.get(key)
      if (!existing || new Date(inv.created_at) > new Date(existing.created_at)) {
        latestInviteByEmail.set(key, inv)
      }
    }

    const results: CandidateResultRow[] = []
    const seenEmails = new Set<string>()

    for (const [, inv] of latestInviteByEmail) {
      const sub = submissionsByUser[inv.user_id]
      const user = userMap[inv.user_id] || {}
      let status = inv.status === 'used' ? 'completed' : inv.status || 'pending'

      if (status !== 'completed' && sub) {
        status = 'completed'
      }

      const email = inv.email || user.email || ''
      if (email) seenEmails.add(email.toLowerCase())

      results.push({
        name: inv.full_name || user.name || (email ? email.split('@')[0] : 'Candidate'),
        email,
        status,
        score: sub && sub.score !== undefined && sub.score !== null ? `${Math.round(sub.score)}%` : '--',
        submittedAt: sub?.submitted_at ? formatDateTime(sub.submitted_at) : '--',
        proctoringFlags: 0,
        released: sub?.released_at ? 'Yes' : 'No',
        deliveryStatus: inv.delivery_status || '--',
      })
    }

    for (const sub of submissions) {
      const user = userMap[sub.user_id] || {}
      const email = user.email || ''
      if (!email || seenEmails.has(email.toLowerCase())) continue

      await fetchUser(sub.user_id)
      const fetched = userMap[sub.user_id] || {}

      results.push({
        name: fetched.name || 'Candidate',
        email: fetched.email || email,
        status: 'completed',
        score: sub.score !== undefined && sub.score !== null ? `${Math.round(sub.score)}%` : '--',
        submittedAt: sub.submitted_at ? formatDateTime(sub.submitted_at) : '--',
        proctoringFlags: 0,
        released: sub.released_at ? 'Yes' : 'No',
        deliveryStatus: '--',
      })
      if (fetched.email) seenEmails.add(fetched.email.toLowerCase())
    }

    const headers = [
      'Candidate Name',
      'Email',
      'Status',
      'Delivery Status',
      'Proctoring Flags',
      'Score (%)',
      'Submitted At',
      'Score Released',
    ]

    const csvRows = results.map(r => [
      r.name,
      r.email,
      r.status,
      r.deliveryStatus,
      r.proctoringFlags,
      r.score,
      r.submittedAt,
      r.released,
    ])

    const csvString = [headers, ...csvRows]
      .map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\r\n')

    const csvContent = '\uFEFF' + csvString

    const sanitizeTitle = examTitle
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')

    const filename = `${sanitizeTitle}_results_${new Date().toISOString().slice(0, 10)}.csv`

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    })
  } catch (e: unknown) {
    const msg = 'Failed to export CSV'
    console.error('[CodeSpectra] admin/exams/[id]/results/export GET:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
