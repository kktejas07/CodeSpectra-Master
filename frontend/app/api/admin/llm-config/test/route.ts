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
        if ((secrets as any).openrouter_api_key && !isMaskedSecret((secrets as any).openrouter_api_key)) body.api_key = (secrets as any).openrouter_api_key
        else if (secrets.openai_api_key && !isMaskedSecret(secrets.openai_api_key)) body.api_key = secrets.openai_api_key
      } else if (body.provider === 'gemini') {
        if (secrets.gemini_api_key && !isMaskedSecret(secrets.gemini_api_key)) body.api_key = secrets.gemini_api_key
      } else if (body.provider === 'anthropic') {
        if (secrets.anthropic_api_key && !isMaskedSecret(secrets.anthropic_api_key)) body.api_key = secrets.anthropic_api_key
      }
    }
  }

  if (!body.api_key || isMaskedSecret(body.api_key) || body.api_key.trim() === '') {
    return NextResponse.json({
      ok: false,
      message: `No API key configured for ${body.provider.toUpperCase()}. Please enter your clean unmasked API key in the field above (for OpenCode/OpenRouter, enter your OpenRouter API key starting with sk-or-v1-).`
    })
  }

  if (body.endpoint && body.endpoint.includes('opencode.june07.com')) {
    body.endpoint = 'https://openrouter.ai/api/v1'
  }

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (body.api_key) {
      if (body.provider === 'opencode' || body.provider === 'omnirouter' || body.provider === 'openai' || body.provider === 'groq' || body.provider === 'deepseek' || body.provider === 'nvidia') {
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
      let msg = `API error ${res.status}: ${text.slice(0, 200)}`
      if (res.status === 401 && (text.includes('No cookie auth credentials found') || text.includes('User not found') || text.includes('Invalid API key') || text.includes('Incorrect API key') || text.includes('Unauthorized'))) {
        msg = `API error 401: Missing or invalid API key for ${body.provider.toUpperCase()}. Please enter a valid API key above (for OpenCode/OpenRouter, enter your OpenRouter key starting with sk-or-v1- from openrouter.ai).`
      }
      return NextResponse.json({ ok: false, message: msg })
    }

    return NextResponse.json({ ok: true, message: 'Connection successful' })
  } catch (e: any) {
    const reason = e?.cause?.message || e?.cause?.code || e?.message || 'Connection failed'
    const detailed = reason.includes('ENOTFOUND') || reason.includes('EAI_AGAIN') || reason.includes('fetch failed')
      ? `Cannot reach endpoint "${body.endpoint}". Check that the API Endpoint URL is valid and reachable (${reason}).`
      : reason
    return NextResponse.json({ ok: false, message: detailed })
  }
}
