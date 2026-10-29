/**
 * Generate interview-style challenge prompts (prose — not executable).
 *
 * Because nothing can execute these, they are inserted as `review_status:
 * 'draft'` and only appear once an admin approves them at
 * /dashboard/admin/practice-review. That is the agreed rule: auto-publish only
 * what the sandbox can verify.
 *
 * The structural check here is deliberately strict about the field the learner
 * actually reads (the description): a vague one-liner is worse than an empty
 * slot, since an admin would have to rewrite it anyway.
 *
 * No `server-only` import — loaded by scripts/backfill-challenges.ts under tsx.
 */
import { backendComplete } from '@/lib/ai/backend'
import { jsonFromCompletion, unwrapPayloadJson } from '@/lib/ai/json-payload'

export const CHALLENGE_TYPES = ['technical', 'system_design', 'behavioral', 'code_review', 'debugging'] as const
export type ChallengeType = typeof CHALLENGE_TYPES[number]

export const MIN_DESCRIPTION_CHARS = 80

export interface GeneratedChallenge {
  id: string
  slug: string
  title: string
  type: ChallengeType
  difficulty: 'easy' | 'medium' | 'hard'
  duration_minutes: number
  success_rate: number
  description: string
  starter_code: string | null
  review_status: 'draft'
  source: 'ai'
}

export type ChallengeNormalizeResult =
  | { ok: true; challenge: GeneratedChallenge }
  | { ok: false; reason: string }

export function slugifyTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80)
}

export function normalizeGeneratedChallenge(raw: unknown): ChallengeNormalizeResult {
  // Same transport envelope / model wrapper as the arena generator.
  const r = unwrapPayloadJson(raw) ?? (raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null)
  if (!r) return { ok: false, reason: 'not an object' }
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

  const title = str(r.title)
  if (title.length < 8 || title.length > 120) return { ok: false, reason: 'title missing or out of range' }

  const description = str(r.description)
  if (description.length < MIN_DESCRIPTION_CHARS) {
    return { ok: false, reason: `description too short (${description.length} chars, need ${MIN_DESCRIPTION_CHARS})` }
  }

  const type = str(r.type).toLowerCase()
  if (!CHALLENGE_TYPES.includes(type as ChallengeType)) {
    return { ok: false, reason: `type must be one of ${CHALLENGE_TYPES.join(', ')}` }
  }

  const difficulty = str(r.difficulty).toLowerCase()
  if (!['easy', 'medium', 'hard'].includes(difficulty)) return { ok: false, reason: 'difficulty must be easy|medium|hard' }

  const duration = Number(r.duration_minutes ?? r.duration ?? 15)
  if (!Number.isFinite(duration) || duration < 5 || duration > 90) {
    return { ok: false, reason: 'duration_minutes must be between 5 and 90' }
  }

  const slug = slugifyTitle(title)
  if (!slug) return { ok: false, reason: 'could not derive a slug' }

  const starter = str(r.starter_code)
  return {
    ok: true,
    challenge: {
      id: `ch_ai_${slug}`,
      slug,
      title,
      type: type as ChallengeType,
      difficulty: difficulty as GeneratedChallenge['difficulty'],
      duration_minutes: Math.round(duration),
      success_rate: 50,
      description,
      starter_code: starter || null,
      review_status: 'draft',
      source: 'ai',
    },
  }
}

const SYSTEM_PROMPT = `You write interview practice prompts for an engineering assessment platform.

Return ONE JSON object, no prose:
{
  "title": string,               // specific: "Rewrite a Blocking Node Route", not "Node Question"
  "type": "technical" | "system_design" | "behavioral" | "code_review" | "debugging",
  "difficulty": "easy" | "medium" | "hard",
  "duration_minutes": number,     // 5-90
  "description": string,          // >= 80 chars: the actual prompt the learner answers,
                                  // self-contained, states what a strong answer covers
  "starter_code": string          // only for code_review, otherwise omit
}

Rules:
- Original prompts only: no famous interview questions copied verbatim.
- The description must be answerable in the stated duration, with no external links.
- No meta commentary, no scoring rubric, no answer key.`

export type ChallengeGenerateResult =
  | { ok: true; challenge: GeneratedChallenge; attempts: number }
  | { ok: false; reason: string; attempts: number }

export async function generateChallenge(opts: {
  type?: ChallengeType
  difficulty?: 'easy' | 'medium' | 'hard'
  /** Narrows the subject so repeated runs stop producing the same title. */
  topicHint?: string
  maxAttempts?: number
} = {}): Promise<ChallengeGenerateResult> {
  const maxAttempts = opts.maxAttempts ?? 2
  let lastReason = 'not attempted'

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const userMessage = [
      `Type: ${opts.type ?? 'technical'}.`,
      `Difficulty: ${opts.difficulty ?? 'medium'}.`,
      opts.topicHint ? `Focus this challenge specifically on: ${opts.topicHint}.` : '',
      attempt > 1 ? `Your previous attempt was rejected: ${lastReason}. Fix that.` : '',
      'Use a title you have not used before.',
      'Write one new challenge as JSON.',
    ].filter(Boolean).join('\n')

    let raw: unknown
    try {
      const res = await backendComplete({
        systemMessage: SYSTEM_PROMPT,
        userMessage,
        responseFormat: 'json',
        feature: 'practice-content-challenges',
      })
      if (!res.ok) return { ok: false, reason: `LLM call failed: ${res.text || 'no output'}`, attempts: attempt }
      raw = jsonFromCompletion(res)
    } catch (e) {
      lastReason = `unparseable output: ${e instanceof Error ? e.message : String(e)}`
      continue
    }

    const parsed = normalizeGeneratedChallenge(raw)

    if (!parsed.ok) { lastReason = parsed.reason; continue }
    return { ok: true, challenge: parsed.challenge, attempts: attempt }
  }

  return { ok: false, reason: lastReason, attempts: maxAttempts }
}
