import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { backendComplete } from '@/lib/ai/backend'
import { readPlatformLlmConfig } from '@/lib/ai/get-user-model'
import { rateLimitAIRedis } from '@/lib/upstash-rate-limit'
import { getUserAiCredits, spendAiCredits } from '@/lib/user-credits'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface Req {
  category: 'JavaScript' | 'React' | 'Next.js' | 'Mixed'
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'Mixed'
  count: number
  focusTopic?: string
}

interface QuizQuestion {
  id: string
  question: string
  category: string
  difficulty: 'Easy' | 'Medium' | 'Hard'
  options: string[]
  correctIndex: number
  explanation: string
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
  } catch {
    return null
  }
  return null
}

function validateQuiz(data: Record<string, unknown> | null): QuizQuestion[] | null {
  if (!data || typeof data !== 'object') return null
  const rawQuestions = Array.isArray(data.questions) ? data.questions : Array.isArray(data) ? data : []
  if (rawQuestions.length === 0) return null
  const questions: QuizQuestion[] = []
  for (const raw of rawQuestions) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    const options = Array.isArray(r.options) ? r.options.filter((o): o is string => typeof o === 'string') : []
    const correctIndex = typeof r.correctIndex === 'number' ? r.correctIndex : -1
    if (
      typeof r.question !== 'string' || !r.question.trim() ||
      options.length < 2 || correctIndex < 0 || correctIndex >= options.length
    ) continue
    const difficulty = r.difficulty === 'Easy' || r.difficulty === 'Medium' || r.difficulty === 'Hard'
      ? r.difficulty
      : 'Medium'
    questions.push({
      id: typeof r.id === 'string' ? r.id : `q${questions.length + 1}`,
      question: r.question,
      category: typeof r.category === 'string' ? r.category : 'General',
      difficulty,
      options,
      correctIndex,
      explanation: typeof r.explanation === 'string' ? r.explanation : '',
    })
  }
  return questions.length > 0 ? questions : null
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

  const { balance } = await getUserAiCredits(user.id)
  if (balance < 1) {
    return NextResponse.json({ error: 'Insufficient AI credits' }, { status: 402 })
  }

  let body: Req
  try {
    body = (await req.json()) as Req
  } catch {
    return NextResponse.json({ error: 'Invalid JSON', code: 'invalid_json' }, { status: 400 })
  }

  const count = Math.max(1, Math.min(10, body.count || 5))
  const category = body.category || 'Mixed'
  const difficulty = body.difficulty || 'Mixed'

  const system = `You are an expert frontend interview question generator. Return ONLY a valid JSON object with this exact shape:
{
  "questions": [
    {
      "id": "q1",
      "question": "The interview question",
      "category": "Subtopic within the category",
      "difficulty": "Easy" | "Medium" | "Hard",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctIndex": 0,
      "explanation": "Why the correct answer is correct"
    }
  ]
}`
  const userMsg = `Generate ${count} frontend developer interview ${category === 'Mixed' ? 'questions across JavaScript, React, and Next.js' : `${category} questions`}.

Difficulty: ${difficulty === 'Mixed' ? 'Mix of Easy, Medium, and Hard' : difficulty}
${body.focusTopic ? `Focus area: ${body.focusTopic}` : ''}

Requirements:
- Each question must have exactly 4 multiple-choice options (A, B, C, D)
- Exactly one correct answer
- Questions should test practical knowledge, not trivia
- Vary the subtopics within the category
- Include a brief explanation for the correct answer
- Questions should be suitable for a real interview setting

Make the questions challenging but fair.`

  let res
  try {
    res = await backendComplete({
      systemMessage: system,
      userMessage: userMsg,
      modelRole: 'reasoning',
      responseFormat: 'json',
      userId: user.id,
      feature: 'interview-prep-generate',
      ...(await platformModelOverrides()),
    })
  } catch (e) {
    console.error('interview-prep-generate backend error:', e)
    return NextResponse.json({ error: 'AI service temporarily unavailable. Please try again.' }, { status: 502 })
  }

  if (!res.ok) {
    return NextResponse.json({ error: 'AI service temporarily unavailable. Please try again.' }, { status: 502 })
  }

  const parsed =
    (res.ok && res.json ? (res.json as Record<string, unknown>) : null) ||
    extractJson(res.raw || res.text || '')

  const questions = validateQuiz(parsed)
  if (!questions) {
    return NextResponse.json({ error: 'AI returned an invalid response. Please try again.' }, { status: 502 })
  }

  // Charge only after a usable result (atomic; fails if the balance ran out meanwhile).
  const spent = await spendAiCredits(user.id, 1)
  if (!spent.ok) return NextResponse.json({ error: 'Insufficient AI credits' }, { status: 402 })

  return NextResponse.json({ questions, credits_remaining: spent.balance })
}