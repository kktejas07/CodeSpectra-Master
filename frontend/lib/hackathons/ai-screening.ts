/**
 * Phase J2 — AI screening scores over J1 evidence packs.
 *
 * Server-only: calls backendComplete (free LLM fallback chain). Never import
 * from client code — import only from API route handlers.
 *
 * ponytail: reuses the backendComplete + platform-LLM-config + extractJson
 * pattern from lib/interviews/ai-mock-engine.ts (mirrored locally so this
 * module stays dependency-light and unit-testable without pulling the
 * interview engine); no new deps; every LLM failure degrades to a thrown
 * error the route turns into a per-submission ok/error entry.
 */

import { backendComplete } from '@/lib/ai/backend'
import type { EvidencePack } from './repo-audit'

// ── Criteria ────────────────────────────────────────────────────────────────

export interface ScreeningCriterion {
  key: string
  label: string
}

export const SCREENING_CRITERIA: ScreeningCriterion[] = [
  { key: 'relevance', label: 'Problem relevance' },
  { key: 'innovation', label: 'Innovation & originality' },
  { key: 'implementation', label: 'Implementation quality' },
  { key: 'ai_use', label: 'Effective AI use' },
  { key: 'ux', label: 'User experience' },
  { key: 'completeness', label: 'Completeness' },
]

/** Per-criterion weights. All 1 for J2; configurable in J3. */
export const DEFAULT_WEIGHTS: Record<string, number> = {
  relevance: 1,
  innovation: 1,
  implementation: 1,
  ai_use: 1,
  ux: 1,
  completeness: 1,
}

// ── Types ───────────────────────────────────────────────────────────────────

export interface ScreeningScore {
  key: string
  score: number
  citation: string
  missing?: string
}

export interface ScreeningResult {
  scores: ScreeningScore[]
  total: number
  maxTotal: number
  notes: string
  model: string
  screenedAt: string
}

export interface ScreeningInput {
  description?: string
  techStack?: string
  videoUrl?: string
  liveUrl?: string
}

// ── Local mirrors of ai-mock-engine helpers (keeps this module light) ──────

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

async function platformModelOverrides(): Promise<{
  providerOverride?: string
  modelOverride?: string
  endpointOverride?: string
  apiKeyOverride?: string
}> {
  try {
    const { readPlatformLlmConfig } = await import('@/lib/ai/get-user-model')
    const cfg = await readPlatformLlmConfig()
    if (!cfg) return {}
    const provider = ((cfg as { provider?: string }).provider || '').toLowerCase()
    if (!provider) return {}
    const rawKey = (cfg as { api_key?: string }).api_key
    const apiKey = typeof rawKey === 'string' && !rawKey.includes('•') ? rawKey.trim() : ''
    const out: { providerOverride?: string; modelOverride?: string; endpointOverride?: string; apiKeyOverride?: string } = {
      providerOverride: provider,
      modelOverride: (cfg as { model?: string }).model,
    }
    const endpoint = (cfg as { endpoint?: string }).endpoint
    if (endpoint) out.endpointOverride = endpoint
    if (apiKey) out.apiKeyOverride = apiKey
    return out
  } catch {
    return {}
  }
}

// ── Pure scoring helpers (unit-tested, no LLM) ──────────────────────────────

/** Clamp any value to an integer 1–5. Non-numbers default to 2 (no evidence). */
export function clampScore(n: unknown): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return 2
  return Math.max(1, Math.min(5, Math.round(n)))
}

