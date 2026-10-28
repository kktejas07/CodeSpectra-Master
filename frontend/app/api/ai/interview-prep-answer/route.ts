import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { backendComplete } from '@/lib/ai/backend'
import { readPlatformLlmConfig } from '@/lib/ai/get-user-model'
import { rateLimitAIRedis } from '@/lib/upstash-rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface Req {
  questionId: string
  question: string
  category: string
  difficulty: string
}

/** Map a free-form provider name to a backend enum the AI router understands. */
function normalizeProvider(provider: string): string {
  const lower = provider.toLowerCase()
  if (lower === 'opencode' || lower === 'omnirouter') return 'opencode'
  if (lower === 'openrouter') return 'openrouter'
  if (lower === 'gemini') return 'gemini'
  if (lower === 'anthropic') return 'anthropic'
  if (lower === 'openai') return 'openai'
  return lower // groq, deepseek, nvidia, etc. pass through
}

async function platformModelOverrides(): Promise<{
  providerOverride?: string
  modelOverride?: string
  endpointOverride?: string
  apiKeyOverride?: string
}> {
  try {
    const cfg = await readPlatformLlmConfig()
    if (!cfg) return {}
    const provider = normalizeProvider(cfg.provider || '')
    if (!provider) return {}
    const apiKey = cfg.api_key && typeof cfg.api_key === 'string' && !cfg.api_key.includes('•') ? cfg.api_key.trim() : ''
    return {
      providerOverride: provider,
      modelOverride: cfg.model,
      ...(cfg.endpoint ? { endpointOverride: cfg.endpoint } : {}),
      ...(apiKey ? { apiKeyOverride: apiKey } : {}),
    }
  } catch {
    return {}
  }
}

/** Extract a JSON object from an LLM response that may contain prose/markdown. */
function extractJson(raw: string): Record<string, unknown> | null {
  if (!raw) return null
  try {
    const trimmed = raw.trim()
    const first = trimmed.charCodeAt(0)
    if (first === 123 || first === 91) return JSON.parse(trimmed)
    const match = trimmed.match(/\{[\s\S]*\}/)
    if (match) return JSON.parse(match[0])
    const bracket = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (bracket) {
      const inner = bracket[1].trim()
      try { return JSON.parse(inner) } catch { /* fall through */ }
      const innerMatch = inner.match(/\{[\s\S]*\}/)
      if (innerMatch) return JSON.parse(innerMatch[0])
    }
  } catch {
    return null
  }
  return null
}

function validateAnswer(data: Record<string, unknown> | null): {
  answer?: string
  keyPoints?: string[]
  commonFollowUp?: string
  codeExample?: string
  tip?: string
} | null {
  if (!data || typeof data !== 'object') return null
  const answer = typeof data.answer === 'string' ? data.answer.trim() : ''
  if (!answer) return null
  const keyPoints = Array.isArray(data.keyPoints)
    ? data.keyPoints.filter((k): k is string => typeof k === 'string')
    : []
  return {
    answer,
    keyPoints,
    commonFollowUp: typeof data.commonFollowUp === 'string' ? data.commonFollowUp : '',
    codeExample: typeof data.codeExample === 'string' ? data.codeExample : undefined,
    tip: typeof data.tip === 'string' ? data.tip : '',
  }
}

export async function POST(req: NextRequest) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })

  const rateCheck = await rateLimitAIRedis(req, user.id)
  if (!rateCheck.ok) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Try again in ${rateCheck.retryAfterSec}s.`, code: 'rate_limited_seconds', params: { seconds: rateCheck.retryAfterSec } },
      { status: 429 },
    )
  }

  let body: Req
  try {
    body = (await req.json()) as Req
  } catch {
    return NextResponse.json({ error: 'Invalid JSON', code: 'invalid_json' }, { status: 400 })
  }

  if (!body.question || !body.category) {
    return NextResponse.json({ error: 'question and category required' }, { status: 400 })
  }

  const system = `You are a senior frontend engineer conducting a technical interview. Return ONLY a valid JSON object with this exact shape:
{
  "answer": "Clear, structured answer to the interview question",
  "keyPoints": ["3-5 key points the answer covers"],
  "commonFollowUp": "A likely follow-up question an interviewer might ask",
  "codeExample": "A brief code example if applicable (omit if none)",
  "tip": "One-liner tip for answering this in an interview"
}`
  const userMsg = `Question (${body.difficulty} ${body.category}): "${body.question}"

Provide a comprehensive, clear answer that a candidate could use to prepare. Be concise but thorough. Use real-world examples where possible.`

  let res
  try {
    res = await backendComplete({
      systemMessage: system,
      userMessage: userMsg,
      modelRole: 'reasoning',
      responseFormat: 'json',
      userId: user.id,
      feature: 'interview-prep-answer',
      ...(await platformModelOverrides()),
    })
  } catch (e) {
    console.error('interview-prep-answer backend error:', e)
    return NextResponse.json({ error: 'AI service temporarily unavailable. Please try again.' }, { status: 502 })
  }

  if (!res.ok) {
    return NextResponse.json({ error: 'AI service temporarily unavailable. Please try again.' }, { status: 502 })
  }

  const parsed =
    (res.ok && res.json ? (res.json as Record<string, unknown>) : null) ||
    extractJson(res.raw || res.text || '')

  const answer = validateAnswer(parsed)
  if (!answer) {
    return NextResponse.json({ error: 'AI returned an invalid response. Please try again.' }, { status: 502 })
  }

  return NextResponse.json({
    ...answer,
    questionId: body.questionId,
  })
}