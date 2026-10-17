import { NextResponse, type NextRequest } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { backendComplete } from '@/lib/ai/backend'
import { normalizeBankQuestion, questionBank, bankContentHash, deriveTitleFromQuestion, type BankQuestionDoc } from '@/lib/question-bank'
import { BRANCHES, DEGREE_TYPES } from '@/lib/engineering-catalog'
import { buildTypeInstructions, buildExtraFieldHint } from '@/lib/question-gen-prompt'
import { isCodingType } from '@/lib/question-types'

export const runtime = 'nodejs'

const MAX_PER_RUN = 1000
const FALLBACKS: { provider: string; model: string; endpoint?: string }[] = [
  { provider: 'groq', model: 'llama-3.3-70b-versatile', endpoint: 'https://api.groq.com/openai/v1' },
  { provider: 'gemini', model: 'gemini-2.0-flash' },
  { provider: 'openai', model: 'gpt-4o-mini' },
  { provider: 'openrouter', model: 'anthropic/claude-3.5-sonnet' },
]

interface GenBody {
  branch?: string
  degree_type?: string
  subject?: string
  difficulty?: 'Easy' | 'Medium' | 'Hard' | 'mixed'
  types?: string[]
  count?: number
}

function buildPrompt(body: GenBody): string {
  const branch = BRANCHES.find((b) => b.id === body.branch)
  const degree = DEGREE_TYPES.find((d) => d.id === body.degree_type)
  const topic = body.subject || branch?.topics[0] || 'core fundamentals'
  const types = body.types?.length ? body.types : ['mcq']
  const difficulty =
    body.difficulty === 'mixed' ? 'a balanced mix of Easy, Medium and Hard' : String(body.difficulty || 'Medium')
  const count = Math.min(body.count || 25, 50)
  return [
    `You are writing technical assessment questions for ${degree?.label || 'engineering'} campus hiring at a top MNC.`,
    `Branch: ${branch?.label || body.branch || 'General engineering'}.`,
    `Focus subject/topic: ${topic}.`,
    `Difficulty: ${difficulty}. Question types allowed: ${types.join(', ')}.`,
    `Generate exactly ${count} distinct, MNC-interview-standard questions.`,
    `TITLE RULE (mandatory): the "title" field MUST be a concise human-readable summary of that specific question (4-12 words, e.g. "Binary Search worst-case time complexity"), unique per question. NEVER use "Q1", "Question 2", "1.1" or any numbering scheme as a title — a numbered title is an automatic rejection.`,
    `TYPE RULES: ${buildTypeInstructions(types)}${buildExtraFieldHint(types)}`,
    `Respond with a JSON array ONLY (no markdown fences). Each object: {"title": short label, "question": full prompt, "type", "options": [string], "answer": correct answer or explanation, "explanation": brief explanation, "difficulty": "Easy"|"Medium"|"Hard", "marks": number 5-20, "subject": "${topic}", "branch": "${body.branch || ''}", "degree_type": "${body.degree_type || ''}", "tags": [topic tags]}.`,
  ].join('\n')
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

export async function POST(request: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  try {
    let body: GenBody
    try {
      body = (await request.json()) as GenBody
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    const count = Math.min(MAX_PER_RUN, Math.max(1, Number(body.count) || 1))
    if (!body.branch && !body.subject) {
      return NextResponse.json({ error: 'Provide at least a branch or subject' }, { status: 400 })
    }

    const col = await questionBank()
    const existing = await col.find({}, { projection: { _id: 0 } }).toArray()
    const seen = new Set(existing.map((d: any) => bankContentHash(d)))
    const seenTitles = new Set(existing.map((d: any) => (d.title || '').toLowerCase().replace(/\s+/g, ' ').trim()))

    const inserted: BankQuestionDoc[] = []
    let skipped = 0
    const errors: string[] = []
    const requestBatchSize = Math.min(count, 50)

    let lastError = ''
    let json: unknown = null
    for (const fb of FALLBACKS) {
      try {
        const res = await backendComplete({
          systemMessage: 'You generate precise, non-duplicate assessment questions. Output strict JSON.',
          userMessage: buildPrompt({ ...body, count: requestBatchSize }),
          responseFormat: 'json',
          providerOverride: fb.provider,
          modelOverride: fb.model,
          endpointOverride: fb.endpoint,
        })
        if (res.ok && res.json !== undefined) {
          json = res.json
          break
        }
        lastError = res.text || `HTTP failure with ${fb.provider}`
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e)
      }
      console.error('[question-bank/generate] provider', fb.provider, 'failed:', lastError)
    }

    if (json === null) {
      return NextResponse.json({ error: `AI generation failed for all providers. Last error: ${lastError}` }, { status: 502 })
    }

    const rawItems = Array.isArray(json) ? (json as unknown as Record<string, unknown>[]) : []
    const prompt = buildPrompt({ ...body, count: requestBatchSize })
    if (!rawItems.length) {
      // Last resort: retry parsing the raw text.
      const res = await backendComplete({
        systemMessage: 'You generate precise, non-duplicate assessment questions. Output strict JSON.',
        userMessage: prompt,
        responseFormat: 'json',
        providerOverride: FALLBACKS[0].provider,
        modelOverride: FALLBACKS[0].model,
        endpointOverride: FALLBACKS[0].endpoint,
      })
      if (res.ok && typeof res.text === 'string') {
        for (const it of parseQuestions(res.text)) rawItems.push(it)
      }
    }

    const toInsert: BankQuestionDoc[] = []
    for (const item of rawItems.slice(0, count)) {
      const doc = normalizeBankQuestion({ ...(item as Record<string, unknown>), source: 'ai' })
      if (!doc) { skipped++; continue }
      doc.source = 'ai'
      doc.review_status = 'draft' // unreviewed AI output never goes straight into exams
      if (isCodingType(doc.type) && !doc.tech_stack?.length) {
        doc.tech_stack = { cse: ['Python', 'Java', 'C++'], it: ['JavaScript', 'SQL'], ai_ds: ['Python', 'SQL'] }[doc.branch || ''] || ['Python']
      }
      const titleKey = (doc.title || '').toLowerCase().replace(/\s+/g, ' ').trim()
      if (titleKey && seenTitles.has(titleKey)) {
        doc.title = deriveTitleFromQuestion(doc.question)
      }
      const hash = bankContentHash(doc)
      if (seen.has(hash)) { skipped++; continue }
      seen.add(hash)
      seenTitles.add((doc.title || '').toLowerCase().replace(/\s+/g, ' ').trim())
      toInsert.push(doc)
    }
    if (toInsert.length) await col.insertMany(toInsert)
    inserted.push(...toInsert)

    if (inserted.length === 0 && skipped === 0 && rawItems.length === 0) {
      errors.push('AI returned an empty or malformed response')
    }
    return NextResponse.json({ inserted: inserted.length, requested: count, skipped, errors })
  } catch (e) {
    console.error('[question-bank/generate] error:', e)
    return NextResponse.json({ error: 'Failed to generate questions' }, { status: 500 })
  }
}
