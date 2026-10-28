/**
 * Frontend proxy: browser → POST /api/cad/generate-text-to-cad → backend /internal/ai/cad/generate-text-to-cad
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { backendPost } from '@/lib/ai/backend'
import { resolveModel } from '@/lib/ai/get-user-model'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON', code: 'invalid_json' }, { status: 400 })
  }

  const prompt = String(body.prompt ?? '').trim().slice(0, 4000)
  if (!prompt) return NextResponse.json({ error: 'prompt required' }, { status: 400 })

  const payload = {
    prompt,
    region_standard: String(body.region_standard ?? 'ISO'),
    unit_system: String(body.unit_system ?? 'metric'),
    viva_required: body.viva_required === true,
  }

  const { providerOverride, modelOverride, modelRole } = await resolveModel(user.id, 'grade_model')

  try {
    const data = await backendPost<Record<string, unknown>>(
      '/internal/ai/cad/generate-text-to-cad',
      payload,
      { providerOverride, modelOverride, modelRole },
    )
    return NextResponse.json(data)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[cad-generate]', msg)
    return NextResponse.json({ error: 'CAD generation failed. Try again in a moment.' }, { status: 502 })
  }
}
