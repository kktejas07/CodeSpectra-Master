import { backendComplete } from '@/lib/ai/backend'

export const OBJECTIVE_TYPES = ['multiple-choice', 'mcq', 'true_false', 'multiple_response', 'fill_blanks']

export class GradeRateLimitedError extends Error {
  retryAfterSec: number
  constructor(retryAfterSec: number) {
    super('Rate limit exceeded on AI grading')
    this.name = 'GradeRateLimitedError'
    this.retryAfterSec = retryAfterSec
  }
}

export interface GradeResult {
  recommended: number
  verdict: 'correct' | 'partial' | 'incorrect'
  feedback: string
}

function normalizeSet(value: string): Set<string> {
  return new Set(value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean))
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
    const bracket = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (bracket) {
      const inner = bracket[1].trim()
      try { return JSON.parse(inner) } catch { /* fall through */ }
      const innerMatch = inner.match(/\{[\s\S]*\}/)
      if (innerMatch) return JSON.parse(innerMatch[0])
    }
  } catch {
    return null
  }
  return null
}

/**
 * Grade a single answer. Objective questions (MCQ/true-false/multiple-response/
 * fill-blanks) are graded deterministically — zero LLM cost, no 502 risk.
 * Free-text answers (code/descriptive) call the configured LLM from Superadmin
 * settings (via backendComplete → platform_settings.llm) and tolerate loose JSON.
 */
export async function gradeAnswer(input: {
  questionText: string
  candidateAnswer: string
  modelAnswer: string
  type: string
  maxPoints: number
}): Promise<GradeResult> {
  const { questionText, candidateAnswer, modelAnswer, type, maxPoints } = input
  const t = (type || '').toLowerCase()
  const isObjective = OBJECTIVE_TYPES.includes(t)

  if (isObjective) {
    const userSet = normalizeSet(candidateAnswer)
    const correctSet = normalizeSet(modelAnswer)

    if (t === 'multiple_response') {
      const correct = userSet.size > 0 && userSet.size === correctSet.size && [...userSet].every(v => correctSet.has(v))
      return {
        recommended: correct ? maxPoints : 0,
        verdict: correct ? 'correct' : 'incorrect',
        feedback: correct
          ? 'All correct choices selected.'
          : userSet.size === 0
            ? 'No choice selected for a multi-select question.'
            : [...userSet].filter(v => !correctSet.has(v)).length > 0
              ? 'One or more selected choices are not part of the correct answer.'
              : 'An incomplete selection — some correct choices were missed.',
      }
    }

    if (t === 'fill_blanks' || t === 'fill-blank' || t === 'fill_blank') {
      const ok = userSet.size === correctSet.size ? [...correctSet].every(v => userSet.has(v)) : false
      const partial = [...correctSet].filter(v => userSet.has(v)).length
      const recommended = ok ? maxPoints : partial > 0 ? Math.max(1, Math.round((partial / Math.max(1, correctSet.size)) * maxPoints)) : 0
      return {
        recommended,
        verdict: ok ? 'correct' : partial > 0 ? 'partial' : 'incorrect',
        feedback: ok
          ? 'Fill-in-the-blank answer matches the expected value.'
          : partial > 0
            ? `Partially correct — matches ${partial} of ${correctSet.size} expected value(s).`
            : 'Blank answer does not match the expected value.',
      }
    }

    const correct = userSet.size === 1 && correctSet.size > 0 && userSet.has([...correctSet][0])
    return {
      recommended: correct ? maxPoints : 0,
      verdict: correct ? 'correct' : 'incorrect',
      feedback: correct ? 'Correct answer selected.' : 'Selected answer does not match the correct answer.',
    }
  }

  // ── Free-text (code / descriptive): grade with the configured LLM ──
  const isCoding = t.replace(/[-_]/g, '') === 'coding' || t === 'code'
  const prompt = `You are a strict, fair technical examiner. Grade the candidate's ${isCoding ? 'code' : 'written'} answer against the model answer and the question.

QUESTION:
${questionText}

MODEL ANSWER / RUBRIC:
${modelAnswer || '(No model answer provided — judge based on the question and general correctness.)'}

MAX POINTS: ${maxPoints}

CANDIDATE'S ANSWER:
${candidateAnswer}

Respond ONLY as JSON with this exact shape:
{
  "awarded": <integer 0..${maxPoints}>,  // points justified by the answer
  "verdict": "correct" | "partial" | "incorrect",
  "feedback": "<2-4 sentences explaining where the answer went right/wrong, what is missing, and how to improve>"
}

Be strict but fair. Grade what is actually there, not potential. If it is code, check it actually compiles/runs and solves the task — note errors, edge cases missed, and correctness.`

  const res = await backendComplete({
    systemMessage: 'You are a strict, accurate technical examiner that grades candidate answers. Return only valid JSON.',
    userMessage: prompt,
    responseFormat: 'json',
  })

  if (!res.ok) {
    const raw = res.text || ''
    if (raw.includes('429') || /rate limit/i.test(raw)) {
      const m = raw.match(/in (\d+)s/)
      throw new GradeRateLimitedError(m ? Number(m[1]) : 60)
    }
    throw new Error('AI grading backend error')
  }

  const parsed = (res.ok && res.json ? res.json as Record<string, unknown> : null) || extractJson(res.raw || res.text || '')
  const awarded = Number((parsed as any)?.awarded)
  const recommended = Number.isFinite(awarded) ? Math.max(0, Math.min(maxPoints, Math.round(awarded))) : 0
  const feedback = String((parsed as any)?.feedback || '').trim()
  const verdict = ['correct', 'partial', 'incorrect'].includes(String((parsed as any)?.verdict))
    ? String((parsed as any)?.verdict)
    : recommended >= maxPoints ? 'correct' : recommended > 0 ? 'partial' : 'incorrect'

  if (!feedback && !Number.isFinite(awarded)) {
    throw new Error('AI returned no structured feedback.')
  }

  return { recommended, verdict: verdict as GradeResult['verdict'], feedback }
}
