/** Per-provider status + skeleton probe: which attempt produces a placeholder
 *  skeleton (tests padded with "# Test case N") vs a real problem? */
import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })

async function main() {
  const { backendPost } = await import('@/lib/ai/backend')

  const body = {
    role: 'Kubernetes engineer',
    difficulty: 'easy',
    topics: ['kubectl', 'pods'],
    language_hint: 'python',
    industry: 'Cloud & DevOps',
    tech_stack: 'Kubernetes',
    level: 'Beginner',
  }

  const attempts: Array<{ label: string; provider?: string; model?: string; endpoint?: string }> = [
    { label: 'default (no override)' },
    { label: 'groq gpt-oss-120b', provider: 'groq', model: 'openai/gpt-oss-120b', endpoint: 'https://api.groq.com/openai/v1' },
    { label: 'groq llama-3.3-70b', provider: 'groq', model: 'llama-3.3-70b-versatile', endpoint: 'https://api.groq.com/openai/v1' },
    { label: 'gemini 2.0-flash', provider: 'gemini', model: 'gemini-2.0-flash' },
    { label: 'openai gpt-4o-mini', provider: 'openai', model: 'gpt-4o-mini' },
    { label: 'opencode deepseek-v4-flash-free', provider: 'opencode', model: 'deepseek-v4-flash-free', endpoint: 'https://api.openai.com/v1' },
  ]

  for (const a of attempts) {
    const t0 = Date.now()
    try {
      const out = await backendPost<Record<string, unknown>>(
        '/internal/ai/generate-problem',
        body,
        {
          providerOverride: a.provider,
          modelOverride: a.model,
          endpointOverride: a.endpoint,
          modelRole: 'reasoning',
        },
      )
      const title = String(out?.title || '').slice(0, 40)
      const tests = (out?.test_cases || []) as Array<{ stdin?: unknown }>
      const placeholder = tests.some(t => String(t?.stdin || '').startsWith('# Test case'))
      const solLen = String(out?.solution_code || '').length
      console.log(`[ok ${((Date.now() - t0) / 1000).toFixed(0)}s] ${a.label} → title="${title}" tests=${tests.length} placeholder=${placeholder} solLen=${solLen}`)
    } catch (e) {
      console.log(`[fail ${((Date.now() - t0) / 1000).toFixed(0)}s] ${a.label} → ${(e as Error).message?.slice(0, 160)}`)
    }
  }
}

main().catch(e => { console.log('FATAL', e); process.exit(1) })
