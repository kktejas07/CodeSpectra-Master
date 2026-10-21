import { NextResponse, type NextRequest } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { generateBankQuestions, type GenerateRequest } from '@/lib/question-bank-generate'

export const runtime = 'nodejs'

const MAX_PER_RUN = 1000

export async function POST(request: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  try {
    let raw: Record<string, unknown>
    try {
      raw = (await request.json()) as Record<string, unknown>
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : undefined)
    const difficulty = ['Easy', 'Medium', 'Hard', 'mixed'].includes(String(raw.difficulty)) ? (raw.difficulty as GenerateRequest['difficulty']) : undefined
    // Only plain generator fields come from the client (no domain / extra prompt rules).
    const body: GenerateRequest = {
      branch: str(raw.branch, 60),
      degree_type: str(raw.degree_type, 40),
      subject: str(raw.subject, 200),
      difficulty,
      types: Array.isArray(raw.types) ? raw.types.filter((t): t is string => typeof t === 'string').slice(0, 30) : undefined,
      count: Number(raw.count) || 1,
    }
    if (!body.branch && !body.subject) {
      return NextResponse.json({ error: 'Provide at least a branch or subject' }, { status: 400 })
    }

    const r = await generateBankQuestions(body, { maxCount: MAX_PER_RUN })
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
    return NextResponse.json({ inserted: r.inserted.length, requested: r.requested, skipped: r.skipped, errors: r.errors })
  } catch (e) {
    console.error('[question-bank/generate] error:', e)
    return NextResponse.json({ error: 'Failed to generate questions' }, { status: 500 })
  }
}
