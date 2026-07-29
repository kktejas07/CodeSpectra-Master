import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/route-auth'
import { backendPost } from '@/lib/ai/backend'
import { resolveModel } from '@/lib/ai/get-user-model'
import { aiGeneratedProblems, newId, nowIso } from '@/lib/db/ai'
import { problems } from '@/lib/db/problems'

export const runtime = 'nodejs'

interface GenReq {
  role?: string
  difficulty?: 'easy' | 'medium' | 'hard'
  topics?: string[]
  language_hint?: string
  publish?: boolean
}

const FALLBACK_PROVIDERS = [
  { provider: 'groq', model: 'llama-3.3-70b-versatile', endpoint: 'https://api.groq.com/openai/v1' },
  { provider: 'gemini', model: 'gemini-2.0-flash', endpoint: undefined },
  { provider: 'openai', model: 'gpt-4o-mini', endpoint: undefined },
  { provider: 'openrouter', model: 'anthropic/claude-3.5-sonnet', endpoint: undefined },
  { provider: 'opencode', model: 'deepseek-v4-pro', endpoint: undefined },
]

export async function POST(req: NextRequest): Promise<NextResponse> {
  const gate = await requireAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const user = gate.user

  const { providerOverride, modelOverride, modelRole } = await resolveModel(user.id, 'grade_model')

  let body: GenReq
  try {
    body = (await req.json()) as GenReq
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  let lastError = ''
  const providers = [{ provider: providerOverride, model: modelOverride, modelRole }]
  for (const fb of FALLBACK_PROVIDERS) {
    if (!providers.find(p => p.provider === fb.provider)) {
      providers.push({ provider: fb.provider, model: fb.model, modelRole })
    }
  }

  let result: Record<string, unknown> | null = null
  for (const p of providers) {
    try {
      result = (await backendPost<Record<string, unknown>>(
        '/internal/ai/generate-problem',
        {
          role: body.role || 'Software Engineer',
          difficulty: body.difficulty || 'medium',
          topics: body.topics || [],
          language_hint: body.language_hint || 'python',
        },
        { providerOverride: p.provider, modelOverride: p.model, modelRole: p.modelRole },
      )) as Record<string, unknown>
      break
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e)
      console.error('[generate-problem] failed with', p.provider, ':', lastError)
    }
  }

  if (!result) {
    return NextResponse.json({ error: `AI generation failed for all providers. Last error: ${lastError}` }, { status: 502 })
  }

  const gens = await aiGeneratedProblems()
  let publishedProblemId: string | null = null

  if (body.publish && result && typeof result === 'object') {
    try {
      const probsCol = await problems()
      const baseSlug =
        (typeof result.slug === 'string' ? result.slug : '') ||
        (typeof result.title === 'string'
          ? result.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
          : `gen-${Date.now()}`)
      let slug = baseSlug
      let n = 1
      while (await probsCol.findOne({ slug })) {
        slug = `${baseSlug}-${++n}`
      }
      const id = newId()
      const tcRaw = Array.isArray(result.test_cases) ? result.test_cases : []
      const test_cases = tcRaw.map((tc) => {
        const t = tc as Record<string, unknown>
        return {
          id: newId(),
          stdin: String(t.stdin ?? ''),
          expected_stdout: String(t.expected_stdout ?? ''),
          is_sample: Boolean(t.is_sample ?? false),
        }
      })
      const doc = {
        id,
        slug,
        title: String(result.title ?? slug),
        difficulty: (['easy', 'medium', 'hard'].includes(String(result.difficulty))
          ? String(result.difficulty)
          : 'medium') as 'easy' | 'medium' | 'hard',
        topics: Array.isArray(result.topics) ? result.topics.map(String) : [],
        statement_md: String(result.statement_md ?? ''),
        input_format: String(result.input_format ?? ''),
        output_format: String(result.output_format ?? ''),
        constraints: String(result.constraints ?? ''),
        example_explanation: String(result.example_explanation ?? ''),
        starter_code: (result.starter_code && typeof result.starter_code === 'object'
          ? (result.starter_code as Record<string, string>)
          : {}) as Record<string, string>,
        test_cases,
        time_limit_ms: Number(result.time_limit_ms ?? 4000),
        is_premium: false,
        created_by: user.id,
        created_at: nowIso(),
      }
      await probsCol.insertOne(doc as unknown as never)
      publishedProblemId = id
    } catch (e) {
      console.error('[generate-problem] publish failed', e)
    }
  }

  await gens.insertOne({
    id: newId(),
    user_id: user.id,
    payload: result,
    published_problem_id: publishedProblemId,
    created_at: nowIso(),
  })

  return NextResponse.json({ problem: result, published_problem_id: publishedProblemId })
}
