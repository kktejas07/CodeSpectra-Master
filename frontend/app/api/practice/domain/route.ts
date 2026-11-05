/**
 * POST /api/practice/domain — generate a verified, domain-grounded practice set
 * of coding problems for an industry / tech-stack / level coordinate.
 *
 * Learner-facing. Charges 1 AI credit per requested problem up front and
 * refunds the ones that don't survive the sandbox gate, so a learner never
 * pays for problems that never get published. Reuses the shared catalog → spec
 * → verified-pipeline brain (lib/practice-content/domain-practice.ts) so the
 * admin bulk generator and this learner path produce identical problems.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getUserAiCredits, spendAiCredits, refundAiCredits, outOfCredits } from '@/lib/user-credits'
import {
  INDUSTRIES,
  COURSE_LEVELS,
  buildDomainPracticeSpec,
  generateDomainProblemSet,
  type IndustryId,
} from '@/lib/practice-content/domain-practice'
import type { ServiceUser } from '@/lib/services/result'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const CREDIT_PER_PROBLEM = 1
const MAX_PROBLEMS = 5

function bodyOf(req: NextRequest): Promise<Record<string, unknown>> {
  return req.json().catch(() => ({}))
}

export async function POST(req: NextRequest) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })

  const body = await bodyOf(req)
  const industry = String(body.industry || '').trim().toLowerCase() as IndustryId
  const techStack = String(body.techStack || body.tech_stack || '').trim()
  const level = String(body.level || '').trim()
  const count = Math.max(1, Math.min(MAX_PROBLEMS, Number(body.count) || 3))

  if (!INDUSTRIES.some(i => i.id === industry)) {
    return NextResponse.json({ error: 'Unknown industry', code: 'bad_industry' }, { status: 400 })
  }
  if (!techStack) {
    return NextResponse.json({ error: 'techStack is required', code: 'techstack_is_required' }, { status: 400 })
  }
  if (!COURSE_LEVELS.includes(level as (typeof COURSE_LEVELS)[number])) {
    return NextResponse.json({ error: 'Unknown level', code: 'bad_level' }, { status: 400 })
  }

  const serviceUser = {
    id: user.id,
    email: user.email,
    role: user.role,
    tenantId: user.tenantId ?? null,
  } as ServiceUser

  // Superadmins are unlimited (spendAiCredits is a no-op for them); everyone
  // else pays per requested problem and gets the failures refunded.
  const pre = await getUserAiCredits(user.id)
  if (!pre.unlimited && pre.balance < count * CREDIT_PER_PROBLEM) {
    return NextResponse.json(outOfCredits({ cost: count * CREDIT_PER_PROBLEM, balance: pre.balance }), { status: 402 })
  }
  const spent = pre.unlimited ? { ok: true as const, balance: pre.balance } : await spendAiCredits(user.id, count * CREDIT_PER_PROBLEM)
  if (!spent.ok) {
    return NextResponse.json(outOfCredits({ cost: count * CREDIT_PER_PROBLEM, balance: spent.balance }), { status: 402 })
  }

  const spec = buildDomainPracticeSpec(industry, techStack, level as (typeof COURSE_LEVELS)[number])
  const results = await generateDomainProblemSet(serviceUser, spec, count)

  const failed = results.filter(r => !r.ok).length
  if (failed > 0 && !pre.unlimited) {
    try { await refundAiCredits(user.id, failed * CREDIT_PER_PROBLEM) } catch { /* refund is best effort */ }
  }

  const published = results
    .filter((r): r is typeof r & { ok: true; id: string; slug: string } => r.ok && 'id' in r)
    .map(r => ({
      id: r.id,
      slug: r.slug,
      url: `/dashboard/problems/${r.slug}`,
    }))

  return NextResponse.json({
    spec,
    requested: count,
    published,
    results,
    failed,
    balance: pre.unlimited ? null : Math.max(0, spent.balance - failed * CREDIT_PER_PROBLEM),
  })
}
