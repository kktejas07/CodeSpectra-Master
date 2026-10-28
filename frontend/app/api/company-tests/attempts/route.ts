/**
 * Company test practice runs (signed-in learners).
 *   GET  ?patternId=   your recent runs (scores only)
 *   POST { patternId, level }   start a run → the first section
 */
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/route-auth'
import { limitRequest } from '@/lib/rate-limit'
import { attemptView, PracticeError, recentAttempts, startAttempt } from '@/lib/company-tests/practice'
import { PRACTICE_LEVELS } from '@/lib/company-tests/types'
import { apiErrorBody } from '@/lib/api-errors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ID = z.string().trim().regex(/^[a-z0-9][a-z0-9-]{0,62}$/)
const startSchema = z.object({ patternId: ID, level: z.enum(PRACTICE_LEVELS) })

export async function GET(req: NextRequest) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const raw = req.nextUrl.searchParams.get('patternId')
  const patternId = raw ? ID.safeParse(raw) : null
  if (patternId && !patternId.success) return NextResponse.json({ error: 'Invalid pattern', code: 'ct_invalid_pattern' }, { status: 400 })
  try {
    return NextResponse.json({ items: await recentAttempts(gate.user.id, patternId?.data) })
  } catch (e) {
    console.error('[company-tests/attempts] GET:', (e as Error)?.message)
    return NextResponse.json({ error: 'Could not load your runs.', code: 'ct_runs_load_failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const limited = await limitRequest(req, 'company-test-start', gate.user.id, 20, 60 * 60_000)
  if (limited) return limited
  const parsed = startSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Pick a test and a level', code: 'ct_pick_test_level' }, { status: 400 })
  try {
    // Tough level is a plan feature (lib/billing/entitlement-features.ts), checked on the server.
    if (parsed.data.level === 'tough') {
      const { hasEntitlement, entitlementError } = await import('@/lib/entitlements')
      const ent = await hasEntitlement(gate.user, 'company_tests_tough')
      if (!ent.allowed) return NextResponse.json(entitlementError('company_tests_tough', ent.planKey), { status: 402 })
    }
    const a = await startAttempt(gate.user.id, parsed.data.patternId, parsed.data.level)
    return NextResponse.json({ attempt: attemptView(a) }, { status: 201 })
  } catch (e) {
    if (e instanceof PracticeError) return NextResponse.json(apiErrorBody(e.message), { status: e.status })
    console.error('[company-tests/attempts] POST:', (e as Error)?.message)
    return NextResponse.json({ error: 'Could not start the test. Please try again.', code: 'ct_start_failed' }, { status: 500 })
  }
}
