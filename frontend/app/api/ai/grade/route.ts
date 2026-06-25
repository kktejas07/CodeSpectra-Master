import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { backendPost } from '@/lib/ai/backend'
import { aiGrades, newId, nowIso } from '@/lib/db/ai'

export const runtime = 'nodejs'

interface GradeReq {
  code: string
  language?: string
  problem_title?: string
  problem_slug?: string
  submission_id?: string
  rubric?: Record<string, number>
  passed_tests?: number
  total_tests?: number
}

const DEFAULT_RUBRIC: Record<string, number> = {
  correctness: 40,
  efficiency: 20,
  readability: 15,
  edge_cases: 15,
  style: 10,
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: GradeReq
  try {
    body = (await req.json()) as GradeReq
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!body.code) return NextResponse.json({ error: 'code required' }, { status: 400 })

  const rubric = body.rubric && Object.keys(body.rubric).length > 0 ? body.rubric : DEFAULT_RUBRIC

  const result = await backendPost<Record<string, unknown>>('/internal/ai/grade', {
    code: body.code.slice(0, 10_000),
    language: body.language || 'python',
    problem_title: body.problem_title || null,
    rubric,
    passed_tests: body.passed_tests ?? null,
    total_tests: body.total_tests ?? null,
  })

  const gradesCol = await aiGrades()
  const doc = {
    id: newId(),
    user_id: user.id,
    submission_id: body.submission_id,
    problem_slug: body.problem_slug,
    rubric,
    result,
    created_at: nowIso(),
  }
  await gradesCol.insertOne(doc)
  return NextResponse.json({ ...result, grade_id: doc.id })
}
