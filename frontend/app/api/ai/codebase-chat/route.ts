/**
 * POST /api/ai/codebase-chat — "Chat with your codebase" in the scanner.
 *
 * CORE-026: this used to run the server-configured FastAPI URL through the
 * public-URL SSRF guard, which blocks localhost and private hosts (including
 * the Docker `backend` host), so every request failed. It now goes through the
 * shared AI client (lib/ai/backend → INTERNAL_BACKEND_URL, provider fallback,
 * usage metering, prompt guard). The scan used as context must belong to the
 * caller.
 *
 * Body: { message: string (≤ 4000), scanId?: string }
 */
import { NextRequest, NextResponse } from 'next/server'
import { getMongoDb } from '@/lib/mongodb'
import { requirePageAccess } from '@/lib/route-auth'
import { limitRequest } from '@/lib/rate-limit'
import { codebaseChatPrompt } from '@/lib/ai/codebase-chat'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const gate = await requirePageAccess('/dashboard/scanner', 'scanner:chat')
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const user = gate.user
  const limited = await limitRequest(request, 'codebase-chat', user.id, 20, 60_000)
  if (limited) return limited

  const body = (await request.json().catch(() => null)) as { message?: unknown; scanId?: unknown } | null
  const message = typeof body?.message === 'string' ? body.message.trim() : ''
  if (!message) return NextResponse.json({ error: 'message is required' }, { status: 400 })
  if (message.length > 4000) return NextResponse.json({ error: 'Keep the question under 4,000 characters.' }, { status: 400 })
  const scanId = typeof body?.scanId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(body.scanId) ? body.scanId : null

  try {
    // Only the caller's own scan can be used as context.
    const scan = scanId
      ? await (await getMongoDb()).collection('code_scans').findOne({ id: scanId, user_id: user.id }, { projection: { _id: 0, file_path: 1, code_snippet: 1 } })
      : null
    const { backendComplete } = await import('@/lib/ai/backend')
    const res = await backendComplete({
      sessionId: `codebase-chat-${user.id}`,
      systemMessage: codebaseChatPrompt(scan as { file_path?: unknown; code_snippet?: unknown } | null),
      userMessage: message,
      modelRole: 'reasoning',
      feature: 'scanner:chat',
      userId: user.id,
    })
    if (!res.ok || !res.text) {
      return NextResponse.json({ error: 'The AI assistant is unavailable right now. Try again in a minute.' }, { status: 502 })
    }
    return NextResponse.json({ reply: res.text })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[CodeSpectra] Codebase Chat error:', msg.slice(0, 200))
    if (/INTERNAL_BACKEND_URL/.test(msg)) {
      return NextResponse.json({ error: 'The AI assistant is not configured yet.' }, { status: 503 })
    }
    return NextResponse.json({ error: 'The AI assistant is unavailable right now. Try again in a minute.' }, { status: 502 })
  }
}
