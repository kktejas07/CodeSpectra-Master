/**
 * GET /api/resumes/from-profile — a starting résumé built from your profile
 * (education, projects, experience, links) and your skill passport (verified
 * skills with level first, certificates, contest placements). Nothing is saved;
 * the builder shows it for you to edit and save as a version.
 */
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { rateLimitSlidingWindow } from '@/lib/in-memory-rate-limit'
import { getMongoDb } from '@/lib/mongodb'
import { ownerPassport } from '@/lib/passport/db'
import { resumeFromProfile } from '@/lib/resume/builder'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const rl = rateLimitSlidingWindow(`resume-prefill:${gate.user.id}`, 10, 60_000)
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests. Please wait a moment and try again.', code: 'rate_limited', params: { seconds: rl.retryAfterSec } }, { status: 429 })
  try {
    const db = await getMongoDb()
    const [ext, pass] = await Promise.all([
      db.collection('user_extended_profiles').findOne({ userId: gate.user.id }, { projection: { _id: 0, basic: 1, about: 1, skills: 1, links: 1, experience: 1, education: 1, projects: 1, achievements: 1, certificates: 1 } }),
      ownerPassport(gate.user.id),
    ])
    const data = resumeFromProfile(
      { name: gate.user.fullName || gate.user.name || '', email: gate.user.email || '', ...(ext ?? {}) },
      {
        skills: pass.summary.skills.map((s) => ({ skill: s.skill, level: s.level })),
        selfReported: pass.summary.selfReported,
        evidence: pass.evidence.map((e) => ({ kind: e.kind, title: e.title, at: e.at, rank: e.rank ?? null, participants: e.participants ?? null, publicLink: e.publicLink ?? null })),
      },
    )
    return NextResponse.json({ data, verified_skills: pass.summary.skills.length }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) {
    console.error('[resumes/from-profile] failed', (e as Error).message)
    return NextResponse.json({ error: 'Could not load your profile. Try again.', code: 'resume_prefill_failed' }, { status: 500 })
  }
}
