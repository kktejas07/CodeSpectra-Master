import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { backendPost } from '@/lib/ai/backend'
import { resolveModel } from '@/lib/ai/get-user-model'

export const runtime = 'nodejs'

// Frontend proxy: browser → POST /api/learning/generate-course → backend /internal/ai/generate-course
const FALLBACK_PROVIDERS = [
  { provider: 'groq', model: 'openai/gpt-oss-120b', endpoint: 'https://api.groq.com/openai/v1' },
  { provider: 'gemini', model: 'gemini-2.0-flash', endpoint: undefined },
  { provider: 'openai', model: 'gpt-4o-mini', endpoint: undefined },
  { provider: 'openrouter', model: 'anthropic/claude-3.5-sonnet', endpoint: undefined },
  { provider: 'opencode', model: 'deepseek-v4-flash-free', endpoint: undefined },
]

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const user = gate.user

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { providerOverride, modelOverride, modelRole } = await resolveModel(user.id, 'grade_model')

  const payload = {
    technology: String(body.technology ?? ''),
    level: String(body.level ?? ''),
    goal: body.goal ? String(body.goal) : null,
    duration_hours: body.duration_hours != null ? Number(body.duration_hours) : 20,
    include_projects: body.includeProjects === true || body.include_projects === true,
    include_assessments: body.includeAssessments === true || body.include_assessments === true,
    include_certificate: body.includeCertificate === true || body.include_certificate === true,
  }

  const providers = [{ provider: providerOverride, model: modelOverride, modelRole }]
  for (const fb of FALLBACK_PROVIDERS) {
    if (!providers.find((p) => p.provider === fb.provider)) {
      providers.push({ provider: fb.provider, model: fb.model, modelRole })
    }
  }

  let lastError = ''
  for (const p of providers) {
    if (!p.provider || !p.model) continue
    try {
      const data = await backendPost<Record<string, unknown>>(
        '/internal/ai/generate-course',
        payload,
        { providerOverride: p.provider, modelOverride: p.model, modelRole: p.modelRole },
      )
      return NextResponse.json(data)
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e)
      console.error(`[generate-course] failed with ${p.provider}:`, lastError)
    }
  }

  return NextResponse.json(
    { error: `AI generation failed for all providers. Last error: ${lastError}` },
    { status: 502 },
  )
}