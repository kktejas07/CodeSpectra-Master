/**
 * Generate arena challenges and publish only what provably works.
 *
 * Arena grades a complete program (stdin → stdout, see §5.1 of
 * docs/superpowers/specs/2026-10-29-practice-content-pipeline-design.md), so a
 * candidate is accepted only when its own reference solution reproduces every
 * expected output. An LLM writing plausible-looking problems whose expected
 * output its solution never prints is the normal case, not the edge case —
 * without this gate you get 100 unsolvable challenges instead of 6.
 *
 * No `import 'server-only'`: this module is also loaded by `scripts/backfill-arena.ts`
 * under plain tsx, where that marker package cannot resolve (see #397).
 */
import { backendComplete } from '@/lib/ai/backend'
import { executeOnce } from '@/lib/piston'
import { ARENA_STARTERS, type ArenaChallenge } from '@/lib/arena-challenges'

export type ArenaExecutor = (args: { source: string; stdin: string }) => Promise<string>

/** Runs the candidate's reference solution in JavaScript through the sandbox. */
export const pistonExecutor: ArenaExecutor = async ({ source, stdin }) => {
  const res = await executeOnce({ language: 'javascript', source, stdin })
  if (res.run.stderr?.trim()) throw new Error(res.run.stderr.trim().slice(0, 300))
  return res.run.stdout ?? ''
}

export function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80)
}

/** LLM output often arrives wrapped in a fence or with prose around it. */
export function parseJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = (fenced ? fenced[1] : text).trim()
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start === -1 || end <= start) throw new Error('No JSON object in model output')
  return JSON.parse(body.slice(start, end + 1))
}

/**
 * The JSON from a completed call.
 *
 * `backendComplete` returns the parsed object in `json` when the provider
 * honoured `responseFormat: 'json'` and may leave `text` empty — reading only
 * `text` rejected every candidate with "No JSON object in model output" and the
 * whole backfill stopped after six failures (2026-10-29). Prefer `json`, fall
 * back to parsing `raw`/`text`.
 */
export function jsonFromCompletion(res: { json?: unknown; raw?: string; text?: string }): unknown {
  if (res.json && typeof res.json === 'object' && Object.keys(res.json as object).length > 0) return res.json
  for (const candidate of [res.raw, res.text]) {
    if (!candidate) continue
    try { return parseJsonObject(candidate) } catch { /* try the next */ }
  }
  throw new Error('No JSON object in model output')
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(asString).filter(Boolean)
  if (typeof v === 'string' && v.trim()) return [v.trim()]
  return []
}

function normalizeOutput(s: string): string {
  return s.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trim()
}

/**
 * Find the payload inside whatever the provider/backend wrapped it in.
 *
 * Observed live (2026-10-29): the completion arrives as
 *   { ok, raw, json, usage, provider, model }
 * i.e. the transport envelope, with the challenge one level down in `json`.
 * Models add their own wrappers on top of that (`{challenge:{…}}`, `{data:{…}}`,
 * `[{…}]`). This walks down instead of guessing one level, so a wrapper never
 * costs a run.
 */
const PAYLOAD_KEYS = ['json', 'data', 'challenge', 'problem', 'result', 'payload', 'output', 'content', 'response', 'message', 'text']

export function unwrapGeneratedJson(raw: unknown, depth = 0): Record<string, unknown> | null {
  if (depth > 6) return null
  if (typeof raw === 'string') {
    try { return unwrapGeneratedJson(JSON.parse(raw), depth + 1) } catch { return null }
  }
  if (!raw || typeof raw !== 'object') return null
  const obj = Array.isArray(raw) ? raw[0] : raw
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null

  const rec = obj as Record<string, unknown>
  if (typeof rec.title === 'string') return rec

  for (const key of PAYLOAD_KEYS) {
    if (!(key in rec)) continue
    const inner = unwrapGeneratedJson(rec[key], depth + 1)
    if (inner) return inner
  }

  const keys = Object.keys(rec)
  if (keys.length === 1) {
    const inner = unwrapGeneratedJson(rec[keys[0]], depth + 1)
    if (inner) return inner
  }

  // Nothing recognisable inside: hand it back so the rejection can name the keys.
  return rec
}

export type NormalizeResult =
  | { ok: true; challenge: ArenaChallenge }
  | { ok: false; reason: string }

