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

  // The UI sends the masked key (contains bullet chars) when the admin hasn't
  // retyped it. Fall back to the stored key so we never put bullets into an
  // HTTP header (which throws "invalid character 8226").
  if (!body.api_key || isMaskedSecret(body.api_key)) {
    const db = await getMongoDb()
    const doc = await db.collection('platform_settings').findOne({ key: 'llm' })
    const stored = (doc?.value as LLMConfig | undefined)?.api_key
    if (stored) body.api_key = stored
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
