/**
 * POST /api/admin/agent/chat — one admin-copilot turn, streamed as NDJSON
 * (one JSON event per line: conversation, model, text, tool_call, tool_result,
 * proposal, error, done). Body: { message: string, conversationId?: string,
 * tenantId?: string | null } — tenantId is the superadmin tenant picker
 * ('platform'/null = whole platform); tenant admins may not send another tenant.
 * Admins only; rate limited; the turn aborts when the client disconnects.
 */
import { NextResponse } from 'next/server'
import { requireAgentCaller, readJson } from '@/lib/agent/http'
import { limitRequest } from '@/lib/rate-limit'
import { getUserAiCredits, outOfCredits } from '@/lib/user-credits'
import { MAX_USER_MESSAGE_CHARS, openConversation, runChatTurn, type AgentStreamEvent } from '@/lib/agent/service'
import { AllProvidersFailedError } from '@/lib/agent/providers'
import { parseScopeRequest, scopedCaller, tenantExists } from '@/lib/agent/scope-tenant'
import { checkBudget, getBudgetSettings } from '@/lib/agent/usage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(req: Request): Promise<Response> {
  const gate = await requireAgentCaller()
  if ('response' in gate) return gate.response
  const { caller } = gate
  // Reply in the caller's interface language (profile → cookie → Accept-Language).
  const locale = await import('@/lib/i18n/server').then((m) => m.getRequestLocale({ userId: caller.userId })).catch(() => 'en' as const)

  // Per-user message rate limits are admin-configurable (copilot usage settings).
  const settings = await getBudgetSettings()
  const limited = (await limitRequest(req, 'admin-agent-chat', caller.userId, settings.user_messages_per_minute, 60_000))
    ?? (await limitRequest(req, 'admin-agent-chat-hour', caller.userId, settings.user_messages_per_hour, 60 * 60_000))
  if (limited) return limited

  const body = await readJson(req)
  const message = typeof body?.message === 'string' ? body.message.trim() : ''
  if (!message) return NextResponse.json({ error: 'Type a message first.' }, { status: 400 })
  if (message.length > MAX_USER_MESSAGE_CHARS) {
    return NextResponse.json({ error: `Messages can be up to ${MAX_USER_MESSAGE_CHARS} characters.`, code: 'agent_message_max', params: { max: MAX_USER_MESSAGE_CHARS } }, { status: 413 })
  }
  const conversationId = typeof body?.conversationId === 'string' && body.conversationId ? body.conversationId : null
  const scope = parseScopeRequest(caller, body?.tenantId)
  if (scope.kind === 'error') return NextResponse.json({ error: scope.error }, { status: scope.status })
  if (scope.kind === 'set' && scope.tenantId && !(await tenantExists(scope.tenantId).catch(() => false))) {
    return NextResponse.json({ error: 'Unknown organisation.' }, { status: 400 })
  }
  const scopeTenantId = scope.kind === 'set' ? scope.tenantId : undefined

  try {
    const credits = await getUserAiCredits(caller.userId)
    if (credits.balance < 1) return NextResponse.json(outOfCredits({ cost: 1, balance: credits.balance }), { status: 402 })
  } catch (e) {
    console.error('[agent/chat] credit check failed:', e)
    return NextResponse.json({ error: 'Could not check your AI credits. Try again.' }, { status: 503 })
  }

  const opened = await openConversation(caller, conversationId, message, scopeTenantId)
  if (!opened) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  const { conv, created } = opened

  // Organisation budget (daily / monthly tokens) before any model call.
  const budget = await checkBudget(scopedCaller(caller, conv.scope_tenant_id))
  if (!budget.ok) return NextResponse.json({ error: budget.reason, budget: { daily: budget.daily, monthly: budget.monthly } }, { status: 429 })

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
      send({ type: 'conversation', id: conv.id, title: conv.title, created, ...(caller.role === 'superadmin' ? { tenantId: conv.scope_tenant_id ?? null } : {}) })
      try {
        const r = await runChatTurn({ caller, conv, message, signal: abort.signal, emit: send, locale })
        if (r.status === 'error') {
          const friendly = /unavailable|No AI model/i.test(r.error || '') ? r.error! : 'The AI model failed to answer. Try again in a moment.'
          send({ type: 'error', message: friendly })
        }
        send({ type: 'done', usage: { input_tokens: r.charge.inputTokens, output_tokens: r.charge.outputTokens, credits: r.credits } })
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
