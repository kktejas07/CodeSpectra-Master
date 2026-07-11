import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { isMaskedSecret } from '@/lib/server-secrets-cache'
import { type LLMConfig } from '@/lib/llm-config'

export async function POST(request: Request) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  let body: LLMConfig
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, message: 'Invalid JSON' })
  }

  if (!body.endpoint) {
    return NextResponse.json({ ok: false, message: 'Endpoint URL is required to fetch models' })
  }

  if (body.endpoint.includes('opencode.june07.com')) {
    body.endpoint = 'https://openrouter.ai/api/v1'
  }

  if (!body.api_key || isMaskedSecret(body.api_key)) {
    const db = await getMongoDb()
    const doc = await db.collection('platform_settings').findOne({ key: 'llm' })
    const stored = (doc?.value as LLMConfig | undefined)?.api_key
    if (stored && !isMaskedSecret(stored)) {
      body.api_key = stored
    } else {
      const { readServerSecrets } = await import('@/lib/server-secrets-cache')
      const secrets = await readServerSecrets()
      if (body.provider === 'openai' || body.provider === 'opencode' || body.provider === 'omnirouter') {
        if (secrets.openai_api_key && !isMaskedSecret(secrets.openai_api_key)) body.api_key = secrets.openai_api_key
      } else if (body.provider === 'gemini') {
        if (secrets.gemini_api_key && !isMaskedSecret(secrets.gemini_api_key)) body.api_key = secrets.gemini_api_key
      } else if (body.provider === 'anthropic') {
        if (secrets.anthropic_api_key && !isMaskedSecret(secrets.anthropic_api_key)) body.api_key = secrets.anthropic_api_key
      }
    }
  }

  const ep = body.endpoint.replace(/\/+$/, '')
  try {
    let res: Response
    if (body.provider === 'gemini') {
      res = await fetch(`${ep}/models?key=${body.api_key || ''}`, { signal: AbortSignal.timeout(10000) })
    } else if (body.provider === 'anthropic') {
      res = await fetch(`${ep}/v1/models`, {
        headers: {
          'x-api-key': body.api_key || '',
          'anthropic-version': '2023-06-01',
        },
        signal: AbortSignal.timeout(10000),
      })
    } else {
      res = await fetch(`${ep}/models`, {
        headers: body.api_key && !isMaskedSecret(body.api_key) ? { Authorization: `Bearer ${body.api_key}` } : {},
        signal: AbortSignal.timeout(10000),
      })
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return NextResponse.json({ ok: false, message: `Failed to fetch models (${res.status}): ${text.slice(0, 150)}` })
    }

    const data = await res.json()
    const raw = data.models || data.data || []
    const ids = Array.isArray(raw) ? raw.map((m: any) => (typeof m === 'string' ? m : m.id || m.name)).filter(Boolean) : []
    return NextResponse.json({ ok: true, models: ids })
  } catch (e: any) {
    const reason = e?.cause?.message || e?.cause?.code || e?.message || 'Connection failed'
    const detailed = reason.includes('ENOTFOUND') || reason.includes('EAI_AGAIN') || reason.includes('fetch failed')
      ? `Cannot reach endpoint "${body.endpoint}". Check that the API Endpoint URL is valid and reachable (${reason}).`
      : reason
    return NextResponse.json({ ok: false, message: detailed })
  }
}
