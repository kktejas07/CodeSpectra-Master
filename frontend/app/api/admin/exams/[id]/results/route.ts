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
      target_url: { $regex: id + '$' },
    }).toArray()

    const submissions = await db.collection('exam_submissions').find({
      exam_id: id,
    }).toArray()

    const submissionsByUser: Record<string, typeof submissions[0]> = {}
    for (const sub of submissions) {
      submissionsByUser[sub.user_id] = sub
    }

    const userMap: Record<string, { name?: string; email?: string }> = {}
    for (const inv of invites) {
      if (inv.user_id && !userMap[inv.user_id]) {
        const u = await db.collection('user').findOne(
          { $or: [{ _id: inv.user_id }, { id: inv.user_id }] },
          { projection: { name: 1, fullName: 1, email: 1 } },
        )
        if (u) {
          userMap[inv.user_id] = { name: u.fullName || u.name || '', email: u.email || '' }
        }
      }
    }

    interface CandidateResultRow {
      id: string
      name: string
      email: string
      status: string
      score: number | null
      submittedAt: string | null
      proctoringFlags: number
      idPhoto?: string | null
      facePhoto?: string | null
    }

    const results: CandidateResultRow[] = []

    for (const inv of invites) {
      const sub = submissionsByUser[inv.user_id]
      const user = userMap[inv.user_id] || {}
      let status = inv.status === 'used' ? 'completed' : inv.status

      if (status !== 'completed' && sub) {
        status = 'completed'
      }

      results.push({
        id: inv.id,
        name: inv.full_name || user.name || inv.email.split('@')[0],
        email: inv.email || user.email || '',
        status,
        score: sub ? Math.round(sub.score) : null,
        submittedAt: sub?.submitted_at || null,
        proctoringFlags: 0,
        idPhoto: sub?.id_photo || null,
        facePhoto: sub?.face_photo || null,
      })
    }

    for (const sub of submissions) {
      const already = results.some(r => r.email === (userMap[sub.user_id]?.email || ''))
      if (!already) {
        const u = await db.collection('user').findOne(
          { $or: [{ _id: sub.user_id }, { id: sub.user_id }] },
          { projection: { name: 1, fullName: 1, email: 1 } },
        )
        results.push({
          id: sub.id,
          name: u?.fullName || u?.name || 'Unknown',
          email: u?.email || '',
          status: 'completed',
          score: Math.round(sub.score),
          submittedAt: sub.submitted_at || null,
          proctoringFlags: 0,
          idPhoto: sub.id_photo || null,
          facePhoto: sub.face_photo || null,
        })
      }
    }

    return NextResponse.json({
      exam: {
        id: exam.id,
        title: exam.title,
        level: exam.level || '',
        duration: exam.duration || 0,
      },
      results,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to load results'
    console.error('[CodeSpectra] admin/exams/[id]/results GET:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
