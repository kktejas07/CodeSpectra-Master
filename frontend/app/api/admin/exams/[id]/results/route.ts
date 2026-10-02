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
    const exam = owned.doc

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

    // Email fallback map — invited-link invites are created with an empty
    // user_id, so join by email when the user_id lookup misses.
    const submissionsByEmail: Record<string, typeof submissions[0]> = {}
    for (const sub of submissions) {
      const key = String(sub.email || '').toLowerCase()
      if (!key) continue
      const existing = submissionsByEmail[key]
      if (!existing || String(sub.created_at || '') > String(existing.created_at || '')) {
        submissionsByEmail[key] = sub
      }
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

    // Also fetch users for submissions that don't have invites (public/share-link candidates).
    // ponytail: single parallel batch — the old sequential await-per-user loop
    // turned 65 candidates into 65+ serial Mongo roundtrips on every page load.
    const submissionUserIds = new Set<string>()
    for (const sub of submissions) {
      if (sub.user_id && !sub.user_id.startsWith('candidate_')) {
        submissionUserIds.add(sub.user_id)
      }
    }
    for (const inv of invites) {
      if (inv.user_id) submissionUserIds.add(inv.user_id)
    }
    await Promise.all([...submissionUserIds].map((uid) => fetchUser(uid)))

    interface CandidateResultRow {
      id: string
      userId: string
      name: string
      email: string
      status: string
      score: number | null
      maxScore: number | null
      submittedAt: string | null
      invitedAt: string | null
      proctoringFlags: number
      released: boolean
      deliveryStatus: string | null
      graded: boolean
      source?: string
    }

    // Score is stored as raw points (e.g. 121/166). The admin UI displays it
    // as a percentage, so normalize to 0-100 here — this is what prevents
    // "scores over 100%" when an exam's max points != 100.
    const toPercent = (score: number | undefined, max: number | undefined) => {
      if (score == null || !max) return null
      return Math.min(100, Math.round((score / max) * 100))
    }

    // Fetch proctor event counts for all users
    const proctorCounts = await db.collection('proctor_events').aggregate([
      { $match: { session_kind: 'exam', session_id: id } },
      { $group: { _id: '$user_id', count: { $sum: 1 } } },
    ]).toArray()
    const proctorMap = new Map(proctorCounts.map((p: any) => [p._id, p.count]))

    // Deduplicate invites by email — keep the most recent one
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
    const matchedSubmissionIds = new Set<string>()

    for (const [, inv] of latestInviteByEmail) {
      const invEmail = String(inv.email || '').toLowerCase()
      const sub = submissionsByUser[inv.user_id]
        || (invEmail ? submissionsByEmail[invEmail] : undefined)
      if (sub) matchedSubmissionIds.add(String(sub.id))
      const user = userMap[inv.user_id] || {}

      // Only mark as completed if there's an actual submission record
      const hasSubmission = !!sub
      let status = hasSubmission ? 'completed' : (inv.status === 'used' ? 'in_progress' : inv.status || 'pending')

      const email = inv.email || user.email || ''
      seenEmails.add(email.toLowerCase())

      results.push({
        id: inv.id,
        userId: inv.user_id || '',
        name: inv.full_name || user.name || email.split('@')[0] || 'Candidate',
        email,
        status,
        score: sub ? toPercent(sub.score, sub.max_score) : null,
        maxScore: sub ? sub.max_score : null,
        submittedAt: sub?.submitted_at || sub?.created_at || null,
        invitedAt: inv.created_at || null,
        proctoringFlags: proctorMap.get(inv.user_id) || (sub ? proctorMap.get(sub.user_id) || 0 : 0),
        released: sub?.released_at ? true : false,
        deliveryStatus: sub && inv.delivery_status === 'sending' ? 'delivered' : (inv.delivery_status || null),
        graded: sub ? (sub.has_pending_review === false) : false,
      })
    }

    for (const sub of submissions) {
      // Skip submissions already shown on an invite row above (matched by
      // user_id or by email fallback).
      if (matchedSubmissionIds.has(String(sub.id))) continue
      if (invites.some(inv => inv.user_id && inv.user_id === sub.user_id)) continue

      const email = sub.email || userMap[sub.user_id]?.email || ''
      if (!email || seenEmails.has(email.toLowerCase())) continue

      const fetched = userMap[sub.user_id] || {}

      results.push({
        id: sub.id,
        userId: sub.user_id || '',
        name: fetched.name || sub.email?.split('@')[0] || 'Candidate',
        email: email,
        status: 'completed',
        score: toPercent(sub.score, sub.max_score),
        maxScore: sub.max_score || null,
        submittedAt: sub.submitted_at || sub.created_at || null,
        invitedAt: sub.submitted_at || sub.created_at || null,
        proctoringFlags: proctorMap.get(sub.user_id) || 0,
        released: sub.released_at ? true : false,
        deliveryStatus: 'delivered',
        graded: sub.has_pending_review === false,
        source: sub.source || 'public_link',
      })
      seenEmails.add(email.toLowerCase())
    }

    // Plagiarism / leak detection intentionally NOT run here: it costs two
    // sequential LLM calls (up to ~30s of timeouts with degraded providers)
    // on every page load, and no UI consumes the result (verified: zero
    // readers of these response fields). If detection UI is ever added, call
    // the detectors from a dedicated lazy endpoint, never the list path.
    const plagiarism = null
    const leakDetection = null

    return NextResponse.json({
      exam: {
        id: exam.id,
        title: exam.title,
        level: exam.level || '',
        duration: exam.duration || 0,
        publicLinkViews: exam.public_link_views || 0,
        plagiarismReport: exam.plagiarism_report || null,
      },
      results,
      plagiarism,
      leakDetection,
      debug: { inviteCount: invites.length, submissionCount: submissions.length },
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to load results'
    console.error('[CodeSpectra] admin/exams/[id]/results GET:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
