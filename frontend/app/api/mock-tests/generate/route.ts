import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { z } from 'zod'
import { getUserAiCredits, deductUserAiCredits } from '@/lib/user-credits'
import { backendPost } from '@/lib/ai/backend'
import { resolveModel } from '@/lib/ai/get-user-model'

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

    const { providerOverride, modelOverride, modelRole } = await resolveModel(gate.user.id, 'grade_model')

    const FALLBACK_PROVIDERS = [
      { provider: 'groq', model: 'openai/gpt-oss-120b' },
      { provider: 'gemini', model: 'gemini-2.0-flash' },
      { provider: 'openai', model: 'gpt-4o-mini' },
      { provider: 'openrouter', model: 'anthropic/claude-3.5-sonnet' },
      { provider: 'opencode', model: 'deepseek-v4-flash-free' },
    ]

    const providers = [{ provider: providerOverride, model: modelOverride, modelRole }]
    for (const fb of FALLBACK_PROVIDERS) {
      if (!providers.find((p) => p.provider === fb.provider)) {
        providers.push({ provider: fb.provider, model: fb.model, modelRole: 'reasoning' })
      }
    }

    const systemMessage = `You are an expert technical interviewer.
Generate exactly ${count} multiple-choice interview questions for a ${difficulty} level candidate applying for a ${role} position at ${company}.
Make the questions realistic, challenging, and strictly relevant to the role and company. 
Include a mix of technical knowledge, situational judgment, and problem-solving if appropriate.
Each question must have exactly 4 options, and provide the index (0-3) of the correct answer, along with a brief explanation.
You MUST return the output as a JSON object with a single root key "questions", which is an array of question objects matching this schema:
{"id": "unique-id", "question": "the question text", "options": ["opt1", "opt2", "opt3", "opt4"], "correctIndex": 0, "explanation": "why"}
DO NOT wrap the response in markdown code blocks, just raw JSON.`

    let generatedObject = null
    let lastError = null

    for (const p of providers) {
      if (!p.provider || !p.model) continue
      try {
        const payload = {
          system_message: systemMessage,
          user_message: `Generate ${count} ${difficulty} ${role} questions for ${company}.`,
          response_format: 'json_object'
        }
        const data = await backendPost<{ message: string }>('/internal/ai/complete', payload, {
          providerOverride: p.provider,
          modelOverride: p.model,
          modelRole: p.modelRole as any,
        })
        
        let parsed: any
        try {
          parsed = JSON.parse(data.message)
        } catch (parseErr) {
          // If the model wrapped in markdown, try to strip it
          const clean = data.message.replace(/```json/g, '').replace(/```/g, '').trim()
          parsed = JSON.parse(clean)
        }
        
        const validated = questionSchema.parse(parsed)
        generatedObject = validated
        break // Success!
      } catch (err: any) {
        lastError = err.message || String(err)
        console.warn(`[mock-tests generate] ${p.provider} failed: ${lastError}`)
      }
    }

    if (!generatedObject) {
      throw new Error(`AI generation failed: ${lastError || 'No AI providers available. Ensure at least one LLM API key is configured in Superadmin → Settings → AI & LLM Keys.'}`)
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
