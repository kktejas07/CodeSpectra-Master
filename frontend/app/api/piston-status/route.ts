import { NextResponse } from 'next/server'
import { readServerSecrets } from '@/lib/server-secrets-cache'

export const dynamic = 'force-dynamic'

export async function GET() {
  const secrets = await readServerSecrets()
  const pistonUrl = secrets.piston_url?.trim() || null

  if (!pistonUrl) {
    return NextResponse.json({
      status: 'not_configured',
      message: 'No Piston URL configured. Set piston_url in admin settings or PISTON_URL env var.',
    })
  }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)
    const res = await fetch(`${pistonUrl.replace(/\/+$/, '')}/runtimes`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    clearTimeout(timeoutId)

    if (!res.ok) {
      return NextResponse.json({
        status: 'error',
        piston_url: pistonUrl,
        error: `Piston returned HTTP ${res.status}`,
      })
    }

    const runtimes = await res.json()
    return NextResponse.json({
      status: 'connected',
      piston_url: pistonUrl,
      runtimes: Array.isArray(runtimes) ? runtimes.length : 0,
    })
  } catch (e) {
    return NextResponse.json({
      status: 'error',
      piston_url: pistonUrl,
      error: e instanceof Error ? e.message : 'Connection failed',
    })
  }
}
