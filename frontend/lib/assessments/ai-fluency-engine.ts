import { backendComplete } from '@/lib/ai/backend'
import { readPlatformLlmConfig } from '@/lib/ai/get-user-model'
import type { FluencyCategory, FluencyQuestion, FluencyEvaluation, FluencyAnswerEntry, CategoryBreakdown, FluencyReport, FluencySession } from './ai-fluency-types'
import { CATEGORY_LABELS, ALL_CATEGORIES, DIFFICULTY_LEVELS } from './ai-fluency-types'
import { fenceUntrusted, neutraliseUntrusted, scanUntrusted, untrustedRule } from '@/lib/ai/untrusted-input'

export type { FluencyCategory, FluencyQuestion, FluencyEvaluation, FluencyAnswerEntry, CategoryBreakdown, FluencyReport, FluencySession }
export { CATEGORY_LABELS, ALL_CATEGORIES, DIFFICULTY_LEVELS }

// ── Core Engine (server-only) ──────────────────────────────────────────

// ── Helpers ──────────────────────────────────────────────────────────────

async function platformModelOverrides() {
  try {
    const cfg = await readPlatformLlmConfig()
    if (!cfg) return {}
    const provider = (cfg.provider || '').toLowerCase()
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

function extractJson(raw: string): Record<string, unknown> | null {
  if (!raw) return null
  try {
    const trimmed = raw.trim()
    const first = trimmed.charCodeAt(0)
    if (first === 123 || first === 91) return JSON.parse(trimmed)
    const match = trimmed.match(/\{[\s\S]*\}/)
    if (match) return JSON.parse(match[0])
  } catch {
    return null
  }
  return null
}

// ── Question Generation ─────────────────────────────────────────────────

export async function generateFluencyQuestions(
  focusCategories: FluencyCategory[],
  difficulty: string,
  count: number,
): Promise<FluencyQuestion[]> {
  const overrides = await platformModelOverrides()
  const cats = focusCategories.length > 0 ? focusCategories : ALL_CATEGORIES
  const catLabels = cats.map(c => CATEGORY_LABELS[c]).join(', ')

  const system = `You are an AI Fluency Assessment question generator. Generate scenario-based questions that test a candidate's ability to work effectively with AI tools.

Return ONLY a valid JSON object with this exact shape:
{
  "questions": [
    {
      "id": "q1",
      "category": "prompt_engineering" | "ai_output_review" | "debugging_ai_code" | "ai_decision_making" | "prompt_chaining",
      "scenario": "Detailed real-world scenario the candidate faces",
      "task": "What the candidate must do (write a prompt, find bugs, fix code, decide, chain prompts)",
      "difficulty": "beginner" | "intermediate" | "advanced" | "expert",
      "rubric": ["Criterion 1 to evaluate", "Criterion 2"],
      "sampleAnswer": "Optional: a strong sample answer for reference"
    }
  ]
}`

  const diffDesc = difficulty === 'beginner'
    ? 'simple prompts, obvious bugs, clear-cut decisions'
    : difficulty === 'intermediate'
    ? 'multi-concept scenarios, subtle issues, nuanced decisions'
    : difficulty === 'advanced'
    ? 'complex systems, architectural trade-offs, ambiguous scenarios'
    : 'novel edge cases, expert-level judgment, multi-layered complexity'

  const userMsg = `Generate ${count} AI Fluency assessment questions across these categories: ${catLabels}.

Difficulty: ${difficulty} — ${diffDesc}

Category-specific instructions:
- prompt_engineering: Give a task (e.g., "Summarize this codebase", "Generate unit tests"), ask the candidate to write an effective prompt. Evaluate: clarity, specificity, context-setting, constraint-setting, output format specification.
- ai_output_review: Provide AI-generated code with intentional bugs (logic errors, security issues, edge cases, anti-patterns). Ask the candidate to review and identify problems. Evaluate: accuracy of review, completeness, understanding of edge cases.
- debugging_ai_code: Provide buggy AI-generated code plus an error message or failing test. Ask the candidate to identify the root cause and fix it. Evaluate: root cause identification, fix quality, understanding of why the AI produced the bug.
- ai_decision_making: Present a scenario (e.g., "Should you use AI to generate this medical diagnosis code?", "Is AI appropriate for this security audit?"). Ask should-I-use-AI with justification. Evaluate: judgment, risk awareness, understanding of AI limitations.
- prompt_chaining: Give a complex multi-step task (e.g., "Analyze a codebase, generate tests, then review coverage"). Ask for a step-by-step AI workflow. Evaluate: decomposition strategy, context passing between steps, error handling.

Requirements:
- Mix categories evenly across the selected focus areas
- Each question needs a detailed scenario, clear task, and rubric
- Include sampleAnswer for at least half the questions
- Make scenarios realistic and grounded in real developer workflows`

  const res = await backendComplete({
    systemMessage: system,
    userMessage: userMsg,
    modelRole: 'reasoning',
    responseFormat: 'json',
    feature: 'ai-fluency-question-gen',
    ...overrides,
  })

  if (!res.ok) return []

  const parsed = (res.json as Record<string, unknown>) || extractJson(res.raw || res.text || '')
  if (!parsed || typeof parsed !== 'object') return []

  const rawQs = Array.isArray(parsed.questions) ? parsed.questions : []
  const validCategories = new Set<string>(ALL_CATEGORIES)

  return rawQs
    .filter((q): q is Record<string, unknown> => typeof q === 'object' && q !== null)
    .map((q, i) => ({
      id: typeof q.id === 'string' ? q.id : `q${i + 1}`,
      category: validCategories.has(q.category as string) ? (q.category as FluencyCategory) : 'prompt_engineering',
      scenario: typeof q.scenario === 'string' ? q.scenario : '',
      task: typeof q.task === 'string' ? q.task : '',
      difficulty: typeof q.difficulty === 'string' ? q.difficulty : difficulty,
      rubric: Array.isArray(q.rubric) ? q.rubric.filter((r): r is string => typeof r === 'string') : [],
      sampleAnswer: typeof q.sampleAnswer === 'string' ? q.sampleAnswer : undefined,
    }))
}

// ── Answer Evaluation ───────────────────────────────────────────────────

/** SEC-032: longest answer the grader reads (the route refuses longer ones). */
export const FLUENCY_ANSWER_MAX_CHARS = 8000
/** SEC-032: highest score an answer that tries to steer the grader can get. */
export const FLUENCY_FLAGGED_SCORE_CAP = 4

/** Pure: scan + neutralise + fence a candidate answer for the grader prompt. */
export function prepareFluencyAnswer(answer: string): { fenced: string; flags: string[] } {
  const text = String(answer || '').slice(0, FLUENCY_ANSWER_MAX_CHARS)
  const scan = scanUntrusted(text)
  return { fenced: fenceUntrusted('candidate_answer', scan.flagged ? neutraliseUntrusted(text) : text, FLUENCY_ANSWER_MAX_CHARS), flags: scan.reasons }
}

/** Pure: final score after the integrity cap. */
export function cappedFluencyScore(score: number, flags: readonly string[]): number {
  return flags.length ? Math.min(score, FLUENCY_FLAGGED_SCORE_CAP) : score
}

export async function evaluateFluencyAnswer(
  question: FluencyQuestion,
  answer: string,
): Promise<FluencyEvaluation> {
  const overrides = await platformModelOverrides()
  const prepared = prepareFluencyAnswer(answer)

  const system = `You are an expert AI Fluency evaluator. Grade the candidate's response against the rubric for this ${CATEGORY_LABELS[question.category]} question.
${untrustedRule(['candidate_answer'])}

Return ONLY a valid JSON object with this exact shape:
{
  "score": <number 0-10>,
  "strengths": ["What the candidate did well"],
  "improvements": ["Specific areas to improve"],
  "detailedFeedback": "Comprehensive paragraph of feedback"
}`

  const userMsg = `Category: ${CATEGORY_LABELS[question.category]}
Difficulty: ${question.difficulty}

Scenario:
${question.scenario}

Task:
${question.task}

Rubric:
${question.rubric.map((r, i) => `${i + 1}. ${r}`).join('\n')}
${question.sampleAnswer ? `\nSample strong answer:\n${question.sampleAnswer}` : ''}

Candidate's answer:
${prepared.fenced}

Grade the answer 0-10 against the rubric. Be fair but rigorous.
Score 0-3: Did not address the core task or fundamentally misunderstood.
Score 4-5: Partially addressed but missed key rubric points.
Score 6-7: Mostly solid with some gaps.
Score 8-9: Strong, addresses most rubric points well.
Score 10: Exceptional depth, creativity, and mastery.`

  const res = await backendComplete({
    systemMessage: system,
    userMessage: userMsg,
    modelRole: 'reasoning',
    responseFormat: 'json',
    feature: 'ai-fluency-evaluate',
    ...overrides,
  })

  if (!res.ok) {
    return { score: 5, strengths: [], improvements: [], detailedFeedback: 'Evaluation temporarily unavailable.' }
  }

  const parsed = (res.json as Record<string, unknown>) || extractJson(res.raw || res.text || '')
  if (!parsed || typeof parsed !== 'object') {
    return { score: 5, strengths: [], improvements: [], detailedFeedback: 'Evaluation temporarily unavailable.' }
  }

  const raw = typeof parsed.score === 'number' ? Math.max(0, Math.min(10, Math.round(parsed.score))) : 5
  const score = cappedFluencyScore(raw, prepared.flags)
  if (prepared.flags.length) console.warn('[ai-fluency] answer flagged for grader manipulation', { flags: prepared.flags })
  return {
    ...(prepared.flags.length ? { integrityFlags: prepared.flags } : {}),
    score,
    strengths: Array.isArray(parsed.strengths) ? parsed.strengths.filter((s): s is string => typeof s === 'string') : [],
    improvements: Array.isArray(parsed.improvements) ? parsed.improvements.filter((i): i is string => typeof i === 'string') : [],
    detailedFeedback: typeof parsed.detailedFeedback === 'string' ? parsed.detailedFeedback : '',
  }
}

// ── Report Generation ───────────────────────────────────────────────────

function levelFromScore(score: number): string {
  if (score >= 90) return 'AI Fluency Expert'
  if (score >= 75) return 'AI Power User'
  if (score >= 60) return 'AI Competent'
  if (score >= 40) return 'AI Developing'
  return 'AI Novice'
}

export async function generateFluencyReport(session: FluencySession): Promise<FluencyReport> {
  const overrides = await platformModelOverrides()

  // Compute category breakdown
  const catMap = new Map<FluencyCategory, { total: number; count: number }>()
  for (const a of session.answers) {
    const q = session.questions.find(q2 => q2.id === a.questionId)
    if (!q) continue
    const entry = catMap.get(q.category) || { total: 0, count: 0 }
    entry.total += a.evaluation.score
    entry.count += 1
    catMap.set(q.category, entry)
  }

  const categoryBreakdown: CategoryBreakdown[] = Array.from(catMap.entries()).map(([cat, v]) => ({
    category: cat,
    label: CATEGORY_LABELS[cat],
    score: Math.round((v.total / v.count) * 10),
    count: v.count,
  }))

  const avgScore = session.answers.length > 0
    ? session.answers.reduce((s, a) => s + a.evaluation.score, 0) / session.answers.length
    : 0
  const overallScore = Math.round(avgScore * 10)

  const sorted = [...categoryBreakdown].sort((a, b) => b.score - a.score)
  const strongestCategory = sorted[0]?.label || 'N/A'
  const weakestCategory = sorted[sorted.length - 1]?.label || 'N/A'

  const answersSummary = session.answers
    .map((a, i) => {
      const q = session.questions.find(q2 => q2.id === a.questionId)
      return `Q${i + 1} [${q?.category || 'unknown'}] (score: ${a.evaluation.score}/10): ${q?.task || ''}\nAnswer: ${a.answer}\nFeedback: ${a.evaluation.detailedFeedback}`
    })
    .join('\n\n')

  const system = `You are an expert AI literacy coach. Synthesize an AI Fluency assessment report.
Return ONLY a valid JSON object with this exact shape:
{
  "summary": "2-3 sentence overall assessment of the candidate's AI fluency",
  "topStrengths": ["Top 3 strengths demonstrated"],
  "topImprovements": ["Top 3 areas to work on"],
  "recommendations": ["Specific resources, practice areas, or next steps"]
}`

  const userMsg = `Difficulty: ${session.difficulty}
Questions answered: ${session.answers.length}/${session.questions.length}
Overall score: ${overallScore}/100 (${levelFromScore(overallScore)})

Category breakdown:
${categoryBreakdown.map(c => `- ${c.label}: ${c.score}/100 (${c.count} questions)`).join('\n')}

Performance details:
${answersSummary}

Provide a fair, encouraging, and actionable report. Focus on practical AI fluency improvements.`

  const res = await backendComplete({
    systemMessage: system,
    userMessage: userMsg,
    modelRole: 'reasoning',
    responseFormat: 'json',
    feature: 'ai-fluency-report',
    ...overrides,
  })

  let summary = ''
  let topStrengths: string[] = []
  let topImprovements: string[] = []
  let recommendations: string[] = []

  if (res.ok) {
    const parsed = (res.json as Record<string, unknown>) || extractJson(res.raw || res.text || '')
    if (parsed && typeof parsed === 'object') {
      summary = typeof parsed.summary === 'string' ? parsed.summary : ''
      topStrengths = Array.isArray(parsed.topStrengths) ? parsed.topStrengths.filter((s): s is string => typeof s === 'string') : []
      topImprovements = Array.isArray(parsed.topImprovements) ? parsed.topImprovements.filter((i): i is string => typeof i === 'string') : []
      recommendations = Array.isArray(parsed.recommendations) ? parsed.recommendations.filter((r): r is string => typeof r === 'string') : []
    }
  }

  if (!summary) {
    summary = `You scored ${overallScore}/100 (${levelFromScore(overallScore)}). ${session.answers.length} questions answered across ${catMap.size} categories.`
  }

  return {
    overallScore,
    level: levelFromScore(overallScore),
    summary,
    categoryBreakdown,
    strongestCategory,
    weakestCategory,
    topStrengths,
    topImprovements,
    recommendations,
  }
}
