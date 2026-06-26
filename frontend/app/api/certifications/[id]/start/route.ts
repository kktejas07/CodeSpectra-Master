/**
 * POST /api/certifications/[id]/start
 *
 * Auth required. Creates a fresh attempt record for the signed-in user
 * and returns the question bank with answers stripped. Idempotent on the
 * (user, certification, day) tuple so refresh-spamming the start button
 * doesn't flood the DB.
 */
import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { getAPIUser } from '@/lib/api-auth'
import { getMongoDb } from '@/lib/mongodb'
import {
  attemptQuestionView,
  certifications,
  certificationAttempts,
  newAttemptId,
  newAttemptToken,
  type CertificationAttemptDoc,
} from '@/lib/db/certifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params

  const certs = await certifications()
  const cert = await certs.findOne({ $or: [{ id }, { slug: id }], is_active: true })
  if (!cert) {
    return NextResponse.json({ error: 'Certification not found' }, { status: 404 })
  }

  const attempts = await certificationAttempts()
  // Reuse the most recent unsubmitted attempt within the last 24h.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const existing = await attempts.findOne(
    {
      user_id: user.id,
      certification_id: cert.id,
      submitted_at: { $in: [null, undefined] as never },
      started_at: { $gte: since },
    },
    { sort: { started_at: -1 } },
  )

  let attempt: CertificationAttemptDoc
  if (existing) {
    attempt = existing
  } else {
    // Look up the user's display name from Better Auth's `user` collection so
    // the verify page renders a real candidate name instead of "Anonymous".
    let displayName: string | undefined
    try {
      const db = await getMongoDb()
      // Better Auth stores users with ObjectId `_id`; the session exposes that
      // as a string in `user.id`. Try both shapes for resilience.
      let oid: ObjectId | null = null
      try {
        oid = new ObjectId(user.id)
      } catch {
        oid = null
      }
      const u = await db.collection('user').findOne(
        oid ? { _id: oid } : { id: user.id },
      )
      displayName = (u?.name as string | undefined) || undefined
    } catch {
      displayName = undefined
    }
    attempt = {
      id: newAttemptId(),
      user_id: user.id,
      certification_id: cert.id,
      verify_token: newAttemptToken(),
      started_at: new Date().toISOString(),
      submitted_at: null,
      score: 0,
      passed: false,
      snapshot: { name: displayName, email: user.email || undefined },
      cert_snapshot: { title: cert.title, level: cert.level, source: cert.source },
    }
    await attempts.insertOne(attempt)
  }

  return NextResponse.json({
    attempt_id: attempt.id,
    started_at: attempt.started_at,
    duration_minutes: cert.duration,
    passing_score: cert.passing_score,
    certification: { id: cert.id, slug: cert.slug, title: cert.title, level: cert.level },
    questions: attemptQuestionView(cert),
  })
}