/**
 * Validate + shape a model response. Rejects anything that cannot be graded:
 * no reference solution, fewer than two cases, or a case with no expected output.
 */
export function normalizeGeneratedArena(raw: unknown): NormalizeResult {
  const ctx = unwrapGeneratedJson(raw)
  if (!ctx) return { ok: false, reason: 'not an object' }
  const r = ctx
  // Every rejection names the keys that arrived: without it a systemic shape
  // mismatch looks identical to a model that ignored the contract.
  const got = () => ` (received keys: ${Object.keys(r).slice(0, 12).join(', ') || 'none'})`

  const title = asString(r.title).trim()
  if (title.length < 8 || title.length > 120) return { ok: false, reason: `title missing or out of range${got()}` }

  const difficulty = asString(r.difficulty).toLowerCase()
  if (!['easy', 'medium', 'hard'].includes(difficulty)) return { ok: false, reason: `difficulty must be easy|medium|hard${got()}` }

  const solutionCode = asString(r.solutionCode ?? r.solution_code ?? r.solution)
  if (solutionCode.trim().length < 20) return { ok: false, reason: `reference solution missing${got()}` }

  const rawExamples = Array.isArray(r.examples) ? r.examples : []
  const examples = rawExamples
    .map((e) => {
      const ex = (e ?? {}) as Record<string, unknown>
      return {
        input: asString(ex.input ?? ex.stdin),
        output: asString(ex.output ?? ex.expected_stdout ?? ex.expected),
        explanation: asString(ex.explanation) || undefined,
      }
    })
    .filter((e) => e.input.trim().length > 0 && e.output.trim().length > 0)

  const testCases = (Array.isArray(r.testCases ?? r.test_cases) ? (r.testCases ?? r.test_cases) as unknown[] : [])
    .map((t) => {
      const tc = (t ?? {}) as Record<string, unknown>
      return {
        stdin: asString(tc.stdin ?? tc.input),
        expected_stdout: asString(tc.expected_stdout ?? tc.expected ?? tc.output),
      }
    })
    .filter((t) => t.stdin.trim().length > 0 && t.expected_stdout.trim().length > 0)

  if (examples.length < 2) return { ok: false, reason: 'needs at least 2 worked examples with input and output' }

  const statement = asStringArray(r.statement)
  if (statement.length === 0) return { ok: false, reason: 'statement missing' }

  const slug = slugify(asString(r.slug) || title)
  if (!slug) return { ok: false, reason: 'could not derive a slug' }

  const challenge: ArenaChallenge = {
    id: `gen-${slug}`,
    slug,
    title,
    shortDescription: asString(r.shortDescription ?? r.short_description).trim() || statement[0].slice(0, 120),
    difficulty: difficulty as ArenaChallenge['difficulty'],
    category: asString(r.category).trim() || 'General',
    points: difficulty === 'hard' ? 300 : difficulty === 'medium' ? 200 : 100,
    solved: 0,
    attempts: 0,
    statement,
    examples,
    testCases,
    constraints: asStringArray(r.constraints),
    defaultCode: { ...ARENA_STARTERS },
    solutionCode,
  }
  return { ok: true, challenge }
}

/** Every case the user can be graded on: shown examples first, then hidden ones. */
export function gradedCases(challenge: ArenaChallenge): { stdin: string; expected: string }[] {
  return [
    ...(challenge.examples ?? []).map((e) => ({ stdin: e.input, expected: e.output })),
    ...(challenge.testCases ?? []).map((t) => ({ stdin: t.stdin, expected: t.expected_stdout })),
  ]
}

export type VerifyResult = { ok: true } | { ok: false; reason: string }

/**
 * The publish gate: the reference solution must reproduce every expected output.
 * A candidate that fails is never stored as published.
 */
export async function verifyArenaChallenge(
  challenge: ArenaChallenge,
  exec: ArenaExecutor = pistonExecutor,
): Promise<VerifyResult> {
  const cases = gradedCases(challenge)
  if (cases.length < 2) return { ok: false, reason: 'no gradable cases' }
  if (!challenge.solutionCode) return { ok: false, reason: 'no reference solution' }

  for (const [i, c] of cases.entries()) {
    let actual: string
    try {
      actual = await exec({ source: challenge.solutionCode, stdin: c.stdin })
    } catch (e) {
      return { ok: false, reason: `case ${i + 1} crashed: ${e instanceof Error ? e.message : String(e)}` }
    }
    if (normalizeOutput(actual) !== normalizeOutput(c.expected)) {
      return {
        ok: false,
        reason: `case ${i + 1}: expected ${JSON.stringify(normalizeOutput(c.expected))}, solution printed ${JSON.stringify(normalizeOutput(actual))}`,
      }
    }
  }
  return { ok: true }
}

