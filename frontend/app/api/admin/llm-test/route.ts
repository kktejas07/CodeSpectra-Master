import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

const TEST_URLS: Record<string, string> = {
  gemini: 'https://generativelanguage.googleapis.com/v1beta/models',
  groq: 'https://api.groq.com/openai/v1/models',
  openai: 'https://api.openai.com/v1/models',
  openrouter: 'https://openrouter.ai/api/v1/models',
  opencode: 'https://api.opencode.ai/v1/models',
  anthropic: 'https://api.anthropic.com/v1/models',
  nvidia: 'https://integrate.api.nvidia.com/v1/models',
}

const KEY_FIELDS: Record<string, string> = {
  gemini: 'gemini_api_key',
  groq: 'groq_api_key',
  openai: 'openai_api_key',
  openrouter: 'openrouter_api_key',
  opencode: 'opencode_api_key',
  anthropic: 'anthropic_api_key',
  nvidia: 'nvidia_api_key',
}

export async function POST(request: Request) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  try {
    const { provider } = await request.json()
    if (!provider) return NextResponse.json({ error: 'provider required' }, { status: 400 })

    const db = await getMongoDb()
    const secretsDoc = await db.collection('platform_settings').findOne({ key: 'secrets' })
    const keyField = KEY_FIELDS[provider]
    const key = (secretsDoc?.value as any)?.[keyField]
    if (!key) return NextResponse.json({ ok: false, error: 'No key configured' })

    const url = TEST_URLS[provider]
    if (!url) return NextResponse.json({ error: 'Unknown provider' }, { status: 400 })

    if (provider === 'gemini') {
      const res = await fetch(`${url}?key=${key}`, { signal: AbortSignal.timeout(8000) })
      return NextResponse.json({ ok: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` })
    } else {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(8000) })
      return NextResponse.json({ ok: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` })
    }
  } catch (e: unknown) {
    console.error('[CodeSpectra] admin/llm-test:', e)
    return NextResponse.json({ ok: false, error: 'LLM test failed. See server logs for details.' })
  }
}
