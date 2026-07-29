import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'

const TEST_URLS: Record<string, string> = {
  gemini: 'https://generativelanguage.googleapis.com/v1beta/models',
  groq: 'https://api.groq.com/openai/v1/models',
  openai: 'https://api.openai.com/v1/models',
  openrouter: 'https://openrouter.ai/api/v1/models',
  opencode: 'https://api.opencode.ai/v1/models',
  anthropic: 'https://api.anthropic.com/v1/models',
}

export async function POST(request: Request) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  try {
    const { provider, key } = await request.json()
    const url = TEST_URLS[provider]
    if (!url) return NextResponse.json({ error: 'Unknown provider' }, { status: 400 })

    const headers: Record<string, string> = {}
    if (provider === 'gemini') {
      const res = await fetch(`${url}?key=${key}`, { signal: AbortSignal.timeout(8000) })
      return NextResponse.json({ ok: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` })
    } else {
      headers['Authorization'] = `Bearer ${key}`
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) })
      return NextResponse.json({ ok: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` })
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message })
  }
}
