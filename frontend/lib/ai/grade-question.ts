import { backendComplete } from '@/lib/ai/backend'
import { readPlatformLlmConfig } from '@/lib/ai/get-user-model'
import { answersEqual, multisetEqual, canonicalObjectiveType } from '@/lib/grading'
import { executeOnce } from '@/lib/piston'
import { verifyGrade, isJevConfigured } from '@/lib/ai/jev'

export const OBJECTIVE_TYPES = ['multiple-choice', 'mcq', 'true_false', 'multiple_response', 'fill_blanks']

/** Map a free-form provider name to a backend enum the AI router understands. */
function normalizeProvider(provider: string): string {
  const lower = provider.toLowerCase()
  if (lower === 'opencode' || lower === 'omnirouter') return 'opencode'
  if (lower === 'openrouter') return 'openrouter'
  if (lower === 'gemini') return 'gemini'
  if (lower === 'anthropic') return 'anthropic'
  if (lower === 'openai') return 'openai'
  return lower // groq, deepseek, nvidia, etc. pass through
}

/**
 * Honor the Superadmin LLM config (Settings → AI & LLM Provider) for grading so
 * the configured model/provider is used instead of the backend's hard-coded
 * default (`fast` → gemini). Empty values fall back to backend defaults.
 */
async function platformModelOverrides(): Promise<{
  providerOverride?: string
  modelOverride?: string
  endpointOverride?: string
  apiKeyOverride?: string
}> {
  try {
    const cfg = await readPlatformLlmConfig()
    if (!cfg) return {}
    const provider = normalizeProvider(cfg.provider || '')
    if (!provider) return {}
    const apiKey = cfg.api_key && typeof cfg.api_key === 'string' && !cfg.api_key.includes('•') ? cfg.api_key.trim() : ''
    return {
      providerOverride: provider,
      modelOverride: cfg.model,
      ...(cfg.endpoint ? { endpointOverride: cfg.endpoint } : {}),
      ...(apiKey ? { apiKeyOverride: apiKey } : {}),
    }
  } catch {
    return {}
  }
}

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
  confidence?: number
  requires_human_review?: boolean
  /** Jev second opinion (free-text LLM grades only). Null = unverified. */
  jev_agree?: boolean | null
  jev_confidence?: number | null
  /** Which LLM graded this (provider/model from the fallback chain). Null = deterministic or cache-hit. */
  graded_by?: string | null
}

function normalizeSet(value: string): Set<string> {
  return new Set(value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean))
}

