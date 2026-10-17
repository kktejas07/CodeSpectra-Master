import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { z } from 'zod'
import { getUserAiCredits, spendAiCredits } from '@/lib/user-credits'
import { backendPost } from '@/lib/ai/backend'
import { resolveModel } from '@/lib/ai/get-user-model'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'
import {
  GENERATING_STALE_MS,
  RESUME_WINDOW_MS,
  inProgressKey,
  mockTestSessions,
  publicQuestions,
} from '../_sessions'
import { randomUUID } from 'crypto'

export const runtime = 'nodejs'
export const maxDuration = 60 // Allow up to 60 seconds for generating questions

const generateSchema = z.object({
  company: z.string().trim().min(1).max(100),
  role: z.string().trim().min(1).max(100),
  difficulty: z.string().trim().min(1).max(30),
  count: z.number().int().min(1).max(30).default(15), // Generate 15 by default to save time
  /** "Start a new test": abandon the in-progress attempt and generate a fresh one. */
  new_attempt: z.boolean().optional().default(false),
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

/**
 * POST /api/mock-tests/generate { company, role, difficulty, count?, new_attempt? }
 *
 * Idempotent per in-progress attempt: if the caller already has an unsubmitted
 * attempt for this company/role/difficulty (from the last 24h), it is returned
 * as-is (`resumed: true`) — no AI call, no credit. Only a first start, a start
 * after submitting, or `new_attempt: true` ("Start a new test") generates
 * questions and spends a credit.
 */
export async function POST(req: Request) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  let input: z.infer<typeof generateSchema>
  try {
    input = generateSchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: 'Invalid test settings' }, { status: 400 })
  }
  const { company, role, difficulty, count, new_attempt } = input
  const userId = gate.user.id
  const key = inProgressKey(userId, company, role, difficulty)

  let sessionId: string
  try {
    const col = await mockTestSessions()
    const now = Date.now()
    const existing = await col.findOne({ in_progress_key: key }, { projection: { _id: 0 } })
    if (existing) {
      const age = now - Date.parse(existing.created_at)
      const generating = existing.state === 'generating' || existing.questions.length === 0
      const stale = generating ? age > GENERATING_STALE_MS : age > RESUME_WINDOW_MS
      if (!stale && generating) {
        return NextResponse.json(
          { error: 'Your test is still being prepared. Refresh in a moment.', code: 'generating' },
          { status: 409, headers: { 'Retry-After': '5' } },
        )
      }
      if (!stale && !new_attempt && existing.submitted_at === null) {
        // Reload / second tab: hand back the same attempt. No credit spent.
        return NextResponse.json({
          session_id: existing.id,
          questions: publicQuestions(existing.questions),
          created_at: existing.created_at,
          resumed: true,
        })
      }
      // Stale, or the user asked for a new test: abandon the old attempt.
      await col.updateOne(
        { id: existing.id, in_progress_key: key },
        generating
          ? { $unset: { in_progress_key: '' }, $set: { abandoned_at: new Date().toISOString(), state: 'ready' } }
          : { $unset: { in_progress_key: '' }, $set: { abandoned_at: new Date().toISOString() } },
      )
    }

    // Rate-limit only real generations (resumes above are free and unlimited).
    const rl = await rateLimitRedis(`mock-tests:generate:${userId}`, 10, 10 * 60_000)
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Too many tests generated. Try again in a few minutes.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
      )
    }

    const credits = await getUserAiCredits(userId)
    if (credits.balance <= 0) {
      return NextResponse.json(
        { error: 'You have run out of AI Credits for this month. Upgrade to Pro to get more credits!' },
        { status: 402 }, // Payment required
      )
    }

    // Claim the in-progress slot before the AI call: a concurrent request for
    // the same test hits the unique index instead of generating (and paying) twice.
    sessionId = randomUUID()
    try {
      await col.insertOne({
        id: sessionId,
        user_id: userId,
        company,
        role,
        difficulty,
        questions: [],
        state: 'generating',
        in_progress_key: key,
        created_at: new Date().toISOString(),
        submitted_at: null,
      })
    } catch (e) {
      if ((e as { code?: number })?.code === 11000) {
        return NextResponse.json(
          { error: 'Your test is still being prepared. Refresh in a moment.', code: 'generating' },
          { status: 409, headers: { 'Retry-After': '5' } },
        )
      }
      throw e
    }
  } catch (e) {
    console.error('[mock-tests generate] session error:', e)
    return NextResponse.json({ error: 'Failed to generate mock test' }, { status: 500 })
  }

  try {
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

    // Store the questions (answer key stays on the server: the attempt is
    // graded by POST /api/mock-tests/attempts), then charge exactly once.
    const col = await mockTestSessions()
    const stored = await col.updateOne(
      { id: sessionId, user_id: userId, state: 'generating' },
      { $set: { questions: generatedObject.questions, state: 'ready' } },
    )
    if (stored.matchedCount === 0) {
      // Abandoned while generating (e.g. "Start a new test" in another tab).
      return NextResponse.json({ error: 'This test was replaced by a newer one. Refresh the page.' }, { status: 409 })
    }
    // Charged after the questions are stored (atomic; never below zero).
    await spendAiCredits(userId, 1)

    return NextResponse.json({
      session_id: sessionId,
      questions: publicQuestions(generatedObject.questions),
      created_at: new Date().toISOString(),
      resumed: false,
    })

  } catch (e) {
    console.error('[mock-tests generate] error:', e)
    // Release the slot so the next try can generate; nothing was charged.
    await mockTestSessions()
      .then((col) => col.deleteOne({ id: sessionId, user_id: userId, state: 'generating' }))
      .catch((err) => console.error('[mock-tests generate] cleanup failed:', err))
    return NextResponse.json({ error: 'Failed to generate mock test' }, { status: 500 })
  }
}
