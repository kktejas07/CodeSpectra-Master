/**
 * Admin → Company patterns → Build. Recomposes the Easy / Moderate / Tough
 * version(s) of a pattern from approved bank questions; with `useAi` the
 * question generator fills the shortfall as drafts (within the caps), and the
 * version stays incomplete until those drafts are approved. Superadmin only.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { requireSuperAdmin } from '@/lib/route-auth'
import { limitRequest } from '@/lib/rate-limit'
import { getPattern } from '@/lib/company-tests/db'
import { buildVersion } from '@/lib/company-tests/build'
import { PRACTICE_LEVELS, versionSummary, type PracticeLevel } from '@/lib/company-tests/types'
import { BRANCHES } from '@/lib/engineering-catalog'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

type Ctx = { params: Promise<{ id: string }> }

const bodySchema = z.object({
  level: z.enum([...PRACTICE_LEVELS, 'all'] as [string, ...string[]]).default('all'),
  useAi: z.boolean().default(false),
  branch: z.string().trim().max(40).refine((b) => BRANCHES.some((x) => x.id === b), 'Unknown branch').optional(),
})

export async function POST(req: NextRequest, { params }: Ctx) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const limited = await limitRequest(req, 'company-pattern-build', gate.user.id, 10, 60_000)
  if (limited) return limited
  const { id } = await params
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid request' }, { status: 400 })
  try {
    const pattern = await getPattern(id)
    if (!pattern) return NextResponse.json({ error: 'Pattern not found' }, { status: 404 })
    const levels = (parsed.data.level === 'all' ? PRACTICE_LEVELS : [parsed.data.level]) as PracticeLevel[]
    const results = []
    let generated = 0
    let aiCapped = false
    for (const level of levels) {
      const r = await buildVersion(pattern, level, { allowAi: parsed.data.useAi && !aiCapped, branch: parsed.data.branch })
      generated += r.generated
      aiCapped ||= r.aiCapped
      results.push(versionSummary(pattern, level, r.version))
    }
    return NextResponse.json({ versions: results, generated, aiCapped })
  } catch (e) {
    console.error('[admin/company-patterns] build:', (e as Error)?.message)
    return NextResponse.json({ error: 'Could not build the test. Please try again.' }, { status: 500 })
  }
}
