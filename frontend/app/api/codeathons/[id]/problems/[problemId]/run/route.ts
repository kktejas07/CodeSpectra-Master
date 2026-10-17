import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { isTenantStaff } from '@/lib/exam-access'
import { runCodeathonCode, codeathonWindow, isCodeathonParticipant } from '@/lib/codeathon-run'
import { rateLimitSlidingWindow } from '@/lib/in-memory-rate-limit'

/**
 * Run code against custom input for a codeathon problem. Only for this
 * contest's participants while it is running (staff any time), and rate
 * limited — it must not work as an open code-execution proxy.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; problemId: string }> }
): Promise<NextResponse> {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id: codeathonId, problemId } = await params

  const rl = rateLimitSlidingWindow(`codeathon-run:${user.id}`, 20, 60_000)
  if (!rl.ok) return NextResponse.json({ error: 'Too many runs. Wait a moment.' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } })

  const body = (await request.json().catch(() => ({}))) as { code?: unknown; language?: unknown; input?: unknown }
  const code = typeof body.code === 'string' ? body.code : ''
  const language = typeof body.language === 'string' ? body.language.slice(0, 30) : ''
  const input = typeof body.input === 'string' ? body.input.slice(0, 100_000) : ''
  if (!code.trim() || !language) return NextResponse.json({ error: 'code and language are required' }, { status: 400 })
  if (code.length > 200_000) return NextResponse.json({ error: 'Code is too long' }, { status: 413 })

  const db = await getMongoDb()
  const codeathon = await db.collection('codeathons').findOne({ id: codeathonId })
  if (!codeathon) return NextResponse.json({ error: 'Codeathon not found' }, { status: 404 })
  if (!((codeathon.problems as Array<{ id?: string }>) || []).some((p) => p?.id === problemId)) {
    return NextResponse.json({ error: 'Problem not found' }, { status: 404 })
  }
  const staff = isTenantStaff(user, codeathon as unknown as Record<string, unknown>)
  if (!staff) {
    const w = codeathonWindow(codeathon)
    if (!w.started) return NextResponse.json({ error: 'Contest has not started yet' }, { status: 400 })
    if (w.ended) return NextResponse.json({ error: 'Contest has ended' }, { status: 400 })
    if (!(await isCodeathonParticipant(db, codeathon, user.id))) {
      return NextResponse.json({ error: 'Register for this codeathon first' }, { status: 403 })
    }
  }

  const startTime = Date.now()
  const result = await runCodeathonCode(code, language, input)
  const executionTime = Date.now() - startTime

  return NextResponse.json({
    output: result.output,
    error: result.error,
    exitCode: result.exitCode,
    executionTime,
  })
}
