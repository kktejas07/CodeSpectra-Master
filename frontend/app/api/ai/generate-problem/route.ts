import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/route-auth'
import { generateCodingProblem, logGeneratedProblem, saveGeneratedProblem, type GenerateProblemInput } from '@/lib/services/problems'

export const runtime = 'nodejs'

interface GenReq extends GenerateProblemInput {
  publish?: boolean
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const gate = await requireAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const user = gate.user

  let body: GenReq
  try {
    body = (await req.json()) as GenReq
  } catch {
    return NextResponse.json({ error: 'Invalid JSON', code: 'invalid_json' }, { status: 400 })
  }

  // Generator + provider fallback + save: lib/services/problems (shared with the admin agent).
  const result = await generateCodingProblem(user.id, body)
  if (!result) {
    // Provider errors stay in the server log (they can carry upstream details).
    return NextResponse.json({ error: 'AI generation failed. Please try again.' }, { status: 502 })
  }

  let publishedProblemId: string | null = null
  let publishedProblemSlug: string | null = null

  if (body.publish && result && typeof result === 'object') {
    try {
      const saved = await saveGeneratedProblem(user, result, { mode: 'legacy' })
      publishedProblemId = saved.id
      publishedProblemSlug = saved.slug
    } catch (e) {
      console.error('[generate-problem] publish failed', e)
    }
  }

  await logGeneratedProblem(user.id, result, publishedProblemId)

  return NextResponse.json({ problem: result, published_problem_id: publishedProblemId, published_problem_slug: publishedProblemSlug })
}
