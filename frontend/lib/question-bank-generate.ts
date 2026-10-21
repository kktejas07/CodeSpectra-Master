/**
 * AI question-bank generator — one batch of questions → dedupe → drafts.
 * Extracted from app/api/question-bank/generate (the admin "Generate" button);
 * the question bot (lib/question-bot/run.ts) calls the same path, adding a
 * domain tag, extra authoring rules and a quality gate.
 *
 * Every question saved here is `source: 'ai'`, `review_status: 'draft'`: it
 * never reaches an exam until a reviewer approves it.
 */
import 'server-only'
import { backendComplete } from '@/lib/ai/backend'
import { estimateTokens } from '@/lib/ai/usage-meter'
import { costUsd } from '@/lib/agent/metering'
import { normalizeBankQuestion, questionBank, bankContentHash, bankTitleKey, deriveTitleFromQuestion, existingBankKeys, withBankKeys, type BankQuestionDoc } from '@/lib/question-bank'
import { BRANCHES, DEGREE_TYPES } from '@/lib/engineering-catalog'
import { buildTypeInstructions, buildExtraFieldHint } from '@/lib/question-gen-prompt'
import { isCodingType } from '@/lib/question-types'
import { knowledgeOnLibraryChange } from '@/lib/rag/hooks'
import { logger } from '@/lib/logger'

const FALLBACKS: { provider: string; model: string; endpoint?: string }[] = [
  { provider: 'groq', model: 'llama-3.3-70b-versatile', endpoint: 'https://api.groq.com/openai/v1' },
  { provider: 'gemini', model: 'gemini-2.0-flash' },
  { provider: 'openai', model: 'gpt-4o-mini' },
  { provider: 'openrouter', model: 'anthropic/claude-3.5-sonnet' },
]

export interface GenerateRequest {
  branch?: string
  degree_type?: string
  subject?: string
  difficulty?: 'Easy' | 'Medium' | 'Hard' | 'mixed'
  types?: string[]
  count?: number
  /** Question-bot domain: stamped on every saved row and named in the prompt. */
  domain?: { id: string; label: string }
  /** Extra authoring rules appended to the prompt (trusted, server-written). */
  extraInstructions?: string
  /** Extra JSON fields the model must return (prompt hint). */
  extraFields?: string
}

/** Decide whether a (non-duplicate) candidate is saved; may enrich `doc` in place. */
export type CandidateGate = (raw: Record<string, unknown>, doc: BankQuestionDoc) => Promise<{ keep: boolean; reason?: string }>

export type GenerateResult =
  | { ok: true; inserted: BankQuestionDoc[]; requested: number; skipped: number; dropped: number; dropReasons: string[]; errors: string[]; costUsd: number }
  | { ok: false; status: number; error: string; costUsd: number }

export function buildGeneratePrompt(body: GenerateRequest): string {
  const branch = BRANCHES.find((b) => b.id === body.branch)
  const degree = DEGREE_TYPES.find((d) => d.id === body.degree_type)
  const topic = body.subject || branch?.topics[0] || 'core fundamentals'
  const types = body.types?.length ? body.types : ['mcq']
  const difficulty =
    body.difficulty === 'mixed' ? 'a balanced mix of Easy, Medium and Hard' : String(body.difficulty || 'Medium')
  const count = Math.min(body.count || 25, 50)
  return [
    `You are writing technical assessment questions for ${degree?.label || 'engineering'} campus hiring at a top MNC.`,
    body.domain && !branch ? `Skill area: ${body.domain.label}.` : `Branch: ${branch?.label || body.branch || 'General engineering'}.`,
    `Focus subject/topic: ${topic}.`,
    `Difficulty: ${difficulty}. Question types allowed: ${types.join(', ')}.`,
    `Generate exactly ${count} distinct, MNC-interview-standard questions.`,
    `TITLE RULE (mandatory): the "title" field MUST be a concise human-readable summary of that specific question (4-12 words, e.g. "Binary Search worst-case time complexity"), unique per question. NEVER use "Q1", "Question 2", "1.1" or any numbering scheme as a title — a numbered title is an automatic rejection.`,
    `TYPE RULES: ${buildTypeInstructions(types)}${buildExtraFieldHint(types)}`,
    body.extraInstructions || '',
    `Respond with a JSON array ONLY (no markdown fences). Each object: {"title": short label, "question": full prompt, "type", "options": [string], "answer": correct answer or explanation, "explanation": brief explanation, "difficulty": "Easy"|"Medium"|"Hard", "marks": number 5-20, "subject": "${topic}", "branch": "${body.branch || ''}", "degree_type": "${body.degree_type || ''}", "tags": [topic tags]${body.extraFields ? `, ${body.extraFields}` : ''}}.`,
  ].filter(Boolean).join('\n')
}

function parseQuestions(text: string): Record<string, unknown>[] {
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim()
  const start = cleaned.indexOf('[')
  const end = cleaned.lastIndexOf(']')
  if (start === -1 || end === -1 || end <= start) return []
  try {
    const arr = JSON.parse(cleaned.slice(start, end + 1))
    return Array.isArray(arr) ? arr : []
  } catch { return [] }
}

/** Estimated cost of one completion (real tokens when the provider reports them). */
function callCost(prompt: string, res: { usage?: { input_tokens: number; output_tokens: number }; model?: string; text?: string; raw?: string; json?: unknown }, model: string): number {
  const out = res.raw || res.text || (res.json !== undefined ? JSON.stringify(res.json) : '')
  return costUsd([{
    provider: '',
    model: res.model || model,
    inputTokens: res.usage?.input_tokens ?? estimateTokens(prompt),
    outputTokens: res.usage?.output_tokens ?? estimateTokens(out),
  }])
}

