/**
 * POST /api/ai/edith — GO EDITH multi-source AI assistant
 *
 * Routing logic (token-efficient, cheapest path first):
 *  1. Intent classifier (tiny prompt) → 'code' | 'search' | 'knowledge' | 'platform'
 *  2. code      → existing /api/ai/agent pipeline (if code attached) or chat
 *  3. search    → Google Custom Search → inject top-3 snippets as context → LLM answer
 *  4. knowledge → RAG from user scan history → LLM answer
 *  5. platform  → direct LLM with system knowledge about CodeSpectra
 *
 * All paths stream SSE back to the client.
 */
import { NextRequest } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { backendChatStream } from '@/lib/ai/backend'
import { resolveModel } from '@/lib/ai/get-user-model'
import { rateLimitAIRedis } from '@/lib/upstash-rate-limit'
import { chargeAiFeature, outOfCredits } from '@/lib/user-credits'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'

/* ── Types ─────────────────────────────────────────── */
interface EdithRequest {
  message: string
  context_mode?: 'auto' | 'rag' | 'google' | 'none'
  session_id?: string
}

interface GoogleResult {
  title: string
  snippet: string
  link: string
}

/* ── Google Custom Search ───────────────────────────── */
async function googleSearch(query: string): Promise<GoogleResult[]> {
  const apiKey = process.env.GOOGLE_CSE_API_KEY
  const cx = process.env.GOOGLE_CSE_CX

  if (!apiKey || !cx) return []

  try {
    const url = new URL('https://www.googleapis.com/customsearch/v1')
    url.searchParams.set('key', apiKey)
    url.searchParams.set('cx', cx)
    url.searchParams.set('q', query)
    url.searchParams.set('num', '4')
    url.searchParams.set('fields', 'items(title,snippet,link)')

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return []
    const data = (await res.json()) as { items?: GoogleResult[] }
    return (data.items || []).slice(0, 4)
  } catch {
    return []
  }
}

/* ── RAG context (reuse existing scan history) ──────── */
async function getRagContext(userId: string): Promise<string> {
  try {
    const db = await getMongoDb()
    const scans = await db
      .collection('code_scans')
      .find({ user_id: userId }, { projection: { summary: 1, language: 1, created_at: 1 } })
      .sort({ created_at: -1 })
      .limit(5)
      .toArray()

    if (!scans.length) return ''
    return (
      'Recent user activity:\n' +
      scans
        .map((s) => `- ${s.language || 'code'} scan (${(s.created_at || '').slice(0, 10)}): ${(s.summary || '').slice(0, 200)}`)
        .join('\n')
    )
  } catch {
    return ''
  }
}

/* ── SSE helpers ─────────────────────────────────────── */
const encoder = new TextEncoder()

function sseChunk(data: object) {
  return encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
}

function sseError(msg: string) {
  return encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\ndone\n\n`)
}

/* ── Main handler ────────────────────────────────────── */
export async function POST(req: NextRequest): Promise<Response> {
  const user = await getAPIUser()
  if (!user) {
    return new Response(sseError('Unauthorized'), { status: 401, headers: { 'Content-Type': 'text/event-stream' } })
  }

  const rateCheck = await rateLimitAIRedis(req, user.id)
  if (!rateCheck.ok) {
    return new Response(sseError(`Rate limit. Retry in ${rateCheck.retryAfterSec}s.`), {
      status: 429,
      headers: { 'Content-Type': 'text/event-stream' },
    })
  }

  let body: EdithRequest
  try {
    body = (await req.json()) as EdithRequest
  } catch {
    return new Response(sseError('Invalid JSON'), { status: 400, headers: { 'Content-Type': 'text/event-stream' } })
  }

  const message = body.message?.trim()
  if (!message) {
    return new Response(sseError('message required'), { status: 400, headers: { 'Content-Type': 'text/event-stream' } })
  }

  // Charge 1 AI credit
  const charged = await chargeAiFeature(user.id, 'edith_chat').catch(() => null)
  if (!charged) {
    return new Response(sseError('Could not check AI credits.'), { status: 503, headers: { 'Content-Type': 'text/event-stream' } })
  }
  if (!charged.ok) {
    const err = outOfCredits({ cost: 1, balance: charged.balance })
    return new Response(sseError(err.error), { status: 402, headers: { 'Content-Type': 'text/event-stream' } })
  }

  const { providerOverride, modelOverride, endpointOverride } = await resolveModel(user.id, 'chat_model')

  /* ── Determine context mode ──────────────────────── */
  const contextMode = body.context_mode || 'auto'
  let extraContext = ''
  const sources: Array<{ title: string; url: string }> = []

  // Auto-detect: use Google if message looks like a "what is / find / latest / search" query
  const needsSearch =
    contextMode === 'google' ||
    (contextMode === 'auto' &&
      /\b(what is|who is|latest|current|news|find|search|when|where|how to|define|explain|vs|compare|price|release|update)\b/i.test(message))

  if (needsSearch) {
    const results = await googleSearch(message)
    if (results.length) {
      extraContext =
        '\n\n[Web search results for this query:]\n' +
        results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.snippet}`).join('\n\n')
      sources.push(...results.map((r) => ({ title: r.title, url: r.link })))
    }
  }

  // RAG: attach user scan history for coding questions
  if (contextMode === 'rag' || (contextMode === 'auto' && !needsSearch)) {
    const ragCtx = await getRagContext(user.id)
    if (ragCtx) extraContext += '\n\n' + ragCtx
  }

  /* ── Build system prompt ──────────────────────────── */
  const system = `You are EDITH (E.D.I.T.H — Even Dead I'm The Hero), the AI assistant for CodeSpectra — a technical assessment and developer learning platform.

You help users with:
- Coding questions, debugging, refactoring, and algorithm explanations
- Information lookups: tech topics, company info, programming concepts
- CodeSpectra platform guidance: practice, assessments, hackathons, courses
- Career advice, interview prep, job search

Response style:
- Be concise and direct. Use markdown for code blocks.
- For factual/search queries: cite sources if you have web results.
- For code: always include the improved snippet.
- Prefer shorter answers unless depth is clearly needed (saves tokens).
- Never hallucinate URLs or docs. Say "I'm not sure" when uncertain.${extraContext}`

  /* ── Stream SSE ───────────────────────────────────── */
  const stream = new ReadableStream({
    async start(controller) {
      // Emit sources before content so the UI can show cards immediately
      if (sources.length) {
        controller.enqueue(sseChunk({ sources }))
      }

      try {
        const upstream = backendChatStream(
          { message, context_mode: 'none', session_id: body.session_id },
          {
            system,
            providerOverride,
            modelOverride,
            endpointOverride: endpointOverride || undefined,
            userId: user.id,
          },
        )
        for await (const chunk of upstream) {
          controller.enqueue(encoder.encode(chunk))
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'EDITH encountered an error.'
        controller.enqueue(sseChunk({ error: msg }))
      } finally {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