function safeStr(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/**
 * Normalize raw LLM output into one score per criterion. Scores with empty
 * citations are dropped to 2 with missing='no evidence cited'; criteria the
 * model omitted are filled the same way.
 */
export function normalizeScores(raw: unknown): ScreeningScore[] {
  const arr = Array.isArray(raw) ? raw : []
  return SCREENING_CRITERIA.map((c) => {
    const found = arr.find(
      (e): e is Record<string, unknown> =>
        !!e && typeof e === 'object' && (e as Record<string, unknown>).key === c.key,
    ) as Record<string, unknown> | undefined
    let score = clampScore(found ? found.score : undefined)
    const citation = safeStr(found ? found.citation : undefined).trim()
    let missing = safeStr(found ? found.missing : undefined).trim() || undefined
    if (!citation) {
      score = 2
      missing = 'no evidence cited'
    }
    return {
      key: c.key,
      score,
      citation,
      ...(missing ? { missing } : {}),
    }
  })
}

/** Weighted sum + max. Rounded to 1dp so fractional J3 weights stay clean. */
export function scoreTotals(
  scores: ScreeningScore[],
  weights: Record<string, number> = DEFAULT_WEIGHTS,
): { total: number; maxTotal: number } {
  let total = 0
  let maxTotal = 0
  for (const s of scores || []) {
    const w = typeof weights[s.key] === 'number' && Number.isFinite(weights[s.key])
      ? (weights[s.key] as number)
      : 1
    total += (typeof s.score === 'number' ? s.score : 0) * w
    maxTotal += 5 * w
  }
  return {
    total: Math.round(total * 10) / 10,
    maxTotal: Math.round(maxTotal * 10) / 10,
  }
}

/**
 * Blend AI screening total with the human-judge average. Returns null when
 * no human scores exist yet (J3 calls this at render time).
 */
export function blendScores(
  aiTotal: number,
  humanAvg: number | null | undefined,
  aiWeight = 0.4,
): number | null {
  if (humanAvg === null || humanAvg === undefined || !Number.isFinite(humanAvg)) return null
  if (!Number.isFinite(aiTotal)) return null
  const w = Number.isFinite(aiWeight) ? Math.max(0, Math.min(1, aiWeight)) : 0.4
  return Math.round((aiTotal * w + (humanAvg as number) * (1 - w)) * 10) / 10
}

// ── LLM screening ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT =
  'You are a hackathon screening judge. Score ONLY what the evidence supports. ' +
  'Each criterion 1–5. Every score MUST cite specific evidence (file/commit/metric from the pack). ' +
  'If no evidence supports a criterion above 2, cap it at 2 and say what was missing.'

function buildUserPrompt(pack: EvidencePack, sub: ScreeningInput): string {
  const criteria = SCREENING_CRITERIA.map((c) => `- ${c.key}: ${c.label}`).join('\n')
  const desc = (sub.description || '').trim() || '(no description provided)'
  const tech = (sub.techStack || '').trim() || '(not specified)'
  const video = (sub.videoUrl || '').trim() || '(none)'
  const live = (sub.liveUrl || '').trim() || '(none)'
  let packJson = '{}'
  try {
    packJson = JSON.stringify(pack)
  } catch {
    packJson = '{"error":"evidence pack unserializable"}'
  }
  return (
    `Score this hackathon submission against the 6 criteria below (1–5 each).\n\n` +
    `Criteria:\n${criteria}\n\n` +
    `Submission:\n- Description: ${desc}\n- Tech stack: ${tech}\n- Demo video: ${video}\n- Live URL: ${live}\n\n` +
    `Evidence pack (JSON, automated repo facts — trust the numbers, do not invent):\n${packJson}\n\n` +
    `Return ONLY a valid JSON object with this exact shape:\n` +
    `{"scores": [{"key": "<criterion key>", "score": 1-5, "citation": "<specific evidence>", "missing": "<optional: what was missing>"}], "notes": "<1-2 sentence overall take>"}`
  )
}

/**
 * Score one evidence pack with a single backendComplete call. Throws when the
 * model call fails or returns unparseable output (the route records this as
 * a per-submission error); partial outputs are normalized defensively.
 */
export async function screenEvidencePack(
  pack: EvidencePack,
  submission: ScreeningInput,
): Promise<ScreeningResult> {
  const overrides = await platformModelOverrides()
  const res = await backendComplete({
    systemMessage: SYSTEM_PROMPT,
    userMessage: buildUserPrompt(pack, submission || {}),
    modelRole: 'reasoning',
    responseFormat: 'json',
    feature: 'hackathon-ai-screening',
    ...overrides,
  })
  if (!res.ok) {
    throw new Error('screening model call failed')
  }
  const parsed =
    (res.json as Record<string, unknown> | null) ||
    extractJson(res.raw || (typeof res.text === 'string' ? res.text : '') || '')
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('screening model returned unparseable output')
  }
  const scores = normalizeScores((parsed as Record<string, unknown>).scores)
  const { total, maxTotal } = scoreTotals(scores)
  const notes = safeStr((parsed as Record<string, unknown>).notes).trim()
  return {
    scores,
    total,
    maxTotal,
    notes,
    model: overrides.modelOverride || 'platform-default',
    screenedAt: new Date().toISOString(),
  }
}
