/**
 * POST /api/ai/edith — GO EDITH multi-source AI assistant
 *
 * Routing logic (cheapest path first):
 *  1. context_mode=none   → direct LLM, no extra context
 *  2. context_mode=google → Google Custom Search → inject snippets
 *  3. context_mode=rag    → full RAG pipeline (router → retrieve → grade → inject)
 *  4. context_mode=auto   → detect intent:
 *       search keywords    → Google CSE
 *       everything else    → RAG pipeline (with web fallback if retrieval comes up short)
 *
 * RAG pipeline: lib/rag/pipeline.ts
 *   routeQuery() → source types → searchKnowledge() → grade → context block
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
import { resolveAiKey } from '@/lib/byok'
import { runRagPipeline } from '@/lib/rag/pipeline'

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

/* ── Legacy scan-history fallback (used when RAG pipeline has no vector index) ── */
async function getScanHistoryContext(userId: string): Promise<string> {
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
      'Recent code scans (from scan history):\n' +
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

  // Resolve which API key to use based on user's plan
  // - Pro / Enterprise: use platform key pool (no credit charge needed here)
  // - Free + BYOK: use their stored key
  // - Free + no BYOK: return 402 with upgrade prompt
  const aiKey = await resolveAiKey(user.id)
  if (aiKey.source === 'none') {
    return new Response(
      sseError(aiKey.reason ?? 'No AI key configured. Add your API key in Settings → AI, or upgrade to Pro.'),
      { status: 402, headers: { 'Content-Type': 'text/event-stream' } },
    )
  }

  // Only charge credits for platform (pro/enterprise) users — BYOK users pay their own provider
  if (aiKey.source === 'platform') {
    const charged = await chargeAiFeature(user.id, 'edith_chat').catch(() => null)
    if (!charged) {
      return new Response(sseError('Could not check AI credits.'), { status: 503, headers: { 'Content-Type': 'text/event-stream' } })
    }
    if (!charged.ok) {
      const err = outOfCredits({ cost: 1, balance: charged.balance })
      return new Response(sseError(err.error), { status: 402, headers: { 'Content-Type': 'text/event-stream' } })
    }
  }

  // Resolve model settings — for BYOK users these may be unused if the backend honours the key override
  const { providerOverride, modelOverride, endpointOverride } = await resolveModel(user.id, 'chat_model')

  /* ── Determine context mode ──────────────────────── */
  const contextMode = body.context_mode || 'auto'
  let extraContext = ''
  const sources: Array<{ title: string; url: string }> = []

  // Auto-detect: use Google if message looks like a "what is / find / latest / search" query
  const isSearchQuery =
    contextMode === 'google' ||
    (contextMode === 'auto' &&
      /\b(what is|who is|latest|current|news|find|search|when|where|how to|define|explain|vs|compare|price|release|update)\b/i.test(message))

  if (isSearchQuery) {
    const results = await googleSearch(message)
    if (results.length) {
      extraContext =
        '\n\n[Web search results for this query:]\n' +
        results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.snippet}`).join('\n\n')
      sources.push(...results.map((r) => ({ title: r.title, url: r.link })))
    }
  }

  // RAG pipeline — full Corrective RAG with intent routing
  if (contextMode === 'rag' || (contextMode === 'auto' && !isSearchQuery)) {
    // ponytail: AgentCaller.role is superadmin|tenant_admin.
    // Regular users get superadmin role so the ACL lets them read public platform chunks.
    // The pipeline only requests public source types (doc, problem, course…) for regular users.
    const callerRole: 'superadmin' | 'tenant_admin' =
      // role-scope: maps the caller onto the RAG ACL role for public chunks (not an authz check)
      user.role === 'superadmin' ? 'superadmin'
      // role-scope: tenant admins read their own tenant's chunks under the same pipeline
      : user.role === 'tenant_admin' ? 'tenant_admin'
      : 'superadmin' // regular user → read platform public chunks
    const caller = { userId: user.id, role: callerRole, tenantId: user.tenantId ?? null }
    try {
      const ragResult = await runRagPipeline(message, caller)
      if (!ragResult.needsWebFallback && ragResult.context) {
        extraContext += '\n\n' + ragResult.context
        sources.push(...ragResult.sources)
      } else if (ragResult.needsWebFallback) {
        // Pipeline came up empty — try web search as a fallback
        const results = await googleSearch(message)
        if (results.length) {
          extraContext +=
            '\n\n[Web search results (RAG fallback):]\n' +
            results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.snippet}`).join('\n\n')
          sources.push(...results.map((r) => ({ title: r.title, url: r.link })))
        } else {
          // Last resort: scan history
          const scanCtx = await getScanHistoryContext(user.id)
          if (scanCtx) extraContext += '\n\n' + scanCtx
        }
      }
    } catch {
      // RAG error is non-fatal — fall back to scan history
      const scanCtx = await getScanHistoryContext(user.id)
      if (scanCtx) extraContext += '\n\n' + scanCtx
    }
  }

  /* ── Build system prompt ──────────────────────────── */
  const system = `You are EDITH (E.D.I.T.H — Even Dead I'm The Hero), the AI assistant built into CodeSpectra.

## What is CodeSpectra?
CodeSpectra is a developer intelligence platform for technical assessments, coding practice, and skill evaluation. It helps developers grow and helps teams hire the right engineers.

## Platform features you know about:
- **Code Scanner / Analysis**: Users paste or upload code; CodeSpectra scans it for bugs, complexity, security issues, and best-practice violations. Results include a summary, severity-tagged issues, and fix suggestions.
- **AI Agent**: An autonomous code-improvement agent that iterates on the user's code toward a stated goal (e.g. "refactor this for readability", "add error handling"). Costs AI credits, runs up to 5 steps.
- **Practice & Assessments**: Coding challenges, timed assessments, and hackathons. Tracks scores and skill growth over time.
- **AI Spend / Credits**: Platform users have an AI credit balance. Credits are consumed by the AI Agent, EDITH chat (platform-key users), and other AI features. Free users can bring their own API key (BYOK) via Settings → AI.
- **BYOK (Bring Your Own Key)**: Users can add their own OpenAI/Anthropic/Gemini API key in Settings → AI → My AI Key. BYOK users bypass credit charges and use their own provider directly.
- **Context modes** (shown in the EDITH header bar):
  - Auto — automatically picks between web search and RAG
  - My Scans (RAG) — answers based on the user's own scan history
  - Web — live Google search results injected into the answer
  - General — pure LLM, no extra context
- **SuperAdmin / Platform settings**: Admins can configure platform-wide AI models, rate limits, and Redis settings at /dashboard/admin/settings.
- **Dashboard**: Overview of recent scans, AI usage, and platform activity.

## Your job:
1. **Answer coding questions** — debugging, algorithms, time complexity, language-specific help, refactoring advice. Always include corrected code snippets.
2. **Help with the platform** — explain features, guide users through workflows (how to run a scan, how to use the AI agent, how to add a BYOK key, etc.).
3. **Search & research** — when context mode includes web results, cite them. Never invent URLs.
4. **Career & interview prep** — DSA, system design, behavioral questions, resume advice.
5. **Explain scan results** — if the user asks about a previous scan (RAG mode), pull from their history and explain the issues found.

## Response style:
- Concise and direct. Use markdown for code blocks (\`\`\`language).
- Lead with the answer, not a preamble.
- For code questions: always show the corrected/improved snippet.
- For platform questions: give step-by-step guidance.
- If you have web results, reference them naturally ("According to [Source]…").
- Never hallucinate — say "I'm not sure" or "I don't have that information" when uncertain.
- Keep responses focused; don't pad with unnecessary caveats.${extraContext}`

  /* ── Stream SSE ───────────────────────────────────── */
  const stream = new ReadableStream({
    async start(controller) {
      // Emit sources before content so the UI can show cards immediately
      if (sources.length) {
        controller.enqueue(sseChunk({ sources }))
      }

      try {
        const upstream = await backendChatStream({
          sessionId: body.session_id || `edith-${user.id}-${Date.now()}`,
          systemMessage: system,
          userMessage: message,
          modelRole: 'fast',
          // BYOK: override provider/key so the backend uses the user's own API key
          providerOverride: aiKey.source === 'byok' ? aiKey.provider : (providerOverride || undefined),
          modelOverride: modelOverride || undefined,
          endpointOverride: endpointOverride || undefined,
          apiKeyOverride: aiKey.source === 'byok' ? aiKey.key : undefined,
        })

        if (!upstream.ok || !upstream.body) {
          controller.enqueue(sseChunk({ error: 'Upstream provider error', code: 'upstream_error', params: { status: upstream.status } }))
        } else {
          const reader = upstream.body.getReader()
          const dec = new TextDecoder()
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            controller.enqueue(encoder.encode(dec.decode(value, { stream: true })))
          }
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
