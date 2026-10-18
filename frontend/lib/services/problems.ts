/**
 * AI coding-problem generation. Extracted from POST /api/ai/generate-problem
 * — the route and the admin agent (create_problem / create_hackathon) use the
 * same generator, provider fallback, test-case shape and generation log.
 */
import 'server-only'
import { backendPost } from '@/lib/ai/backend'
import { resolveModel } from '@/lib/ai/get-user-model'
import { aiGeneratedProblems, newId, nowIso } from '@/lib/db/ai'
import { problems } from '@/lib/db/problems'
import type { ServiceUser } from './result'

export interface GenerateProblemInput {
  role?: string
  difficulty?: 'easy' | 'medium' | 'hard'
  topics?: string[]
  language_hint?: string
}

const FALLBACK_PROVIDERS = [
  { provider: 'groq', model: 'llama-3.3-70b-versatile', endpoint: 'https://api.groq.com/openai/v1' },
  { provider: 'gemini', model: 'gemini-2.0-flash', endpoint: undefined },
  { provider: 'openai', model: 'gpt-4o-mini', endpoint: undefined },
  { provider: 'openrouter', model: 'anthropic/claude-3.5-sonnet', endpoint: undefined },
  { provider: 'opencode', model: 'deepseek-v4-flash-free', endpoint: undefined },
]

/** Run the generator with provider fallback. null = every provider failed. No DB writes. */
export async function generateCodingProblem(userId: string, body: GenerateProblemInput): Promise<Record<string, unknown> | null> {
  const { providerOverride, modelOverride, modelRole } = await resolveModel(userId, 'grade_model')
  const providers = [{ provider: providerOverride, model: modelOverride, modelRole }]
  for (const fb of FALLBACK_PROVIDERS) {
    if (!providers.find(p => p.provider === fb.provider)) {
      providers.push({ provider: fb.provider, model: fb.model, modelRole })
    }
  }

  for (const p of providers) {
    try {
      return (await backendPost<Record<string, unknown>>(
        '/internal/ai/generate-problem',
        {
          role: body.role || 'Software Engineer',
          difficulty: body.difficulty || 'medium',
          topics: body.topics || [],
          language_hint: body.language_hint || 'python',
        },
        { providerOverride: p.provider, modelOverride: p.model, modelRole: p.modelRole },
      )) as Record<string, unknown>
    } catch (e) {
      const lastError = e instanceof Error ? e.message : String(e)
      console.error('[generate-problem] failed with', p.provider, ':', lastError)
    }
  }
  return null
}

export interface GeneratedTestCase { id: string; stdin: string; expected_stdout: string; is_sample: boolean }

/** Title / slug base / test cases exactly as the generator route derives them. */
export function shapeGeneratedProblem(result: Record<string, unknown>) {
  const rawTitle = String(result.title ?? '').trim()
  const statement = String(result.statement_md ?? '').trim()
  const topics = Array.isArray(result.topics) ? result.topics.map(String).filter(Boolean) : []
  const title = rawTitle
    || statement.split('\n').filter(l => l.trim()).map(l => l.trim()).shift()?.slice(0, 80) || ''
    || (topics.length ? `${topics.join(', ')} Challenge` : `${result.difficulty || 'Medium'} Coding Challenge`)
  const baseSlug =
    (typeof result.slug === 'string' ? result.slug.trim() : '') ||
    title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const tcRaw = Array.isArray(result.test_cases) ? result.test_cases : []
  const test_cases: GeneratedTestCase[] = tcRaw.map((tc) => {
    const t = tc as Record<string, unknown>
    return {
      id: newId(),
      stdin: String(t.stdin ?? ''),
      expected_stdout: String(t.expected_stdout ?? ''),
      is_sample: Boolean(t.is_sample ?? false),
    }
  })
  const difficulty = (['easy', 'medium', 'hard'].includes(String(result.difficulty))
    ? String(result.difficulty)
    : 'medium') as 'easy' | 'medium' | 'hard'
  return { title, baseSlug, test_cases, difficulty }
}

export interface SaveProblemOptions {
  /**
   * 'legacy' = what POST /api/ai/generate-problem has always written on publish.
   * 'draft'  = agent: unpublished, owned by the caller's tenant.
   * 'hackathon' = agent: attached to an event (hackathon_only), owned by the caller's tenant.
   */
  mode: 'legacy' | 'draft' | 'hackathon'
}

/** Insert a generated problem. Returns its id + slug. */
export async function saveGeneratedProblem(
  user: ServiceUser,
  result: Record<string, unknown>,
  opts: SaveProblemOptions,
): Promise<{ id: string; slug: string }> {
  const probsCol = await problems()
  const { title, baseSlug, test_cases, difficulty } = shapeGeneratedProblem(result)
  let slug = baseSlug
  let n = 1
  while (await probsCol.findOne({ slug })) {
    slug = `${baseSlug}-${++n}`
  }
  const id = newId()
  const doc: Record<string, unknown> = {
    id,
    slug,
    title,
    difficulty,
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
  if (opts.mode !== 'legacy') {
    doc.is_published = opts.mode === 'hackathon'
    doc.visibility = opts.mode === 'hackathon' ? 'hackathon_only' : 'public'
    doc.updated_at = nowIso()
    doc.source = 'ai_agent'
    // Owner tenant: a tenant admin's problems stay editable by that tenant only.
    if (user.role === 'tenant_admin' && user.tenantId) doc.tenant_id = user.tenantId
  }
  await probsCol.insertOne(doc as unknown as never)
  return { id, slug }
}

/** Generation log (ai_generated_problems), as the route has always written. */
export async function logGeneratedProblem(userId: string, result: Record<string, unknown>, publishedProblemId: string | null): Promise<void> {
  const gens = await aiGeneratedProblems()
  await gens.insertOne({
    id: newId(),
    user_id: userId,
    payload: result,
    published_problem_id: publishedProblemId,
    created_at: nowIso(),
  })
}
