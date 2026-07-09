import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
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
