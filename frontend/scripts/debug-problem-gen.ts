/** One-shot: generate one problem, re-run the reference solution on the sample
 *  tests, and print actual-vs-expected so we can see WHY the sandbox gate
 *  rejects. (referenceSolution in lib/services/problems.ts is private, so the
 *  identical LLM call is duplicated here.) */
import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })

async function main() {
  const { buildDomainPracticeSpec } = await import('@/lib/practice-content/domain-practice')
  const { systemPracticeUser } = await import('@/lib/practice-content/problems-generate')
  const { generateCodingProblem, verifyGeneratedProblem, shapeGeneratedProblem } = await import('@/lib/services/problems')
  const { backendComplete } = await import('@/lib/ai/backend')
  const { executeOnce } = await import('@/lib/piston')

  const [industryArg, techStackArg, levelArg] = process.argv.slice(2)
  const spec = buildDomainPracticeSpec(industryArg as never, techStackArg, levelArg as never)
  const user = systemPracticeUser()

  console.log(`[debug] generating one: ${spec.title} (${spec.difficulty})`)
  const raw = await generateCodingProblem(user.id, {
    difficulty: spec.difficulty,
    topics: spec.topics,
    role: spec.role,
    language_hint: 'python',
    industry: spec.industryLabel,
    tech_stack: spec.techStack,
    level: spec.level,
  })
  if (!raw) {
    console.error('generation returned null (every provider failed)')
    process.exit(1)
  }
  const shaped = shapeGeneratedProblem(raw)
  const tests = (raw.test_cases || []) as Array<{ stdin?: unknown; expected_stdout?: unknown; is_sample?: boolean }>
  console.log(`[debug] "${shaped.title}" (${raw.difficulty}), ${tests.length} tests (${tests.filter(t => t.is_sample).length} sample)`)

  const { result, verification } = await verifyGeneratedProblem(raw)
  console.log('[debug] gate → verified =', verification.verified, '| note:', verification.note)

  // Duplicate referenceSolution's LLM call, then re-run it on the samples to dump the diff.
  const samples = tests.filter(t => t.is_sample).slice(0, 3)
  const res = await backendComplete({
    systemMessage: 'You write correct, simple reference solutions for programming problems. Read stdin, write stdout. Return ONLY JSON: {"language":"python","code":"..."}',
    userMessage: `Problem:\n${String(raw.statement_md ?? '').slice(0, 6000)}\n\nInput format: ${String(raw.input_format ?? '').slice(0, 1000)}\nOutput format: ${String(raw.output_format ?? '').slice(0, 1000)}\n\nSample tests:\n${JSON.stringify(samples.map(t => ({ stdin: t.stdin, expected_stdout: t.expected_stdout })))}`,
    responseFormat: 'json',
    modelRole: 'reasoning',
    feature: 'generate-problem-reference',
    cache: false,
  })
  const j = (res?.ok && res.json && typeof res.json === 'object' ? res.json : null) as Record<string, unknown> | null
  const code = String(j?.code ?? '').trim()
  const language = typeof j?.language === 'string' ? j.language : 'python'
  console.log(`[debug] ref language=${language}, code length=${code.length}, LLM ok=${res?.ok}`)
  if (!code) {
    console.log('[debug] no reference code returned. raw LLM:', String(res?.raw || res?.text || '').slice(0, 400))
    return
  }
  console.log('--- reference code (first 30 lines) ---')
  console.log(code.split('\n').slice(0, 30).join('\n'))
  const norm = (x: unknown) => String(x ?? '').replace(/\s+/g, ' ').trim()
  for (const s of samples) {
    const r = await executeOnce({ language, source: code, stdin: String(s.stdin ?? '') }).catch(e => ({ run: { code: -1, stdout: String(e) } }))
    const ok = r.run.code === 0 && norm(r.run.stdout) === norm(s.expected_stdout)
    console.log(`\n[debug] sample ${ok ? 'PASS' : 'FAIL'} (exit ${r.run.code})`)
    console.log('  stdin:    ' + JSON.stringify(String(s.stdin ?? '')))
    console.log('  expected: ' + JSON.stringify(String(s.expected_stdout ?? '')))
    console.log('  actual:   ' + JSON.stringify(String(r.run.stdout ?? '').slice(0, 200)))
  }
}

main().catch(e => { console.error('[debug] fatal:', e); process.exit(1) })
