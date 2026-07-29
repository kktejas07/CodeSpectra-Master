import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
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

    const exam = await db.collection('exams').findOne({ id })
    if (!exam) {
      return NextResponse.json({ error: 'Exam not found' }, { status: 404 })
    }

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
      submissionsByUser[sub.user_id] = sub
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
      id: string
      name: string
      email: string
      status: string
      score: number | null
      submittedAt: string | null
      proctoringFlags: number
    }

    const results: CandidateResultRow[] = []
    const seenEmails = new Set<string>()

    for (const inv of invites) {
      const sub = submissionsByUser[inv.user_id]
      const user = userMap[inv.user_id] || {}
      let status = inv.status === 'used' ? 'completed' : inv.status

      if (status !== 'completed' && sub) {
        status = 'completed'
      }

      const email = inv.email || user.email || ''
      seenEmails.add(email.toLowerCase())

      results.push({
        id: inv.id,
        name: inv.full_name || user.name || email.split('@')[0] || 'Candidate',
        email,
        status,
        score: sub ? Math.round(sub.score) : null,
        submittedAt: sub?.submitted_at || null,
        proctoringFlags: 0,
      })
    }

    for (const sub of submissions) {
      const user = userMap[sub.user_id] || {}
      const email = user.email || ''
      if (!email || seenEmails.has(email.toLowerCase())) continue

      await fetchUser(sub.user_id)
      const fetched = userMap[sub.user_id] || {}

      results.push({
        id: sub.id,
        name: fetched.name || 'Unknown',
        email: fetched.email || '',
        status: 'completed',
        score: Math.round(sub.score),
        submittedAt: sub.submitted_at || null,
        proctoringFlags: 0,
      })
      if (fetched.email) seenEmails.add(fetched.email.toLowerCase())
    }

    return NextResponse.json({
      exam: {
        id: exam.id,
        title: exam.title,
        level: exam.level || '',
        duration: exam.duration || 0,
      },
      results,
      debug: { inviteCount: invites.length, submissionCount: submissions.length },
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to load results'
    console.error('[CodeSpectra] admin/exams/[id]/results GET:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