const SYSTEM_PROMPT = `You write coding practice problems for an assessment platform.

Return ONE JSON object, no prose:
{
  "title": string,                       // original, not a famous LeetCode title
  "shortDescription": string,            // <= 120 chars
  "difficulty": "easy" | "medium" | "hard",
  "category": string,                    // e.g. "Arrays", "Strings", "Graphs", "SQL"
  "statement": string[],                 // 2-4 sentences, state the EXACT stdin format
  "examples": [{ "input": string, "output": string, "explanation": string }],  // >= 3
  "testCases": [{ "stdin": string, "expected_stdout": string }],              // 2-3 hidden cases (keep them simple)
  "constraints": string[],
  "solutionCode": string                 // JavaScript, reads stdin, prints stdout
}

Hard rules (a wrong answer is rejected automatically):
- The solver writes a COMPLETE PROGRAM: it reads stdin and prints to stdout. No function signatures, no tests, no argv.
- "input"/"stdin" is the literal text fed to stdin. Prefer one value per line or JSON arrays on a line.
- "output"/"expected_stdout" is exactly what solutionCode prints — no labels, no trailing spaces.
- solutionCode runs on Node (CommonJS): read stdin with require('fs').readFileSync(0,'utf8') and print with console.log.
- MENTALLY EXECUTE solutionCode on every case before answering. The expected output must be what that code prints, not what you think it should print. Fewer, simpler cases are better than clever ones you cannot trace.
- Prefer single-line deterministic outputs (a number, a JSON array, a space-separated list). Avoid floats, dates, randomness, and anything implementation-dependent.
- Original problems only. Do not reuse LeetCode titles or statements.`

export type GenerateResult =
  | { ok: true; challenge: ArenaChallenge; attempts: number }
  | { ok: false; reason: string; attempts: number }

/**
 * Ask the model for a challenge, verify it, and retry with the failure reason
 * as feedback. Two attempts: enough to recover from a formatting slip without
 * burning the daily budget on a model that cannot follow the contract.
 */
export async function generateArenaChallenge(opts: {
  exec?: ArenaExecutor
  difficulty?: string
  category?: string
  maxAttempts?: number
  /** Only used for AI spend attribution. */
  feature?: string
} = {}): Promise<GenerateResult> {
  const exec = opts.exec ?? pistonExecutor
  const maxAttempts = opts.maxAttempts ?? 2
  let lastReason = 'not attempted'

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const userMessage = [
      opts.difficulty ? `Difficulty: ${opts.difficulty}.` : 'Difficulty: medium.',
      opts.category ? `Category: ${opts.category}.` : '',
      attempt > 1 ? `Your previous attempt was rejected: ${lastReason}. Fix that.` : '',
      'Write one new challenge as JSON.',
    ].filter(Boolean).join('\n')

    let raw: unknown
    try {
      const res = await backendComplete({
        systemMessage: SYSTEM_PROMPT,
        userMessage,
        responseFormat: 'json',
        feature: opts.feature ?? 'practice-content',
      })
      if (!res.ok) {
        return { ok: false, reason: `LLM call failed: ${res.text || 'no output'}`, attempts: attempt }
      }
      raw = jsonFromCompletion(res)
    } catch (e) {
      // Includes a genuinely unparseable completion: keep the reason so the run
      // log says whether the model refused or returned prose.
      lastReason = `unparseable output: ${e instanceof Error ? e.message : String(e)}`
      continue
    }

    const parsed = normalizeGeneratedArena(raw)

    if (!parsed.ok) { lastReason = parsed.reason; continue }

    const verified = await verifyArenaChallenge(parsed.challenge, exec)
    if (!verified.ok) { lastReason = verified.reason; continue }

    return { ok: true, challenge: parsed.challenge, attempts: attempt }
  }

  return { ok: false, reason: lastReason, attempts: maxAttempts }
}