/** Split a comma list into non-empty trimmed parts. */
function parts(value: string): string[] {
  return (value || '').split(',').map(s => s.trim()).filter(Boolean)
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
  options?: string[]
  testCases?: { input: string; output: string }[]
}): Promise<GradeResult> {
  const { questionText, candidateAnswer, modelAnswer, type, maxPoints, options, testCases } = input
  const t = (type || '').toLowerCase()
  const objective = canonicalObjectiveType(t)
  const isObjective = objective !== 'free_text'

  if (isObjective) {
    const userSet = normalizeSet(candidateAnswer)
    const correctSet = normalizeSet(modelAnswer)

    if (objective === 'multiple_response') {
      const correct = multisetEqual(candidateAnswer, modelAnswer, options)
      return {
        recommended: correct ? maxPoints : 0,
        verdict: correct ? 'correct' : 'incorrect',
        feedback: correct
          ? 'All correct choices selected.'
          : userSet.size === 0
            ? 'No choice selected for a multi-select question.'
            : parts(candidateAnswer).some(v => !correctSet.has(v.toLowerCase().trim()))
              ? 'One or more selected choices are not part of the correct answer.'
              : 'An incomplete selection — some correct choices were missed.',
      }
    }

    if (objective === 'fill_blanks') {
      const userP = parts(candidateAnswer)
      const correctP = parts(modelAnswer)
      const matched = correctP.filter((c) => userP.some((u) => answersEqual(u, c, options))).length
      const full = correctP.length > 0 && matched === correctP.length && userP.length === correctP.length
      const recommended = full ? maxPoints : matched > 0 ? Math.max(1, Math.round((matched / Math.max(1, correctP.length)) * maxPoints)) : 0
      return {
        recommended,
        verdict: full ? 'correct' : matched > 0 ? 'partial' : 'incorrect',
        feedback: full
          ? 'Fill-in-the-blank answer matches the expected value.'
          : matched > 0
            ? `Partially correct — matches ${matched} of ${correctP.length} expected value(s).`
            : 'Blank answer does not match the expected value.',
      }
    }

    const correct = answersEqual(candidateAnswer, modelAnswer, options)
    return {
      recommended: correct ? maxPoints : 0,
      verdict: correct ? 'correct' : 'incorrect',
      feedback: correct ? 'Correct answer selected.' : 'Selected answer does not match the correct answer.',
    }
  }

  // ── Free-text (code / descriptive): grade with the configured LLM ──
  // ponytail: the free-first fallback chain walks every keyed provider, so a
  // dead/quota-hit key transparently grades on the next one. graded_by records
  // the winner for auditability in the review UI.
  const isCoding = t.replace(/[-_]/g, '') === 'coding' || t === 'code'
  
  let finalAwarded: number | undefined = undefined
  let prompt = ''

  if (isCoding && testCases && testCases.length > 0) {
    let codeValue = candidateAnswer
    let codeLang = 'python'
    try {
      const parsed = JSON.parse(candidateAnswer)
      if (parsed && typeof parsed === 'object') {
        codeValue = parsed.code || ''
        codeLang = parsed.language || 'python'
      }
    } catch {
      // Ignore, leave as text
    }

    let passed = 0
    const results = []
    for (const tc of testCases) {
      try {
        const runRes = await executeOnce({
          language: codeLang,
          source: codeValue,
          stdin: tc.input || ''
        })
        const out = (runRes.run.stdout || '').trim()
        const expected = (tc.output || '').trim()
        
        if (runRes.run.code === 0 && out === expected) {
          passed++
          results.push({ input: tc.input, expected, actual: out, pass: true })
        } else {
          results.push({ input: tc.input, expected, actual: out, error: runRes.run.stderr, pass: false })
        }
      } catch (err) {
        results.push({ input: tc.input, expected: tc.output, actual: '', error: String(err), pass: false })
      }
    }
    
    finalAwarded = Math.round((passed / testCases.length) * maxPoints)

    prompt = `You are a strict, fair technical examiner evaluating a candidate's code.
The code was physically executed against ${testCases.length} hidden test cases and passed ${passed}.

Code Language: ${codeLang}
Code:
${codeValue}

Test Results:
${JSON.stringify(results, null, 2)}

Provide concise feedback (2-3 sentences) on why the code failed (if any) and its overall quality/time-complexity.
Since the score is auto-calculated based on test passes, you MUST output "awarded": ${finalAwarded}.
Determine a confidence score (0.0 to 1.0) on your feedback.
If the code is malicious or highly suspicious, set requires_human_review to true.

Respond ONLY as JSON with this exact shape:
{
  "awarded": ${finalAwarded},
  "verdict": "${finalAwarded === maxPoints ? 'correct' : finalAwarded > 0 ? 'partial' : 'incorrect'}",
  "feedback": "<concise feedback>",
  "confidence": <float 0.0-1.0>,
  "requires_human_review": <boolean>
}`
  } else {
    prompt = `You are a strict, fair technical examiner. Your task is to evaluate a candidate's ${isCoding ? 'code' : 'written'} answer.
DO NOT simply compare strings. Instead, evaluate the underlying concepts.

QUESTION:
${questionText}

MODEL ANSWER / REFERENCE:
${modelAnswer || '(No model answer provided — judge based on the question and general correctness.)'}

MAX POINTS: ${maxPoints}

CANDIDATE'S ANSWER:
${candidateAnswer}

EVALUATION PROCESS:
1. Identify the core concepts, required knowledge, and potential incorrect claims from the Reference.
2. Evaluate if the Candidate's Answer demonstrates understanding of those core concepts, even if they use different words.
3. Determine a confidence score (0.0 to 1.0). If the answer is highly ambiguous, confusing, or you are unsure if a concept maps correctly, output a lower confidence.
4. If confidence is below 0.75, set requires_human_review to true.
5. Provide concise feedback explaining what concepts were missing or incorrect.

GRADING RULES:
- IGNORE whitespace, formatting, variable naming (unless explicitly asked).
- Deduct points ONLY for missing concepts or factually incorrect statements.
- For SQL specifically: Focus on logic equivalence (SELECT, FROM, WHERE, JOINs) rather than formatting.
- If the candidate's answer is semantically equivalent to the model answer, award full points.

Respond ONLY as JSON with this exact shape:
{
  "awarded": <integer 0..${maxPoints}>,
  "verdict": "correct" | "partial" | "incorrect",
  "feedback": "<2-4 sentences explaining missing/incorrect concepts>",
  "confidence": <float 0.0-1.0>,
  "requires_human_review": <boolean>
}

Be strict but fair. Grade what is actually there, not potential. If it is code, check it actually compiles/runs and solves the task — note errors, edge cases missed, and correctness.`
  }

  const res = await backendComplete({
    systemMessage: 'You are a strict, accurate technical examiner that grades candidate answers. Return only valid JSON.',
    userMessage: prompt,
    modelRole: 'reasoning',
    responseFormat: 'json',
    ...(await platformModelOverrides()),
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
  
  // Use finalAwarded if set (for executed code), otherwise parsed awarded
  const awarded = finalAwarded !== undefined ? finalAwarded : Number((parsed as any)?.awarded)
  const recommended = Number.isFinite(awarded) ? Math.max(0, Math.min(maxPoints, Math.round(awarded))) : 0
  
  const feedback = String((parsed as any)?.feedback || '').trim()
  const verdict = ['correct', 'partial', 'incorrect'].includes(String((parsed as any)?.verdict))
    ? String((parsed as any)?.verdict)
    : recommended >= maxPoints ? 'correct' : recommended > 0 ? 'partial' : 'incorrect'

  const confidence = typeof (parsed as any)?.confidence === 'number' ? (parsed as any).confidence : 1.0
  let requires_human_review = !!(parsed as any)?.requires_human_review || confidence < 0.75
  const graded_by =
    res.provider && res.model
      ? `${res.provider}/${res.model}`
      : res.provider || res.model || null

  // ── Jev second opinion (LLM-judged scores only) ──
  // Execution-scored code (finalAwarded set) skips this: the score is measured,
  // not judged, so there is nothing to second-guess. For LLM-judged grades Jev
  // can only ESCALATE to human review, never clear the grader's own caution.
  // No Jev key configured → skip silently and trust the LLM's own confidence
  // gate below (otherwise free-text could never auto-complete without a key).
  // Jev configured but unreachable/disagreeing → escalate (fail-closed).
  // One extra API call per free-text grade, paced by the caller.
  let jev_agree: boolean | null = null
  let jev_confidence: number | null = null
  if (finalAwarded === undefined) {
    let jevOn = false
    try {
      jevOn = await isJevConfigured()
    } catch {
      jevOn = false
    }
    if (!jevOn) {
      // No verifier configured — LLM confidence (< 0.75) already flags above.
    } else {
      try {
        const jev = await verifyGrade({
          questionText,
          modelAnswer,
          candidateAnswer,
          awarded: recommended,
          maxPoints,
        })
        if (jev) {
          jev_agree = jev.agree
          jev_confidence = jev.confidence
          if (!jev.agree && jev.confidence >= 0.7) requires_human_review = true
        } else {
          requires_human_review = true
        }
      } catch {
        requires_human_review = true
      }
    }
  }

  if (!feedback && !Number.isFinite(awarded)) {
    // Graceful fallback — return 0 points instead of crashing the whole review page
    console.warn('[ai-grade] LLM returned unstructured response, falling back to 0')
    return { recommended: 0, verdict: 'incorrect', feedback: 'AI could not evaluate this answer — manual review recommended.', confidence: 0.0, requires_human_review: true, jev_agree, jev_confidence, graded_by }
  }

  return { recommended, verdict: verdict as GradeResult['verdict'], feedback, confidence, requires_human_review, jev_agree, jev_confidence, graded_by }
}
