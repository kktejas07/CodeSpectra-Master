/**
 * One practice run (owner only).
 *   GET    current section (no answers) or, when finished, results + review
 *   POST { sectionId, answers }   submit the current section
 */
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/route-auth'
import { limitRequest } from '@/lib/rate-limit'
import { attemptView, loadAttempt, PracticeError, submitSection } from '@/lib/company-tests/practice'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

type Ctx = { params: Promise<{ id: string }> }
const UUID = /^[0-9a-f-]{36}$/i
const submitSchema = z.object({
  sectionId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  answers: z.record(z.string().max(128), z.union([z.string().max(20_000), z.number(), z.array(z.string().max(2000)).max(50)])).default({}),
})

function fail(e: unknown, what: string) {
  if (e instanceof PracticeError) return NextResponse.json({ error: e.message }, { status: e.status })
  console.error(`[company-tests/attempt] ${what}:`, (e as Error)?.message)
  return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: 'Practice run not found.' }, { status: 404 })
  try {
    return NextResponse.json({ attempt: attemptView(await loadAttempt(gate.user.id, id)) })
  } catch (e) {
    return fail(e, 'GET')
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const limited = await limitRequest(req, 'company-test-submit', gate.user.id, 30, 60_000)
  if (limited) return limited
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: 'Practice run not found.' }, { status: 404 })
  const parsed = submitSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid answers' }, { status: 400 })
  try {
    const a = await submitSection(gate.user.id, id, parsed.data.sectionId, parsed.data.answers)
    return NextResponse.json({ attempt: attemptView(a) })
  } catch (e) {
    return fail(e, 'POST')
  }
}
