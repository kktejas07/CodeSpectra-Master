import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/events/scanner — Server-Sent Events heartbeat (Phase 5 live channel placeholder).
 * Browsers: `new EventSource('/api/events/scanner', { withCredentials: true })`.
 */
export async function GET(): Promise<Response> {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  const enc = new TextEncoder()
  let pingTimer: ReturnType<typeof setInterval> | null = null
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        enc.encode(`event: ready\ndata: ${JSON.stringify({ userId: gate.user.id })}\n\n`)
      )
      pingTimer = setInterval(() => {
        try {
          controller.enqueue(
            enc.encode(`event: ping\ndata: ${JSON.stringify({ t: Date.now() })}\n\n`)
          )
        } catch {
          if (pingTimer) clearInterval(pingTimer)
          pingTimer = null
        }
      }, 25_000)
    },
    cancel() {
      if (pingTimer) clearInterval(pingTimer)
      pingTimer = null
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
