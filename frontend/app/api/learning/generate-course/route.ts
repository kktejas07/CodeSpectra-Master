import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { backendPost } from '@/lib/ai/backend'
import { resolveModel } from '@/lib/ai/get-user-model'
import { PROVIDER_FALLBACK_CHAIN } from '@/lib/ai/provider-fallback'

export const runtime = 'nodejs'

// Frontend proxy: browser → POST /api/learning/generate-course → backend /internal/ai/generate-course
// ponytail: use the canonical chain from provider-fallback.ts instead of a stale inline copy.

export async function POST(req: NextRequest) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON', code: 'invalid_json' }, { status: 400 })
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

  const providers = [{ provider: providerOverride, model: modelOverride, endpoint: undefined as string | undefined, modelRole }]
  for (const fb of PROVIDER_FALLBACK_CHAIN) {
    if (!providers.find((p) => p.provider === fb.provider)) {
      providers.push({ provider: fb.provider, model: fb.model, endpoint: fb.endpoint, modelRole })
    }
  }

  let lastError = ''
  for (const p of providers) {
    if (!p.provider || !p.model) continue
    try {
      const data = await backendPost<Record<string, unknown>>(
        '/internal/ai/generate-course',
        payload,
        { providerOverride: p.provider, modelOverride: p.model, modelRole: p.modelRole as 'reasoning' | 'fast' | undefined, endpointOverride: p.endpoint },
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