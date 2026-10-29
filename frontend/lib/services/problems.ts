/**
 * AI coding-problem generation. Extracted from POST /api/ai/generate-problem
 * — the route and the admin agent (create_problem / create_hackathon) use the
 * same generator, provider fallback, test-case shape and generation log.
 */
import 'server-only'
import { backendComplete, backendPost } from '@/lib/ai/backend'
import { estimateTokens, reportAiUsage } from '@/lib/ai/usage-meter'
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
      const out = (await backendPost<Record<string, unknown>>(
        '/internal/ai/generate-problem',
        {
          role: body.role || 'Software Engineer',
          difficulty: body.difficulty || 'medium',
          topics: body.topics || [],
          language_hint: body.language_hint || 'python',
        },
        { providerOverride: p.provider, modelOverride: p.model, modelRole: p.modelRole },
      )) as Record<string, unknown>
      // AGT-002: meter generation (backendPost reports no usage — estimate from sizes).
      const usage = (out?.usage && typeof out.usage === 'object' ? out.usage : {}) as Record<string, unknown>
      reportAiUsage({
        provider: String(p.provider || 'unknown'),
        model: String(p.model || 'unknown'),
        inputTokens: Number(usage.input_tokens ?? usage.prompt_tokens) || 600,
        outputTokens: Number(usage.output_tokens ?? usage.completion_tokens) || estimateTokens(JSON.stringify(out ?? {})),
        feature: 'generate-problem',
      })
      return out
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
   * 'published' = pipeline: verified content that goes live immediately.
   */
  mode: 'legacy' | 'draft' | 'hackathon' | 'published'
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
    doc.is_published = opts.mode === 'hackathon' || opts.mode === 'published'
    doc.visibility = opts.mode === 'hackathon' ? 'hackathon_only' : 'public'
    doc.updated_at = nowIso()
    doc.source = 'ai_agent'
    // Owner tenant: a tenant admin's problems — and a superadmin's while scoped to
    // one organisation (AGT-006) — belong to that tenant, not the platform.
    if (user.tenantId) doc.tenant_id = user.tenantId
    if (result.tests_verified === false) doc.tests_verified = false
  }
  await probsCol.insertOne(doc as unknown as never)
  // RAG-003: copilot-created problems are searchable within a minute (not after the nightly sweep).
  const { knowledgeOnLibraryChange } = await import('@/lib/rag/hooks')
  knowledgeOnLibraryChange('problem', id)
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

// ─── Hidden-test verification (AGT-025) ──────────────────────────────────────

export interface TestVerification {
  /** true = a reference solution passed every kept test; false = it could not be verified; null = no runner. */
  verified: boolean | null
  language: string | null
  total: number
  passed: number
  dropped: { stdin: string; expected: string; actual: string }[]
  note: string
}

type RunFn = (o: { language: string; source: string; stdin: string }) => Promise<{ ok: boolean; stdout: string }>

const norm = (s: string) => s.replace(/\r\n/g, '\n').trim().split('\n').map((l) => l.trimEnd()).join('\n')

/**
 * Pure core: run a reference solution on every test. If it passes all SAMPLE
 * tests, hidden tests it disagrees with are wrong expectations → dropped. If it
 * fails a sample, the reference itself is suspect → keep tests, mark unverified.
 */
