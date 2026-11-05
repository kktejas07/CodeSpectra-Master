/**
 * POST /api/admin/practice/domain — bulk-generate a verified, domain-grounded
 * practice set for an industry / tech-stack / level coordinate.
 *
 * Admin-only (superadmin, 2FA). Unlike the learner route, superadmins are
 * unlimited on AI credits so nothing is charged/refunded here. Uses the same
 * shared brain (lib/practice-content/domain-practice.ts) so admin bulk and the
 * learner page publish identical problems.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin, gateErrorBody } from '@/lib/route-auth'
import {
  INDUSTRIES,
  COURSE_LEVELS,
  buildDomainPracticeSpec,
  generateDomainProblemSet,
  type IndustryId,
} from '@/lib/practice-content/domain-practice'
import { systemPracticeUser } from '@/lib/practice-content/problems-generate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 600

const MAX_PROBLEMS = 10

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json(gateErrorBody(gate), { status: gate.status })

  const body = await req.json().catch(() => ({} as Record<string, unknown>))
  const industry = String(body.industry || '').trim().toLowerCase() as IndustryId
  const techStack = String(body.techStack || body.tech_stack || '').trim()
  const level = String(body.level || '').trim()
  const count = Math.max(1, Math.min(MAX_PROBLEMS, Number(body.count) || 5))

  if (!INDUSTRIES.some(i => i.id === industry)) {
    return NextResponse.json({ error: 'Unknown industry', code: 'bad_industry' }, { status: 400 })
  }
  if (!techStack) {
    return NextResponse.json({ error: 'techStack is required', code: 'techstack_is_required' }, { status: 400 })
  }
  if (!COURSE_LEVELS.includes(level as (typeof COURSE_LEVELS)[number])) {
    return NextResponse.json({ error: 'Unknown level', code: 'bad_level' }, { status: 400 })
  }

  const spec = buildDomainPracticeSpec(industry, techStack, level as (typeof COURSE_LEVELS)[number])
  // Content is attributed to the practice system account, not the admin's login.
  const results = await generateDomainProblemSet(systemPracticeUser(), spec, count)

  const failed = results.filter(r => !r.ok).length
  const published = results
    .filter((r): r is typeof r & { ok: true; id: string; slug: string } => r.ok && 'id' in r)
    .map(r => ({ id: r.id, slug: r.slug, url: `/dashboard/problems/${r.slug}` }))

  return NextResponse.json({
    spec,
    requested: count,
    published,
    results,
    failed,
  })
}
