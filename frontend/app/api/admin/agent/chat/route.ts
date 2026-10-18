/**
 * POST /api/admin/agent/chat — one admin-copilot turn, streamed as NDJSON
 * (one JSON event per line: conversation, model, text, tool_call, tool_result,
 * proposal, error, done). Body: { message: string, conversationId?: string }.
 * Admins only; rate limited; the turn aborts when the client disconnects.
 */
import { NextResponse } from 'next/server'
import { requireAgentCaller, readJson } from '@/lib/agent/http'
import { limitRequest } from '@/lib/rate-limit'
import { getUserAiCredits, outOfCredits } from '@/lib/user-credits'
import { MAX_USER_MESSAGE_CHARS, openConversation, runChatTurn, type AgentStreamEvent } from '@/lib/agent/service'
import { AllProvidersFailedError } from '@/lib/agent/providers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(req: Request): Promise<Response> {
  const gate = await requireAgentCaller()
  if ('response' in gate) return gate.response
  const { caller } = gate

  const limited = await limitRequest(req, 'admin-agent-chat', caller.userId, 12, 60_000)
  if (limited) return limited

  const body = await readJson(req)
  const message = typeof body?.message === 'string' ? body.message.trim() : ''
  if (!message) return NextResponse.json({ error: 'Type a message first.' }, { status: 400 })
  if (message.length > MAX_USER_MESSAGE_CHARS) {
    return NextResponse.json({ error: `Messages can be up to ${MAX_USER_MESSAGE_CHARS} characters.` }, { status: 413 })
  }
  const conversationId = typeof body?.conversationId === 'string' && body.conversationId ? body.conversationId : null

  try {
    const credits = await getUserAiCredits(caller.userId)
    if (credits.balance < 1) return NextResponse.json(outOfCredits({ cost: 1, balance: credits.balance }), { status: 402 })
  } catch (e) {
    console.error('[agent/chat] credit check failed:', e)
    return NextResponse.json({ error: 'Could not check your AI credits. Try again.' }, { status: 503 })
  }

  const opened = await openConversation(caller, conversationId, message)
  if (!opened) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  const { conv, created } = opened

  const abort = new AbortController()
  const onAbort = () => abort.abort()
  req.signal?.addEventListener('abort', onAbort)
  const encoder = new TextEncoder()
  let closed = false

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: AgentStreamEvent) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`))
        } catch {
          closed = true
        }
      }
      send({ type: 'conversation', id: conv.id, title: conv.title, created })
      try {
        const r = await runChatTurn({ caller, conv, message, signal: abort.signal, emit: send })
        if (r.status === 'error') {
          const friendly = /unavailable|No AI model/i.test(r.error || '') ? r.error! : 'The AI model failed to answer. Try again in a moment.'
          send({ type: 'error', message: friendly })
        }
        send({ type: 'done', usage: { input_tokens: r.usage.inputTokens, output_tokens: r.usage.outputTokens, credits: r.credits } })
      } catch (e) {
        console.error('[agent/chat] turn failed:', e)
        send({ type: 'error', message: e instanceof AllProvidersFailedError ? e.message : 'Something went wrong. Try again.' })
        send({ type: 'done' })
      } finally {
        req.signal?.removeEventListener('abort', onAbort)
        if (!closed) {
          closed = true
          try { controller.close() } catch { /* already closed */ }
        }
      }
    },
    cancel() {
      closed = true
      abort.abort()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  })
}
