import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import {
  aiChatSessions,
  aiChatMessages,
  newId,
  nowIso,
} from '@/lib/db/ai'
import { backendChatStream } from '@/lib/ai/backend'
import { codeScans } from '@/lib/db/scans'

export const runtime = 'nodejs'

interface ChatPostBody {
  session_id?: string
  message: string
  context_mode?: 'none' | 'current_scan' | 'rag'
  current_scan_id?: string
  problem_slug?: string
}

/**
 * POST /api/ai/chat — streams the assistant reply as SSE.
 * - Authenticates with Better Auth
 * - Persists user + assistant messages in MongoDB (ai_chat_messages)
 * - Builds context from recent user scans/submissions when context_mode='rag'
 */
export async function POST(req: NextRequest): Promise<Response> {
  const user = await getAPIUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  let body: ChatPostBody
  try {
    body = (await req.json()) as ChatPostBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const message = (body.message || '').trim()
  if (!message) {
    return NextResponse.json({ error: 'message required' }, { status: 400 })
  }

  const sessionsCol = await aiChatSessions()
  const msgsCol = await aiChatMessages()

  // Find or create session.
  let sessionId = body.session_id?.trim() || ''
  if (!sessionId) {
    sessionId = newId()
    await sessionsCol.insertOne({
      id: sessionId,
      user_id: user.id,
      title: message.slice(0, 60),
      model_role: 'reasoning',
      created_at: nowIso(),
      updated_at: nowIso(),
    })
  } else {
    const existing = await sessionsCol.findOne({ id: sessionId, user_id: user.id })
    if (!existing) {
      return NextResponse.json({ error: 'session not found' }, { status: 404 })
    }
  }

  // Pull last 12 messages of this session for context.
  const history = await msgsCol
    .find({ session_id: sessionId })
    .sort({ created_at: 1 })
    .limit(20)
    .toArray()

  // Persist user turn.
  await msgsCol.insertOne({
    id: newId(),
    session_id: sessionId,
    user_id: user.id,
    role: 'user',
    content: message,
    created_at: nowIso(),
  })

  // Build context-aware system message.
  let extraContext = ''
  if (body.context_mode === 'rag') {
    extraContext = await buildRagContext(user.id)
  } else if (body.context_mode === 'current_scan' && body.current_scan_id) {
    const sc = await codeScans()
    const scan = await sc.findOne({ id: body.current_scan_id, user_id: user.id })
    if (scan?.code_snippet) {
      extraContext = `\n\nUSER IS CURRENTLY VIEWING THIS SCAN:\nLanguage: ${scan.language}\nCode:\n\`\`\`${scan.language}\n${scan.code_snippet.slice(0, 4000)}\n\`\`\``
    }
  }

  const systemMessage =
    "You are 'Ask CodeSpectra', an expert AI coding assistant embedded in the CodeSpectra platform. " +
    'Be concise, use fenced code blocks for code, and prefer actionable next steps.' +
    extraContext

  // Stream from backend, simultaneously buffering to persist the assistant turn.
  const upstream = await backendChatStream({
    sessionId,
    systemMessage,
    history: history.map((m) => ({ role: m.role, content: m.content })),
    userMessage: message,
    modelRole: 'reasoning',
  })

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: `LLM upstream ${upstream.status}` },
      { status: 502 },
    )
  }

  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  let assistantBuf = ''

  const stream = new ReadableStream({
    async start(controller) {
      // Emit session_id first so the client can persist it.
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ session_id: sessionId })}\n\n`),
      )
      const reader = upstream.body!.getReader()
      try {
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value, { stream: true })
          // Parse SSE chunks to extract deltas for persistence
          for (const line of chunk.split('\n')) {
            if (line.startsWith('data: ')) {
              const payload = line.slice(6).trim()
              if (payload === '[DONE]') continue
              try {
                const parsed = JSON.parse(payload) as { delta?: string }
                if (parsed.delta) assistantBuf += parsed.delta
              } catch {
                /* ignore */
              }
            }
          }
          controller.enqueue(value)
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      } catch (e) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ error: e instanceof Error ? e.message : 'stream error' })}\n\n`,
          ),
        )
      } finally {
        // Persist assistant turn (fire-and-forget — don't block flush).
        if (assistantBuf.trim()) {
          msgsCol
            .insertOne({
              id: newId(),
              session_id: sessionId,
              user_id: user.id,
              role: 'assistant',
              content: assistantBuf,
              created_at: nowIso(),
            })
            .catch((err) => console.error('[ai/chat] persist err:', err))
          sessionsCol
            .updateOne({ id: sessionId }, { $set: { updated_at: nowIso() } })
            .catch(() => null)
        }
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      Connection: 'keep-alive',
    },
  })
}

/** Build RAG context from user's recent scans + submissions. */
async function buildRagContext(userId: string): Promise<string> {
  try {
    const sc = await codeScans()
    const recentScans = await sc
      .find({ user_id: userId })
      .sort({ created_at: -1 })
      .limit(5)
      .toArray()
    if (!recentScans.length) return ''
    const lines = recentScans.map(
      (s, i) =>
        `Scan #${i + 1} (${s.scan_type}, ${s.language}, ${s.created_at}):\n` +
        (s.code_snippet ? s.code_snippet.slice(0, 1200) : '<no snippet>'),
    )
    return `\n\nUSER'S RECENT CODE SCANS (most recent first):\n${lines.join('\n---\n')}`
  } catch {
    return ''
  }
}

/** GET /api/ai/chat?session_id=... — fetch chat history. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sessionId = req.nextUrl.searchParams.get('session_id') || ''
  const sessionsCol = await aiChatSessions()
  const msgsCol = await aiChatMessages()

  if (sessionId) {
    const session = await sessionsCol.findOne({ id: sessionId, user_id: user.id })
    if (!session) return NextResponse.json({ error: 'not found' }, { status: 404 })
    const msgs = await msgsCol
      .find({ session_id: sessionId })
      .sort({ created_at: 1 })
      .limit(200)
      .toArray()
    return NextResponse.json({
      session,
      messages: msgs.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        created_at: m.created_at,
      })),
    })
  }

  // List recent sessions.
  const sessions = await sessionsCol
    .find({ user_id: user.id })
    .sort({ updated_at: -1 })
    .limit(20)
    .toArray()
  return NextResponse.json({ sessions })
}
