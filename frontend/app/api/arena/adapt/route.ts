import { generateText } from 'ai'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/route-auth'
import { getArenaChallenge, type ArenaChallenge } from '@/lib/arena-challenges'

const adaptSchema = z.object({
  title: z.string(),
  shortDescription: z.string(),
  statement: z.array(z.string()).min(1),
  examples: z
    .array(
      z.object({
        input: z.string(),
        output: z.string(),
        explanation: z.string().optional(),
      })
    )
    .min(1),
  constraints: z.array(z.string()).min(1),
})

function extractJsonObject(text: string): unknown {
  const t = text.trim()
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(t)
  const body = fence ? fence[1].trim() : t
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) throw new Error('No JSON object in model output')
  return JSON.parse(body.slice(start, end + 1))
}

/**
 * POST /api/arena/adapt
 * AI-adaptive variant of a seed challenge (falls back to static when no `OPENAI_API_KEY`).
 */
export async function POST(request: Request) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  let body: { challengeId?: string; userStack?: string[]; language?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const challengeId = String(body.challengeId ?? '1')
  const userStack = Array.isArray(body.userStack) ? body.userStack.filter((x) => typeof x === 'string') : []
  const base = getArenaChallenge(challengeId)
  if (!base) {
    return NextResponse.json({ error: 'Unknown challenge' }, { status: 404 })
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({
      source: 'static' as const,
      challenge: base,
      notice:
        'Set OPENAI_API_KEY for AI-adaptive variants. Until then, the curated seed from `lib/arena-challenges.ts` is returned.',
    })
  }

  try {
    const result = await generateText({
      model: 'openai/gpt-4o-mini',
      system:
        'You write concise competitive-programming style prompts. Reply with a single JSON object only — no markdown, no commentary.',
      prompt: `Seed problem (do not copy wording; invent a fresh variant of similar difficulty and topic):
title: ${base.title}
summary: ${base.shortDescription}
difficulty: ${base.difficulty}
category: ${base.category}
User stack hints (may be empty): ${userStack.join(', ') || '(none)'}

Return JSON with exactly these keys:
- title (string)
- shortDescription (string)
- statement (array of 2-4 strings, each a paragraph)
- examples (array of 2-3 objects with input, output, optional explanation strings)
- constraints (array of 2-5 strings)

Keep numbers realistic and ensure one clear correct idea.`,
    })

    const raw = extractJsonObject(result.text)
    const v = adaptSchema.parse(raw)

    const merged: ArenaChallenge = {
      ...base,
      title: v.title,
      shortDescription: v.shortDescription,
      statement: v.statement,
      examples: v.examples,
      constraints: v.constraints,
    }

    return NextResponse.json({
      source: 'ai' as const,
      challenge: merged,
    })
  } catch (e) {
    console.error('[arena/adapt]', e)
    return NextResponse.json({
      source: 'static' as const,
      challenge: base,
      notice: 'AI adaptation failed; served static seed. Check logs and model output.',
    })
  }
}