export async function checkTestsWithReference(
  tests: { stdin: string; expected_stdout: string; is_sample: boolean }[],
  reference: { language: string; code: string } | null,
  run: RunFn,
): Promise<{ keep: boolean[]; report: TestVerification }> {
  const keep = tests.map(() => true)
  if (!reference?.code || !tests.length) {
    return { keep, report: { verified: false, language: reference?.language ?? null, total: tests.length, passed: 0, dropped: [], note: 'No reference solution — hidden tests were not checked.' } }
  }
  const outcomes: { pass: boolean; actual: string }[] = []
  for (const t of tests) {
    try {
      const r = await run({ language: reference.language, source: reference.code, stdin: t.stdin })
      outcomes.push({ pass: r.ok && norm(r.stdout) === norm(t.expected_stdout), actual: r.stdout.slice(0, 200) })
    } catch {
      return { keep, report: { verified: null, language: reference.language, total: tests.length, passed: 0, dropped: [], note: 'The code runner is unavailable — hidden tests were not checked.' } }
    }
  }
  const sampleFail = tests.some((t, i) => t.is_sample && !outcomes[i].pass)
  const passed = outcomes.filter((o) => o.pass).length
  if (sampleFail) {
    return { keep, report: { verified: false, language: reference.language, total: tests.length, passed, dropped: [], note: 'The reference solution failed a sample test, so the tests could not be verified. Review them before publishing.' } }
  }
  const dropped: TestVerification['dropped'] = []
  tests.forEach((t, i) => {
    if (!outcomes[i].pass) {
      keep[i] = false
      dropped.push({ stdin: t.stdin.slice(0, 200), expected: t.expected_stdout.slice(0, 200), actual: outcomes[i].actual })
    }
  })
  const kept = keep.filter(Boolean).length
  return {
    keep,
    report: {
      verified: kept > 0,
      language: reference.language,
      total: tests.length,
      passed,
      dropped,
      note: dropped.length ? `${dropped.length} hidden test${dropped.length === 1 ? '' : 's'} had a wrong expected output and ${dropped.length === 1 ? 'was' : 'were'} removed.` : 'Every test passed with a reference solution.',
    },
  }
}

/** Ask the model for a reference solution (Python) to the generated statement. */
async function referenceSolution(result: Record<string, unknown>): Promise<{ language: string; code: string } | null> {
  const tests = Array.isArray(result.test_cases) ? (result.test_cases as Record<string, unknown>[]) : []
  const samples = tests.filter((t) => t.is_sample).slice(0, 3)
  const res = await backendComplete({
    systemMessage: 'You write correct, simple reference solutions for programming problems. Read stdin, write stdout. Return ONLY JSON: {"language":"python","code":"..."}',
    userMessage: `Problem:\n${String(result.statement_md ?? '').slice(0, 6000)}\n\nInput format: ${String(result.input_format ?? '').slice(0, 1000)}\nOutput format: ${String(result.output_format ?? '').slice(0, 1000)}\n\nSample tests:\n${JSON.stringify(samples.map((t) => ({ stdin: t.stdin, expected_stdout: t.expected_stdout })))}`,
    responseFormat: 'json',
    modelRole: 'reasoning',
    feature: 'generate-problem-reference',
    cache: false,
  }).catch(() => null)
  const j = (res?.ok && res.json && typeof res.json === 'object' ? res.json : null) as Record<string, unknown> | null
  const code = typeof j?.code === 'string' ? j.code : ''
  return code.trim() ? { language: typeof j?.language === 'string' ? j.language : 'python', code } : null
}

/**
 * Generate-then-verify: run a reference solution against every generated test
 * (Piston / local runner) and drop hidden tests with a wrong expected output.
 * Returns the (possibly filtered) result + a report for the preview.
 */
export async function verifyGeneratedProblem(result: Record<string, unknown>): Promise<{ result: Record<string, unknown>; verification: TestVerification }> {
  const tests = (Array.isArray(result.test_cases) ? result.test_cases : []).map((t) => {
    const o = (t && typeof t === 'object' ? t : {}) as Record<string, unknown>
    return { raw: o, stdin: String(o.stdin ?? ''), expected_stdout: String(o.expected_stdout ?? ''), is_sample: Boolean(o.is_sample ?? false) }
  })
  let reference: { language: string; code: string } | null = null
  try { reference = await referenceSolution(result) } catch { reference = null }
  const { executeOnce } = await import('@/lib/piston')
  const run: RunFn = async (o) => {
    const r = await executeOnce({ language: o.language, source: o.source, stdin: o.stdin })
    return { ok: r.run.code === 0, stdout: r.run.stdout || '' }
  }
  const { keep, report } = await checkTestsWithReference(tests, reference, run)
  const filtered = tests.filter((_, i) => keep[i]).map((t) => t.raw)
  return { result: { ...result, test_cases: filtered, tests_verified: report.verified === true }, verification: report }
}
