import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { isMaskedSecret } from '@/lib/server-secrets-cache'
import { LLM_PROVIDERS, type LLMConfig } from '@/lib/llm-config'

export async function POST(request: Request) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  let body: LLMConfig
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, message: 'Invalid JSON' })
  }

  if (!body.provider || !body.model) {
    return NextResponse.json({ ok: false, message: 'Provider and model are required' })
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

  if (body.api_key && isMaskedSecret(body.api_key)) {
    return NextResponse.json({ ok: false, message: 'No valid unmasked API key found. Please enter your clean API key above.' })
  }

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (body.api_key) {
      if (body.provider === 'opencode' || body.provider === 'omnirouter' || body.provider === 'openai') {
        headers['Authorization'] = `Bearer ${body.api_key}`
      } else if (body.provider === 'anthropic') {
        headers['x-api-key'] = body.api_key
        headers['anthropic-version'] = '2023-06-01'
      } else if (body.provider === 'gemini') {
        // Gemini doesn't need auth header; key is in URL
      }
    }

    const isGemini = body.provider === 'gemini'
    const url = isGemini
      ? `${body.endpoint.replace(/\/+$/, '')}/models/${body.model}:streamGenerateContent?key=${body.api_key}`
      : `${body.endpoint.replace(/\/+$/, '')}/chat/completions`

    const payload = isGemini
      ? { contents: [{ parts: [{ text: 'Say "ok" and nothing else.' }] }] }
      : { model: body.model, messages: [{ role: 'user', content: 'Say "ok" and nothing else.' }], max_tokens: 10 }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return NextResponse.json({ ok: false, message: `API error ${res.status}: ${text.slice(0, 200)}` })
    }

    return NextResponse.json({ ok: true, message: 'Connection successful' })
  } catch (e) {
    return NextResponse.json({ ok: false, message: (e as Error).message })
  }
}
