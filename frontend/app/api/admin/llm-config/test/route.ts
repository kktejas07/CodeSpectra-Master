import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { isMaskedSecret } from '@/lib/server-secrets-cache'
import { LLM_PROVIDERS, type LLMConfig } from '@/lib/llm-config'
import { isSafeUrl } from '@/lib/url-safety'

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
      if (body.provider === 'openrouter' || body.provider === 'omnirouter') {
        if ((secrets as any).openrouter_api_key && !isMaskedSecret((secrets as any).openrouter_api_key)) body.api_key = (secrets as any).openrouter_api_key
        else if (secrets.openai_api_key && !isMaskedSecret(secrets.openai_api_key)) body.api_key = secrets.openai_api_key
      } else if (body.provider === 'opencode') {
        if ((secrets as any).opencode_api_key && !isMaskedSecret((secrets as any).opencode_api_key)) body.api_key = (secrets as any).opencode_api_key
        else if ((secrets as any).openrouter_api_key && !isMaskedSecret((secrets as any).openrouter_api_key)) body.api_key = (secrets as any).openrouter_api_key
        else if (secrets.openai_api_key && !isMaskedSecret(secrets.openai_api_key)) body.api_key = secrets.openai_api_key
      } else if (body.provider === 'openai') {
        if (secrets.openai_api_key && !isMaskedSecret(secrets.openai_api_key)) body.api_key = secrets.openai_api_key
      } else if (body.provider === 'gemini') {
        if (secrets.gemini_api_key && !isMaskedSecret(secrets.gemini_api_key)) body.api_key = secrets.gemini_api_key
      } else if (body.provider === 'anthropic') {
        if (secrets.anthropic_api_key && !isMaskedSecret(secrets.anthropic_api_key)) body.api_key = secrets.anthropic_api_key
      }
    }
  }

  if (!body.api_key || isMaskedSecret(body.api_key) || body.api_key.trim() === '') {
    const hint = body.provider === 'openrouter' 
      ? 'Note: OpenRouter API keys MUST start with sk-or-v1-. Please create a key at https://openrouter.ai/keys'
      : body.provider === 'opencode'
      ? 'Note: Please create your key at https://opencode.ai/workspace/keys'
      : ''
    return NextResponse.json({
      ok: false,
      message: `No API key configured for ${(body.provider || '').toUpperCase()}. Please enter your clean unmasked API key in the field above. ${hint}`
    })
  }

  if (body.provider === 'opencode' && (!body.endpoint || body.endpoint.includes('openrouter.ai') || body.endpoint.includes('opencode.june07.com'))) {
    body.endpoint = 'https://opencode.ai/zen/v1'
  } else if (body.provider === 'openrouter' && (!body.endpoint || body.endpoint.includes('opencode.june07.com'))) {
    body.endpoint = 'https://openrouter.ai/api/v1'
  }

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (body.api_key) {
      if (body.provider === 'opencode' || body.provider === 'openrouter' || body.provider === 'omnirouter' || body.provider === 'openai' || body.provider === 'groq' || body.provider === 'deepseek' || body.provider === 'nvidia') {
        headers['Authorization'] = `Bearer ${body.api_key}`
      } else if (body.provider === 'anthropic') {
        headers['x-api-key'] = body.api_key
        headers['anthropic-version'] = '2023-06-01'
      } else if (body.provider === 'gemini') {
        headers['x-goog-api-key'] = body.api_key
      }
    }

    const isGemini = body.provider === 'gemini'
    const url = isGemini
      ? `${body.endpoint.replace(/\/+$/, '')}/models/${body.model}:streamGenerateContent`
      : `${body.endpoint.replace(/\/+$/, '')}/chat/completions`

    const payload = isGemini
      ? { contents: [{ parts: [{ text: 'Say "ok" and nothing else.' }] }] }
      : { model: body.model, messages: [{ role: 'user', content: 'Say "ok" and nothing else.' }], max_tokens: 10 }

    // SECURITY: SSRF protection - validate URL before fetching
    const ssrfCheck = await isSafeUrl(url);
    if (!ssrfCheck.safe) {
      return NextResponse.json({ error: ssrfCheck.error }, { status: 400 });
    }

    const res = await fetch(ssrfCheck.url.toString(), {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      let msg = `API error ${res.status}: ${text.slice(0, 200)}`
      if (res.status === 401 && (text.includes('No cookie auth credentials found') || text.includes('Missing Authentication header') || text.includes('User not found') || text.includes('Invalid API key') || text.includes('Incorrect API key') || text.includes('Unauthorized') || body.provider === 'opencode' || body.provider === 'openrouter' || body.provider === 'omnirouter')) {
        const note = body.provider === 'openrouter'
          ? 'Note: OpenRouter API keys MUST start with "sk-or-v1-". Please create a free key at https://openrouter.ai/keys and enter it above.'
          : body.provider === 'opencode'
          ? 'Note: Check your API key at https://opencode.ai/workspace/keys.'
          : ''
        msg = `API error 401: Missing or invalid API key for ${body.provider.toUpperCase()}. ${note}`
      }
      return NextResponse.json({ ok: false, message: msg })
    }

    return NextResponse.json({ ok: true, message: 'Connection successful' })
  } catch (e: any) {
    console.error('[CodeSpectra] admin/llm-config/test:', e)
    const reason = String(e?.cause?.code || e?.cause?.message || e?.message || '')
    const detailed = reason.includes('ENOTFOUND') || reason.includes('EAI_AGAIN') || reason.includes('fetch failed')
      ? `Cannot reach endpoint "${body.endpoint}". Check that the API Endpoint URL is valid and reachable.`
      : 'Connection failed. See server logs for details.'
    return NextResponse.json({ ok: false, message: detailed })
  }
}
