import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { z } from 'zod'
import { generateObject } from 'ai'
import { openai } from '@ai-sdk/openai'
import { getUserAiCredits, deductUserAiCredits } from '@/lib/user-credits'

export const runtime = 'nodejs'
export const maxDuration = 60 // Allow up to 60 seconds for generating questions

const generateSchema = z.object({
  company: z.string(),
  role: z.string(),
  difficulty: z.string(),
  count: z.number().default(15) // Generate 15 by default to save time
})

const questionSchema = z.object({
  questions: z.array(z.object({
    id: z.string(),
    question: z.string(),
    options: z.array(z.string()).length(4),
    correctIndex: z.number().min(0).max(3),
    explanation: z.string(),
  }))
})

export async function POST(req: Request) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  try {
    const body = await req.json()
    const { company, role, difficulty, count } = generateSchema.parse(body)

    // AI Credits Check
    if (gate.user?.id) {
      const credits = await getUserAiCredits(gate.user.id)
      if (credits.balance <= 0) {
        return NextResponse.json(
          { error: 'You have run out of AI Credits for this month. Upgrade to Pro to get more credits!' },
          { status: 402 } // Payment required
        )
      }
    }

    const { object } = await generateObject({
      model: openai('gpt-4-turbo'),
      schema: questionSchema,
      prompt: `Generate exactly ${count} multiple-choice interview questions for a ${difficulty} level candidate applying for a ${role} position at ${company}.
      
Make the questions realistic, challenging, and strictly relevant to the role and company. 
Include a mix of technical knowledge, situational judgment, and problem-solving if appropriate.
Each question must have exactly 4 options, and provide the index (0-3) of the correct answer, along with a brief explanation.`,
    })

    // Deduct credit
    if (gate.user?.id) {
      await deductUserAiCredits(gate.user.id)
    }

    return NextResponse.json({ questions: object.questions })

  } catch (e) {
    console.error('[mock-tests generate] error:', e)
    return NextResponse.json({ error: 'Failed to generate mock test' }, { status: 500 })
  }
}
