/**
 * TypeSafe Jev — second-opinion verifier on top of LLM grading.
 *
 * Jev is a decision-only model (no text generation): it answers typed
 * yes/no (`noul`) questions with calibrated probabilities. It canNOT grade —
 * it verifies. After the LLM grader produces awarded/feedback, we ask Jev two
 * questions IN ONE request (parallel, near-free: input tokens only):
 *
 *   1. concept_shown — does the candidate's answer demonstrate the core concept?
 *   2. score_fits    — is the awarded score consistent with the answer quality?
 *
 * The caller downgrades to human review when Jev disagrees with high
 * confidence. Every failure mode (no key, timeout, non-2xx, bad shape)
 * returns null — fail-closed toward `requires_human_review`, never toward a
 * silent pass. The key is server-side only (platform_settings.secrets
 * `typesafe_api_key`, env `TYPESAFE_API_KEY` bootstrap) and never leaves the
 * server; this module must never be imported by client components.
 */

import { readServerSecrets, isMaskedSecret } from '@/lib/server-secrets-cache'

const JEV_ENDPOINT = 'https://api.typesafe.ai/v1/systemone'
const JEV_MODEL = 'jev-latest'
const JEV_TIMEOUT_MS = 20000

export interface JevVerdict {
  /** Agree with the LLM grade (both questions lean yes). */
  agree: boolean
  /** Mean probability across the two questions, 0..1. */
  confidence: number
  conceptProb: number
  scoreProb: number
  model: string
}

/** Resolve the Jev key: Mongo secrets first, env bootstrap second. */
export async function readJevKey(): Promise<string> {
  try {
    const secrets = await readServerSecrets()
    const fromDb = secrets.typesafe_api_key?.trim()
    if (fromDb && !isMaskedSecret(fromDb)) return fromDb
  } catch {
    /* ignore — fall through to env */
  }
  return process.env.TYPESAFE_API_KEY?.trim() || ''
}

export function isJevConfigured(): Promise<boolean> {
  return readJevKey().then((k) => k.length > 0)
}

function asProb(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : null
}

/**
 * Decide whether Jev agrees with an LLM grade. Pure + exported for tests.
 *
 * Verifies the GRADE, not the ANSWER: a wrong answer correctly scored 0 is a
 * fine grade. Only MISALIGNMENT (concept-correct answer scored low, or a wrong
 * answer scored high) or the model's own inconsistency check flags review.
 */
export function jevAgrees(input: {
  conceptProb: number
  scoreProb: number
  awarded: number
  maxPoints: number
}): boolean {
  const { conceptProb, scoreProb, awarded, maxPoints } = input
  const goodAnswer = conceptProb >= 0.5
  const highAward = maxPoints > 0 ? awarded >= maxPoints * 0.5 : false
  const aligned = goodAnswer === highAward
  return aligned && scoreProb >= 0.5
}

/**
 * Verify one LLM-produced grade. Returns null when verification is
 * unavailable (no key / network / shape) — the caller must then flag the
 * grade for human review rather than trusting it blindly.
 */
export async function verifyGrade(input: {
  questionText: string
  modelAnswer: string
  candidateAnswer: string
  awarded: number
  maxPoints: number
}): Promise<JevVerdict | null> {
  const apiKey = await readJevKey()
  if (!apiKey) return null

  const { questionText, modelAnswer, candidateAnswer, awarded, maxPoints } = input
  // Cap state size: Jev context is 32k tokens; keep grading payloads small.
  const clip = (s: string, n: number) => (s || '').slice(0, n)
  const state =
    `QUESTION: ${clip(questionText, 2000)}\n` +
    `MODEL ANSWER: ${clip(modelAnswer || '(none provided)', 2000)}\n` +
    `CANDIDATE ANSWER: ${clip(candidateAnswer, 4000)}\n` +
    `AWARDED: ${awarded} of ${maxPoints}`

  let res: Response
  try {
    res = await fetch(JEV_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: JEV_MODEL,
        state,
        questions: {
          concept_shown: {
            type: 'noul',
            instructions:
              'Does the candidate answer demonstrate the core concept required by the question (semantically, not word-for-word)?',
          },
          score_fits: {
            type: 'noul',
            instructions: `Is the awarded score of ${awarded} out of ${maxPoints} consistent with the quality of the candidate answer relative to the model answer?`,
          },
        },
      }),
      signal: AbortSignal.timeout(JEV_TIMEOUT_MS),
    })
  } catch {
    return null
  }
  if (!res.ok) return null

  let json: Record<string, unknown>
  try {
    json = (await res.json()) as Record<string, unknown>
  } catch {
    return null
  }
  const answers = (json.answers ?? {}) as Record<string, Record<string, unknown>>
  const conceptProb = asProb(answers.concept_shown?.noul)
  const scoreProb = asProb(answers.score_fits?.noul)
  if (conceptProb === null || scoreProb === null) return null

  // Verify the GRADE, not the ANSWER — see jevAgrees for the rationale.
  const agree = jevAgrees({ conceptProb, scoreProb, awarded, maxPoints })

  const confidence = (conceptProb + scoreProb) / 2
  return {
    agree,
    confidence,
    conceptProb,
    scoreProb,
    model: String(json.model || JEV_MODEL),
  }
}
