/**
 * POST /api/admin/exams/[id]/release-scores/certificates
 *
 * "Issue missing certificates" on the admin results page: issues the
 * certificate for every candidate of this exam whose best released attempt
 * meets the exam's pass mark and who doesn't have one yet — e.g. results
 * released before certificates existed. Staff of the exam's tenant only.
 * Idempotent (one certificate per exam + candidate via issue_key); candidates
 * are told once, on first issue (in-app, or by email when invite-only).
 */
import { NextResponse } from 'next/server'
import { requireAdmin, requireTenantEntity } from '@/lib/api-auth'
import { getMongoDb } from '@/lib/mongodb'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'
import { issueMissingExamCertificates } from '@/lib/db/certifications'
import { examPassPercent } from '@/lib/exam-access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const rl = await rateLimitRedis(`exam-cert-backfill:${gate.user.id}`, 6, 60_000)
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many requests. Try again in a minute.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  const { id: examId } = await ctx.params
  try {
    const db = await getMongoDb()
    const owned = await requireTenantEntity(db, 'exams', examId, gate.user)
    if ('error' in owned) return NextResponse.json({ error: owned.error }, { status: owned.status })
    const exam = owned.doc as Record<string, unknown>

    if (exam.issue_certificates === false) {
      return NextResponse.json({ error: 'Certificates are turned off for this assessment' }, { status: 400 })
    }

    const cutoff = examPassPercent(exam)
    const counts = await issueMissingExamCertificates(db, exam, cutoff)
    return NextResponse.json({ ...counts, cutoff })
  } catch (e) {
    console.error('[exam certificate backfill] error:', examId, e)
    return NextResponse.json({ error: 'Could not issue certificates' }, { status: 500 })
  }
}
