import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { generateObject } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'
import { rateLimitAIRedis } from '@/lib/upstash-rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const AnswerSchema = z.object({
  answer: z.string().describe('Clear, structured answer to the interview question'),
  keyPoints: z.array(z.string()).describe('3-5 key points the answer covers'),
  commonFollowUp: z.string().describe('A likely follow-up question an interviewer might ask'),
  codeExample: z.string().optional().describe('A brief code example if applicable'),
  tip: z.string().describe('One-liner tip for answering this in an interview'),
})

interface Req {
  questionId: string
  question: string
  category: string
  difficulty: string
}

export async function POST(req: NextRequest) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rateCheck = await rateLimitAIRedis(req, user.id)
  if (!rateCheck.ok) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Try again in ${rateCheck.retryAfterSec}s.` },
      { status: 429 },
    )
  }

  let body: Req
  try {
    body = (await req.json()) as Req
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.question || !body.category) {
    return NextResponse.json({ error: 'question and category required' }, { status: 400 })
  }

  const prompt = `You are a senior frontend engineer conducting a technical interview. Answer the following ${body.difficulty} ${body.category} interview question.

Question: "${body.question}"

Provide a comprehensive, clear answer that a candidate could use to prepare. Include:
- A well-structured explanation
- Key points an interviewer looks for
- A code example if relevant
- A likely follow-up question
- A practical interview tip

Be concise but thorough. Use real-world examples where possible.`

  const result = await generateObject({
    model: openai('gpt-4o-mini'),
    schema: AnswerSchema,
    prompt,
  })

  return NextResponse.json({
    ...result.object,
    questionId: body.questionId,
  })
}
