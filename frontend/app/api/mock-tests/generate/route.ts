import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { z } from 'zod'
import { generateObject } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createAnthropic } from '@ai-sdk/anthropic'
import { getUserAiCredits, deductUserAiCredits } from '@/lib/user-credits'
import { readServerSecrets } from '@/lib/server-secrets-cache'

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

    const secrets = await readServerSecrets()
    const openai = createOpenAI({ apiKey: secrets.openai_api_key || process.env.OPENAI_API_KEY || '' })
    const google = createGoogleGenerativeAI({ apiKey: secrets.gemini_api_key || process.env.GEMINI_API_KEY || '' })
    const anthropic = createAnthropic({ apiKey: secrets.anthropic_api_key || process.env.ANTHROPIC_API_KEY || '' })

    const models = [
      { provider: 'openai', model: openai('gpt-4-turbo') },
      { provider: 'google', model: google('gemini-1.5-flash') },
      { provider: 'anthropic', model: anthropic('claude-3-5-sonnet-20240620') }
    ]

    const promptText = `Generate exactly ${count} multiple-choice interview questions for a ${difficulty} level candidate applying for a ${role} position at ${company}.
      
Make the questions realistic, challenging, and strictly relevant to the role and company. 
Include a mix of technical knowledge, situational judgment, and problem-solving if appropriate.
Each question must have exactly 4 options, and provide the index (0-3) of the correct answer, along with a brief explanation.`

    let generatedObject = null
    let lastError = null

    for (const m of models) {
      try {
        const { object } = await generateObject({
          model: m.model,
          schema: questionSchema,
          prompt: promptText,
        })
        generatedObject = object
        break
      } catch (err: any) {
        console.warn(`[mock-tests generate] ${m.provider} failed: ${err.message}`)
        lastError = err
      }
    }

    if (!generatedObject) {
      throw lastError || new Error('All AI providers failed')
    }

    // Deduct credit
    if (gate.user?.id) {
      await deductUserAiCredits(gate.user.id)
    }

    return NextResponse.json({ questions: generatedObject.questions })

  } catch (e) {
    console.error('[mock-tests generate] error:', e)
    return NextResponse.json({ error: 'Failed to generate mock test' }, { status: 500 })
  }
}
