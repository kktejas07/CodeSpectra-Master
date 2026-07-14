import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { generateObject } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'
import { rateLimitAI } from '@/lib/in-memory-rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const QuizQuestionSchema = z.object({
  id: z.string(),
  question: z.string().describe('The interview question'),
  category: z.string().describe('Subtopic within the category'),
  difficulty: z.enum(['Easy', 'Medium', 'Hard']),
  options: z.array(z.string()).describe('4 multiple-choice options'),
  correctIndex: z.number().min(0).max(3).describe('Index of the correct option'),
  explanation: z.string().describe('Why the correct answer is correct'),
})

const QuizSchema = z.object({
  questions: z.array(QuizQuestionSchema).describe('The generated quiz questions'),
})

interface Req {
  category: 'JavaScript' | 'React' | 'Next.js' | 'Mixed'
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'Mixed'
  count: number
  focusTopic?: string
}

export async function POST(req: NextRequest) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rateCheck = rateLimitAI(req, user.id)
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

  const count = Math.max(1, Math.min(10, body.count || 5))
  const category = body.category || 'Mixed'
  const difficulty = body.difficulty || 'Mixed'

  const prompt = `Generate ${count} frontend developer interview ${category === 'Mixed' ? 'questions across JavaScript, React, and Next.js' : `${category} questions`}.

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

  const result = await generateObject({
    model: openai('gpt-4o-mini'),
    schema: QuizSchema,
    prompt,
  })

  return NextResponse.json(result.object)
}