/** Accept a top-level array or { questions: [...] }-style objects. */
function asItems(json: unknown): Record<string, unknown>[] {
  if (Array.isArray(json)) return json as Record<string, unknown>[]
  if (json && typeof json === 'object') {
    for (const k of ['questions', 'items', 'data']) {
      const v = (json as Record<string, unknown>)[k]
      if (Array.isArray(v)) return v as Record<string, unknown>[]
    }
  }
  return []
}

/**
 * Generate up to `maxCount` questions (one AI batch of ≤ 50), drop duplicates
 * of the bank, run the optional gate and save the rest as drafts.
 */
export async function generateBankQuestions(body: GenerateRequest, opts: { maxCount?: number; gate?: CandidateGate; feature?: string } = {}): Promise<GenerateResult> {
  const count = Math.min(opts.maxCount ?? 1000, Math.max(1, Number(body.count) || 1))
  const col = await questionBank()
  const errors: string[] = []
  const requestBatchSize = Math.min(count, 50)
  const prompt = buildGeneratePrompt({ ...body, count: requestBatchSize })
  const systemMessage = 'You generate precise, non-duplicate assessment questions. Output strict JSON.'
  let spent = 0

  let lastError = ''
  let json: unknown = null
  for (const fb of FALLBACKS) {
    try {
      const res = await backendComplete({
        cache: false, // AGT-022: a generator must never replay a cached batch
        systemMessage,
        userMessage: prompt,
        responseFormat: 'json',
        providerOverride: fb.provider,
        modelOverride: fb.model,
        endpointOverride: fb.endpoint,
        feature: opts.feature || 'question-bank-generate',
      })
      if (res.ok) spent += callCost(`${systemMessage}\n${prompt}`, res, fb.model)
      if (res.ok && res.json !== undefined) {
        json = res.json
        break
      }
      lastError = res.text || `HTTP failure with ${fb.provider}`
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e)
    }
    logger.warn(`[question-bank/generate] provider ${fb.provider} failed: ${String(lastError).slice(0, 200)}`)
  }

  if (json === null) {
    return { ok: false, status: 502, error: `AI generation failed for all providers. Last error: ${String(lastError).slice(0, 300)}`, costUsd: spent }
  }

  const rawItems = asItems(json)
  if (!rawItems.length) {
    // Last resort: retry parsing the raw text.
    const res = await backendComplete({
      cache: false, // AGT-022: a generator must never replay a cached batch
      systemMessage,
      userMessage: prompt,
      responseFormat: 'json',
      providerOverride: FALLBACKS[0].provider,
      modelOverride: FALLBACKS[0].model,
      endpointOverride: FALLBACKS[0].endpoint,
      feature: opts.feature || 'question-bank-generate',
    })
    if (res.ok) spent += callCost(`${systemMessage}\n${prompt}`, res, FALLBACKS[0].model)
    if (res.ok && typeof res.text === 'string') {
      for (const it of parseQuestions(res.text)) rawItems.push(it)
    }
  }

  // CORE-031: check only these candidates against the bank (indexed $in), not the whole bank.
  const items = rawItems.slice(0, count).filter((it) => it && typeof it === 'object' && !Array.isArray(it))
  const candidates = items.map((item) => normalizeBankQuestion({ ...item, source: 'ai' }))
  const known = await existingBankKeys(
    col,
    candidates.filter(Boolean).map((d) => bankContentHash(d!)),
    candidates.filter(Boolean).map((d) => bankTitleKey(d!.title)),
  )
  const seen = known.hashes
  const seenTitles = known.titles
  const toInsert: BankQuestionDoc[] = []
  let skipped = 0
  let dropped = 0
  const dropReasons: string[] = []
  for (const [i, item] of items.entries()) {
    const doc = candidates[i]
    if (!doc) { skipped++; continue }
    doc.source = 'ai'
    doc.review_status = 'draft' // unreviewed AI output never goes straight into exams
    if (body.domain) (doc as BankQuestionDoc & { domain?: string }).domain = body.domain.id
    if (isCodingType(doc.type) && !doc.tech_stack?.length) {
      doc.tech_stack = { cse: ['Python', 'Java', 'C++'], it: ['JavaScript', 'SQL'], ai_ds: ['Python', 'SQL'] }[doc.branch || ''] || ['Python']
    }
    const titleKey = (doc.title || '').toLowerCase().replace(/\s+/g, ' ').trim()
    if (titleKey && seenTitles.has(titleKey)) {
      doc.title = deriveTitleFromQuestion(doc.question)
    }
    const hash = bankContentHash(doc)
    if (seen.has(hash)) { skipped++; continue }
    if (opts.gate) {
      const verdict = await opts.gate(item, doc)
      if (!verdict.keep) {
        dropped++
        if (verdict.reason) dropReasons.push(verdict.reason)
        continue
      }
    }
    const finalHash = bankContentHash(doc) // the gate may fix the answer / difficulty
    if (finalHash !== hash && seen.has(finalHash)) { skipped++; continue }
    seen.add(hash)
    seen.add(finalHash)
    seenTitles.add(bankTitleKey(doc.title))
    toInsert.push(withBankKeys(doc))
  }
  if (toInsert.length) await col.insertMany(toInsert)
  knowledgeOnLibraryChange('question', toInsert.map((q) => q.id))

  if (toInsert.length === 0 && skipped === 0 && dropped === 0 && rawItems.length === 0) {
    errors.push('AI returned an empty or malformed response')
  }
  return { ok: true, inserted: toInsert, requested: count, skipped, dropped, dropReasons, errors, costUsd: Math.round(spent * 1e6) / 1e6 }
}
