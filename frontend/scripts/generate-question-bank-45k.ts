import { MongoClient } from 'mongodb'
import { createHash } from 'crypto'
import { normalizeBankQuestion, bankContentHash, type BankQuestionDoc } from '../lib/question-bank'

// ────────────────────────────────────────────────────────────────────────────
// Local question-bank generator.
//
// Base coverage: buckets by (industry, level): 15 industries × 3 levels × 1,000
// = 45,000 questions. Branches, degree types and question types are rotated
// WITHIN each bucket so dimensions stay balanced inside an industry's 1,000.
//
// TOP-UP PASS (unless SKIP_TOP_UP=1): after the 45k base, force every (branch,
// level), (degree, level), (type, level), and (level) GLOBAL bucket to reach
// 1,000. These are global counts, NOT per-industry — so the final DB WILL
// exceed 45,000 once top-up runs. Realistic ceiling: ~60–90k. If you need
// exactly 45,000, set SKIP_TOP_UP=1.
//
// Soft industries get cognitive/behavioral (aptitude) questions instead of
// engineering technical ones. Runs from the Mac over an SSH tunnel to prod
// Mongo, calling OpenRouter directly.
//
// Strict no-duplicate rule: dedupe keys are (a) normalized text fingerprint of
// question + options + answer (case/space/punctuation insensitive) and (b) the
// existing bankContentHash. Any doc matching an existing or previously-inserted
// fingerprint is skipped.
//
// Strict validation: every AI-generated object is schema-validated BEFORE
// insert (option count per type, answer∈options, marks 5–20, difficulty enum,
// tags 2–4). Invalid objects are rejected and counted as failed.
// ────────────────────────────────────────────────────────────────────────────

// ponytail: MONGO_URI must come from env. A hardcoded fallback password was
// previously committed here (commit 3efd717) and had to be scrubbed from git
// history + rotated. Never put a credential in source — the file enters git
// history, backups, logs, and shares.
const MONGO_URI: string = (() => {
  const v = process.env.MONGODB_URI
  if (!v) throw new Error('MONGODB_URI is required (set it in your shell env, never in source)')
  return v
})()
const MONGO_DB = process.env.MONGODB_DB_NAME || 'codespectra'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const MODEL = process.env.MODEL || 'openai/gpt-4o-mini'
const TARGET_PER_BUCKET = Number(process.env.TARGET_PER_BUCKET) || 1000
const BATCH = Number(process.env.BATCH_SIZE) || 16
const MAX_CONSECUTIVE_FAILURES = 8
const MAX_429_RETRIES = 8
const MAX_BUCKETS = process.env.MAX_BUCKETS ? Number(process.env.MAX_BUCKETS) : Infinity
const ONLY_INDUSTRY = process.env.ONLY_INDUSTRY || ''
const ONLY_LEVEL = process.env.ONLY_LEVEL || ''
const FORCE_HARD = process.env.FORCE_HARD === '1'
const SKIP_TOP_UP = process.env.SKIP_TOP_UP === '1'
const MAX_INSERTS = process.env.MAX_INSERTS ? Number(process.env.MAX_INSERTS) : 0
const PROVIDERS = (process.env.PROVIDERS || 'opencode,nvidia,groq,openrouter').split(',').map((s) => s.trim()).filter(Boolean)

const LEVELS = [
  { id: 'entry', label: 'entry-level (0-2 years experience, fresher)', difficultyMix: [0.7, 0.25, 0.05] as [number, number, number] },
  { id: 'mid', label: 'mid-level (2-6 years experience)', difficultyMix: [0.2, 0.65, 0.15] as [number, number, number] },
  { id: 'senior', label: 'senior-level (6+ years experience, architect/lead)', difficultyMix: [0.1, 0.3, 0.6] as [number, number, number] },
]

const DEGREES = ['btech', 'mtech', 'mca', 'diploma', 'other']

// Branch definitions with topics (same as catalog).
const BRANCHES: { id: string; label: string; topics: string[] }[] = [
  { id: 'cse', label: 'Computer Science & Engineering', topics: ['Data Structures & Algorithms', 'Operating Systems', 'DBMS', 'Computer Networks', 'Software Engineering', 'Programming in C/Java/Python', 'Theory of Computation'] },
  { id: 'it', label: 'Information Technology', topics: ['DBMS', 'Web Technologies', 'Computer Networks', 'Operating Systems', 'Software Engineering', 'Data Structures', 'Cloud & DevOps'] },
  { id: 'ece', label: 'Electronics & Communication Engineering', topics: ['Signals & Systems', 'Digital Electronics', 'Analog Electronics', 'Communication Systems', 'Microprocessors', 'Control Systems', 'Electronic Devices'] },
  { id: 'eee', label: 'Electrical & Electronics Engineering', topics: ['Circuit Theory', 'Electrical Machines', 'Power Systems', 'Control Systems', 'Power Electronics', 'Electrical Measurements', 'Electromagnetic Theory'] },
  { id: 'mech', label: 'Mechanical Engineering', topics: ['Thermodynamics', 'Fluid Mechanics', 'Strength of Materials', 'Machine Design', 'Manufacturing Processes', 'Theory of Machines', 'Heat Transfer'] },
  { id: 'civil', label: 'Civil Engineering', topics: ['Structural Analysis', 'Concrete Technology', 'Geotechnical Engineering', 'Fluid Mechanics', 'Environmental Engineering', 'Surveying', 'Transportation Engineering'] },
  { id: 'chem', label: 'Chemical Engineering', topics: ['Chemical Reaction Engineering', 'Mass Transfer', 'Heat Transfer', 'Thermodynamics', 'Fluid Mechanics', 'Process Control', 'Chemical Technology'] },
  { id: 'ai_ds', label: 'Artificial Intelligence & Data Science', topics: ['Machine Learning', 'Deep Learning', 'Probability & Statistics', 'Data Structures', 'Data Engineering', 'NLP', 'Neural Networks'] },
]

// Technical industries → relevant branches. Non-technical (soft) industries get aptitude questions.
const TECH_INDUSTRY_BRANCHES: Record<string, string[]> = {
  software: ['cse', 'it', 'ai_ds'],
  manufacturing: ['mech', 'chem', 'eee', 'ece'],
  government: ['cse', 'civil', 'eee', 'mech'],
  healthcare: ['chem', 'ece', 'ai_ds'],
  engineering: ['ece', 'eee', 'mech', 'civil', 'chem'],
  construction: ['civil', 'mech'],
  utilities_energy: ['eee', 'ece', 'civil', 'mech', 'chem'],
  financial_services: ['cse', 'it', 'ai_ds'],
  transportation_logistics: ['mech', 'civil', 'eee'],
  education: ['cse', 'it', 'ai_ds'],
  banking: ['cse', 'it', 'ai_ds'],
  it_services: ['cse', 'it', 'ai_ds'],
  product: ['cse', 'ece', 'it'],
  telecommunications: ['ece', 'cse', 'it'],
}

// Human-authored, MNC placement-paper style, senior-hard question focus per vertical.
const INDUSTRY_FOCUS: Record<string, string> = {
  banking: `write like a senior capacity-development team at a global investment bank (the Barclays style): stringent compliance and audit orientation, sharp quantitative reasoning (risk-adjusted return, credit risk, IRR/FX), deep application of financial regulation (Basel III, CRR, ICAAP) and modern core-banking systems (transaction monitoring, fraud, encryption/PKI, settlement, clearing). Questions must feel like genuinely hand-set senior campus/PO-style test items used at big banks: realistic figures that tie out exactly, plausible but wrong distractors, zero filler.`,
  it_services: `write like the recruitment exam unit of a tier-1 Indian IT services major (the Infosys style): large-language-programming mastery (Java/C++/Python edge cases, threads, memory, GC), enterprise engineering (Spring/Cloud/Angular, API design, databases under load, ETL), agile/SDLC and client-facing consulting judgment. Items should read like hand-crafted senior programming/architecture screening used at MNC services firms: exact line-by-line behaviour, subtle distractors, realistic enterprise scenarios.`,
  product: `write like the hiring team of a flagship consumer-tech product company (the Apple style): systems thinking end to end, algorithms and data structures under memory/energy constraints, OS/kernel concurrency, secure coding and privacy, hardware-software integration (SoC, power), design-for-scale. Items must read as original, hand-set senior technical interviews: canonical (not hyperbolic) figures, reasoning-heavy stems, distractors that are plausible misconceptions, zero generic trivia.`,
  telecommunications: `write like the networks hiring exam at a global telecom operator (the AT&T style): RF/spectrum engineering, 5G NR and LTE air interface, fiber/transport, IP/MPLS, quality-of-service and signalling (SS7/SIP/DIAMETER), field performance (EIRP, budget, latency, capacity trade-offs). Questions must resemble carefully authored senior network-engineer selection papers at carriers: numeric answers that compute to exact published-standard values, real protocol minutiae, realistic field engineering constraints.`,
}

const SOFT_INDUSTRIES = [
  { id: 'staffing', label: 'Staffing / Recruitment', category: 'behavioral', focus: 'workplace behaviour, teamwork, communication, integrity' },
  { id: 'call_centers', label: 'Call Centers', category: 'cognitive', focus: 'verbal reasoning, customer handling scenarios, basic numeracy' },
  { id: 'hospitality', label: 'Hospitality', category: 'behavioral', focus: 'customer service scenarios, etiquette, teamwork under pressure' },
  { id: 'retail', label: 'Retail', category: 'cognitive', focus: 'basic arithmetic, logical reasoning, customer interaction scenarios' },
  { id: 'legal_services', label: 'Legal Services', category: 'cognitive', focus: 'logical reasoning, attention to detail, comprehension' },
]

const ALL_TYPES = ['mcq', 'multiple_response', 'true_false', 'fill_blanks', 'coding', 'descriptive'] as const
const SOFT_TYPES = ['mcq', 'multiple_response', 'true_false', 'fill_blanks', 'descriptive'] as const

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

let openrouterKey = ''
let groqKey = ''
let nvidiaKey = ''
let opencodeKey = ''

const SYSTEM_PROMPT = 'You are a meticulous technical assessment question writer for MNC campus hiring. You always respond with a valid JSON array of question objects and nothing else.'

async function loadSecrets(client: MongoClient) {
  const secrets = (await client.db(MONGO_DB).collection('platform_settings').findOne({ key: 'secrets' }))?.value || {}
  openrouterKey = secrets.openrouter_api_key || secrets.openai_api_key || ''
  groqKey = secrets.groq_api_key || ''
  nvidiaKey = secrets.nvidia_api_key || ''
  opencodeKey = secrets.opencode_api_key || ''
  if (!groqKey && !nvidiaKey && !openrouterKey && !opencodeKey) throw new Error('No provider keys found in platform_settings')
  console.log(`Keys: opencode=${opencodeKey.slice(0, 8)}... groq=${groqKey.slice(0, 8)}... nvidia=${nvidiaKey.slice(0, 8)}... openrouter=${openrouterKey.slice(0, 8)}...`)
}

interface Provider { id: string; url: string; key: string; model: string; maxTokens: number; timeoutMs: number }

function providers(active: string[]): Provider[] {
  const byId: Record<string, Provider> = {
    opencode: { id: 'opencode', url: 'https://opencode.ai/zen/v1/chat/completions', key: opencodeKey, model: 'deepseek-v4-flash-free', maxTokens: 16000, timeoutMs: 180000 },
    groq: { id: 'groq', url: 'https://api.groq.com/openai/v1/chat/completions', key: groqKey, model: 'llama-3.3-70b-versatile', maxTokens: 6000, timeoutMs: 120000 },
    nvidia: { id: 'nvidia', url: 'https://integrate.api.nvidia.com/v1/chat/completions', key: nvidiaKey, model: 'meta/llama-3.1-8b-instruct', maxTokens: 6000, timeoutMs: 170000 },
    openrouter: { id: 'openrouter', url: OPENROUTER_URL, key: openrouterKey, model: MODEL, maxTokens: 6000, timeoutMs: 120000 },
  }
  const list: Provider[] = []
  for (const id of active) {
    const p = byId[id]
    if (p && p.key) list.push(p)
  }
  return list
}

/** Try each provider in order; the first that returns a usable array wins. */
async function aiComplete(prompt: string, active: string[] = PROVIDERS): Promise<{ content: string; provider: string }> {
  const list = providers(active)
  if (!list.length) throw new Error('no providers available')
  const lastErr: string[] = []
  for (const p of list) {
    let retries = 0
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        const payload: Record<string, unknown> = {
          model: p.model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: prompt },
          ],
          max_tokens: p.maxTokens,
        }
        // ponytail: do NOT set response_format=json_object — the prompt asks for
        // a JSON ARRAY, but json_object instructs the model to return a single
        // JSON OBJECT. The two contradict each other and the previous code
        // worked around the resulting mess with a fragile extractArray(). We
        // instead let the model return raw JSON and parse strictly.
        const res = await fetch(p.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.key}` },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(p.timeoutMs),
        })
        const text = await res.text()
        if (res.status === 429 || res.status === 402) {
          retries++
          // Groq free tier throttles hard; cap its retries low so we fall to a working provider fast.
          const cap = p.id === 'groq' ? 2 : MAX_429_RETRIES
          if (retries > cap) { lastErr.push(`${p.id}: ${res.status} exhausted`); break }
          const waitMs = 8000 + Math.floor(Math.random() * 8000)
          console.log(`    [${p.id} ${res.status}] rate/credit limited, retry ${retries}/${cap} in ${Math.round(waitMs / 1000)}s...`)
          await sleep(waitMs)
          continue
        }
        if (res.status === 401) { lastErr.push(`${p.id}: 401 invalid key`); break }
        if (!res.ok) { lastErr.push(`${p.id}: HTTP ${res.status}`); break }
        let json: unknown
        try { json = JSON.parse(text) } catch { lastErr.push(`${p.id}: non-JSON`); break }
        const content = (json as any)?.choices?.[0]?.message?.content || ''
        if (!content) { lastErr.push(`${p.id}: empty content`); break }
        return { content, provider: p.id }
      } catch (e) {
        lastErr.push(`${p.id}: ${e instanceof Error ? e.message : e}`)
        break
      }
    }
  }
  throw new Error(`all providers failed: ${lastErr.join(' | ')}`)
}

/**
 * Robust JSON-array parser. Handles:
 *  - bare JSON arrays:           [...]
 *  - fenced arrays:             ```json\n[...]\n```
 *  - wrapper object:            {"questions": [...]} or {"array": [...]} or
 *                               {"data": [...]} or any single-key object whose
 *                               value is an array
 *  - leading/trailing prose:    "Here are the questions:\n[...]\nNote: ..."
 *
 * Falls back to a balanced-bracket scan (handles nested arrays/objects, strings
 * with escaped quotes) only as a last resort — never just `indexOf('[')` /
 * `lastIndexOf(']')`, which can grab the wrong array when prose mentions
 * options like `["A","B"]`.
 */
function parseQuestionArray(raw: string): Record<string, unknown>[] {
  const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim()
  if (!cleaned) return []

  // 1) Try direct parse.
  try {
    const v = JSON.parse(cleaned)
    if (Array.isArray(v)) return v as Record<string, unknown>[]
    if (v && typeof v === 'object') {
      const arr = firstArrayValue(v as Record<string, unknown>)
      if (arr) return arr
    }
  } catch { /* fall through */ }

  // 2) Find the first balanced top-level '[' in the text — robust to
  //    prose that mentions short arrays like ["A","B"]. We scan with a
  //    string-aware counter so quotes/escapes don't trip bracket tallies.
  const start = firstTopLevelArrayStart(cleaned)
  if (start === -1) return []
  const end = matchingBracket(cleaned, start)
  if (end === -1 || end <= start) return []
  try {
    const arr = JSON.parse(cleaned.slice(start, end + 1))
    return Array.isArray(arr) ? arr as Record<string, unknown>[] : []
  } catch { return [] }
}

/** Return the value of the first key in `o` whose value is an array, else null. */
function firstArrayValue(o: Record<string, unknown>): Record<string, unknown>[] | null {
  for (const v of Object.values(o)) {
    if (Array.isArray(v) && v.length && typeof v[0] === 'object' && v[0] !== null) {
      return v as Record<string, unknown>[]
    }
  }
  return null
}

/** Index of the first '[' that begins a balanced array containing at least one
 *  '{' (a heuristic to skip short option-list arrays in prose). -1 if none. */
function firstTopLevelArrayStart(s: string): number {
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '[') {
      const end = matchingBracket(s, i)
      if (end !== -1 && end > i + 2) {
        const inner = s.slice(i + 1, end)
        // a question array always contains object literals; option lists don't
        if (inner.includes('{')) return i
      }
    }
  }
  return -1
}

/** Return the index of the ']' that closes the '[' at `open`, honoring string
 *  literals and escape sequences. -1 if unbalanced. */
function matchingBracket(s: string, open: number): number {
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = open; i < s.length; i++) {
    const c = s[i]
    if (inStr) {
      if (esc) { esc = false }
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') inStr = true
    else if (c === '[') depth++
    else if (c === ']') { depth--; if (depth === 0) return i }
  }
  return -1
}

/** Normalized fingerprint — case/space/punctuation-insensitive duplicate
 *  detection across question + options + answer. The comment used to claim this
 *  used question+options+answer, but the old impl hashed only the question text,
 *  so re-worded-but-identical questions with the same options/answer slipped in.
 *  We now hash the concatenation of question + options + answer.
 *  ponytail: ceiling — does NOT catch semantic paraphrases with different
 *  wording AND different options/answer; that needs embeddings (planned PR2). */
function fingerprint(doc: Partial<BankQuestionDoc>): string {
  const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
  const text = [
    norm(doc.question || doc.title || ''),
    Array.isArray(doc.options) ? doc.options.map(norm).join('|') : '',
    norm(doc.answer || ''),
  ].join('::')
  return createHash('sha256').update(text).digest('hex')
}

function pickDifficulty(mix: [number, number, number]): string {
  const r = Math.random()
  if (r < mix[0]) return 'Easy'
  if (r < mix[0] + mix[1]) return 'Medium'
  return 'Hard'
}

// ── Strict generated-question validator ─────────────────────────────────────
// The prompt instructs the model, but prompt instructions are not validation.
// Every AI-generated doc is validated here BEFORE insertion. Invalid docs are
// rejected and counted as failed. Errors collect to a string for logging.
const DIFFICULTIES = new Set(['Easy', 'Medium', 'Hard'])
const VALID_TYPES = new Set(['mcq', 'multiple_response', 'true_false', 'fill_blanks', 'coding', 'descriptive'])
const MCQ_OPTION_COUNTS = new Set([4])
const TF_OPTION_COUNTS = new Set([2])

function validateBankQuestion(doc: BankQuestionDoc): { ok: true } | { ok: false; reason: string } {
  const reason = (m: string) => ({ ok: false as const, reason: m })

  // Required text fields
  if (!doc.title || !doc.title.trim()) return reason('missing title')
  if (!doc.question || !doc.question.trim()) return reason('missing question')

  // Type
  if (!VALID_TYPES.has(doc.type)) return reason(`invalid type "${doc.type}"`)

  // Options count per type
  const opts = Array.isArray(doc.options) ? doc.options : []
  switch (doc.type) {
    case 'mcq':
      if (!MCQ_OPTION_COUNTS.has(opts.length)) return reason(`mcq requires exactly 4 options, got ${opts.length}`)
      break
    case 'multiple_response':
      if (!MCQ_OPTION_COUNTS.has(opts.length)) return reason(`multiple_response requires exactly 4 options, got ${opts.length}`)
      break
    case 'true_false':
      if (!TF_OPTION_COUNTS.has(opts.length)) return reason(`true_false requires exactly 2 options, got ${opts.length}`)
      break
    case 'fill_blanks':
      if (!MCQ_OPTION_COUNTS.has(opts.length)) return reason(`fill_blanks requires exactly 4 options, got ${opts.length}`)
      break
    case 'coding':
      if (opts.length !== 0) return reason(`coding requires options to be empty, got ${opts.length}`)
      break
    case 'descriptive':
      if (opts.length !== 0) return reason(`descriptive requires options to be empty, got ${opts.length}`)
      break
  }

  // Answer
  if (!doc.answer || !doc.answer.trim()) return reason('missing answer')

  // answer ∈ options for choice-based types
  if (doc.type === 'mcq') {
    // answer must equal one of the options (case-insensitive)
    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
    if (!opts.some((o) => norm(o) === norm(doc.answer || ''))) return reason('mcq answer not in options')
  } else if (doc.type === 'true_false') {
    if (!/^(true|false)$/i.test(doc.answer)) return reason(`true_false answer must be True or False, got "${doc.answer}"`)
  } else if (doc.type === 'fill_blanks') {
    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
    if (!opts.some((o) => norm(o) === norm(doc.answer || ''))) return reason('fill_blanks answer not in options')
  } else if (doc.type === 'multiple_response') {
    // answer may be comma-separated; every token must match an option
    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
    const tokens = (doc.answer || '').split(',').map((s) => norm(s)).filter(Boolean)
    if (tokens.length < 1) return reason('multiple_response answer has no valid tokens')
    const optsNorm = opts.map(norm)
    for (const t of tokens) {
      if (!optsNorm.includes(t)) return reason(`multiple_response answer token "${t}" not in options`)
    }
  }

  // Difficulty
  if (!DIFFICULTIES.has(doc.difficulty)) return reason(`invalid difficulty "${doc.difficulty}"`)

  // Marks
  if (typeof doc.marks !== 'number' || doc.marks < 5 || doc.marks > 20 || !Number.isFinite(doc.marks)) {
    return reason(`marks must be 5–20, got ${doc.marks}`)
  }

  // Tags: 2–4 values
  const tags = Array.isArray(doc.tags) ? doc.tags : []
  if (tags.length < 2 || tags.length > 4) return reason(`tags must be 2–4 values, got ${tags.length}`)

  return { ok: true }
}

function buildTechnicalPrompt(branch: (typeof BRANCHES)[0], level: (typeof LEVELS)[0], topic: string, count: number, typeList: string[], degree: string, industry?: string): string {
  const perType = Math.max(1, Math.floor(count / typeList.length))
  const typeSpec = typeList.map((t) => `${t}:~${perType}`).join(', ')
  const focus = industry ? INDUSTRY_FOCUS[industry] : ''
  const hardNote = FORCE_HARD ? ' Every single question MUST be HARD difficulty — genuinely demanding, as expected of a senior specialist selection paper.' : ''
  const authNote = industry
    ? ' Authenticity rules (critically important): write each item the way a seasoned human hiring manager would — natural, varied sentence stems, precise realistic numeric values that tie out exactly, plausible but subtly wrong distractors, and a short examiner-grade explanation. No template boilerplate, no "Given that...", no meta phrases, and never mention being AI.'
    : ''
  return [
    `Generate exactly ${count} distinct technical assessment questions for ${branch.label} campus hiring at a top MNC, targeting ${level.label}.`,
    focus ? `Domain voice & standard: ${focus}` : '',
    `Focus subject/topic: ${topic}.`,
    `Degree level of candidate: ${degree.toUpperCase()}.`,
    `Question types (approximate counts): ${typeSpec}.`,
    `Type rules: 'mcq' = exactly 4 options + correct answer. 'multiple_response' = 4 options + all correct answers comma-separated. 'true_false' = options ["True","False"]. 'fill_blanks' = question has a ____ blank + 4 candidate fill-ins as options. 'coding' = empty options, answer is a short approach outline (no full solution). 'descriptive' = empty options, answer is a model-answer paragraph.`,
    `TITLE RULE (mandatory): the "title" field MUST be a concise human-readable summary of that specific question (e.g. "Binary Search worst-case time complexity", "Banker's algorithm safe-state check"), 4-12 words, unique per question. NEVER use "Q1", "Question 2", "1.1", or any numbering scheme as a title — a numbered title is an automatic rejection.`,
    `Vary concepts: do NOT repeat the same concept twice in one batch.`,
    `${authNote}${hardNote}`,
    `Respond with ONLY a JSON array. Each object: {"title": short label, "question": full prompt, "type", "options": [string], "answer", "explanation", "difficulty": "Easy"|"Medium"|"Hard", "marks": 5-20, "subject": "${topic}", "tags": [2-4 tags]}.`,
  ].filter(Boolean).join('\n')
}

function buildSoftPrompt(industry: (typeof SOFT_INDUSTRIES)[0], level: (typeof LEVELS)[0], focus: string, count: number, typeList: string[]): string {
  const perType = Math.max(1, Math.floor(count / typeList.length))
  const typeSpec = typeList.map((t) => `${t}:~${perType}`).join(', ')
  return [
    `Generate exactly ${count} distinct ${industry.label} screening questions for MNC hiring, targeting ${level.label}.`,
    `Assessment category: ${industry.category.toUpperCase()} aptitude. Focus: ${focus}.`,
    `Question types (approximate counts): ${typeSpec}.`,
    `Type rules: 'mcq' = exactly 4 options + correct answer. 'multiple_response' = 4 options + all correct answers. 'true_false' = options ["True","False"]. 'fill_blanks' = statement with a ____ blank + 4 fill-ins. 'descriptive' = empty options, model-answer paragraph.`,
    `TITLE RULE (mandatory): the "title" field MUST be a concise human-readable summary of that specific question, 4-12 words, unique per question. NEVER use "Q1", "Question 2", "1.1", or any numbering scheme as a title.`,
    `Vary the scenarios: do NOT repeat the same situation twice in one batch.`,
    `Respond with ONLY a JSON array. Each object: {"title": short label, "question": full prompt, "type", "options": [string], "answer", "explanation", "difficulty": "Easy"|"Medium"|"Hard", "marks": 5-20, "subject": "${industry.category}", "tags": [2-4 tags]}.`,
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 15000, connectTimeoutMS: 15000 })
  await client.connect()
  try {
    const col = client.db(MONGO_DB).collection<BankQuestionDoc>('question_bank')
    await loadSecrets(client)

    const existing = await col.find({}, { projection: { _id: 0 } }).toArray()
    const seenHashes = new Set<string>()
    const seenFp = new Set<string>()
    let dupExisting = 0
    for (const d of existing) {
      const h = bankContentHash(d)
      const f = fingerprint(d)
      if (seenHashes.has(h) || seenFp.has(f)) dupExisting++
      seenHashes.add(h)
      seenFp.add(f)
    }
    console.log(`Loaded ${existing.length} existing docs. ${seenHashes.size} unique hashes, ${seenFp.size} unique fingerprints (${dupExisting} near-duplicates already in DB).`)

    const startedAt = Date.now()
    let totalInserted = 0
    let totalFailed = 0
    // Sentinel — set by MAX_BUCKETS / MAX_INSERTS gates to unwind cleanly out of
    // nested loops instead of process.exit(0) (which would skip client.close()).
    let stopRequested = false

    // Rotating counters per dimension (global across the whole run).
    let branchIdx = 0
    let degreeIdx = 0
    let typeIdx = 0

    // buildDocs: normalize → dedupe (exact fingerprint + content-hash) → validate.
    // Each rejected doc (dedupe OR validation) increments totalFailed.
    const buildDocs = (parsed: Record<string, unknown>[], overrides: Partial<BankQuestionDoc>): BankQuestionDoc[] => {
      const out: BankQuestionDoc[] = []
      for (const q of parsed) {
        const doc = normalizeBankQuestion({ id: undefined, ...q, source: 'ai', createdAt: new Date().toISOString(), ...overrides })
        if (!doc) { totalFailed++; continue }
        if (FORCE_HARD) doc.difficulty = 'Hard'
        // Exact duplicate? (fingerprint now uses question+options+answer)
        const h = bankContentHash(doc)
        const f = fingerprint(doc)
        if (seenHashes.has(h) || seenFp.has(f)) { totalFailed++; continue }
        // Strict schema validation
        const v = validateBankQuestion(doc)
        if (!v.ok) { totalFailed++; console.log(`    reject: ${v.reason} | "${(doc.title || doc.question || '').slice(0, 60)}"`); continue }
        seenHashes.add(h)
        seenFp.add(f)
        out.push(doc)
      }
      return out
    }

    // Technical industries: 10 × 3 levels × 1000 = 30k
    let bucketCount = 0
    for (const [industry, branchIds] of Object.entries(TECH_INDUSTRY_BRANCHES)) {
      if (ONLY_INDUSTRY && industry !== ONLY_INDUSTRY) continue
      for (const level of LEVELS) {
        if (ONLY_LEVEL && level.id !== ONLY_LEVEL) continue
        bucketCount++
        if (bucketCount > MAX_BUCKETS) { console.log(`Reached MAX_BUCKETS=${MAX_BUCKETS}, stopping.`); stopRequested = true; break }
        const key = `${industry}/${level.id}`
        const current = await col.countDocuments({ industry, level: level.id })
        const remaining = TARGET_PER_BUCKET - current
        console.log(`\n=== Bucket ${key}: ${current}/${TARGET_PER_BUCKET} existing, ${Math.max(0, remaining)} to generate ===`)
        if (remaining <= 0) { console.log(`Bucket ${key} already at target, skipping.`); continue }

        const branches = branchIds.map((id) => BRANCHES.find((b) => b.id === id)!).filter(Boolean)
        let topicIdx = 0
        let failures = 0
        let inserted = 0
        while (inserted < remaining) {
          if (stopRequested) break
          const need = Math.min(BATCH, remaining - inserted)
          const branch = branches[topicIdx % branches.length]
          const topic = branch.topics[topicIdx % branch.topics.length]
          topicIdx++
          const degree = DEGREES[degreeIdx++ % DEGREES.length]
          const types = [ALL_TYPES[typeIdx++ % ALL_TYPES.length], ALL_TYPES[typeIdx++ % ALL_TYPES.length], ALL_TYPES[typeIdx++ % ALL_TYPES.length]]
          const typeList = [...new Set(types)]

          const prompt = buildTechnicalPrompt(branch, level, topic, need, typeList, degree, industry)
          let raw = ''
          let providerUsed = ''
          try { const r = await aiComplete(prompt); raw = r.content; providerUsed = r.provider } catch (e) {
            failures++
            totalFailed++
            if (failures >= MAX_CONSECUTIVE_FAILURES) { console.log(`  [${key}] aborting after ${MAX_CONSECUTIVE_FAILURES} failures.`); break }
            console.log(`  [${key}] ai error (${e instanceof Error ? e.message : e}) failure ${failures}/${MAX_CONSECUTIVE_FAILURES}`)
            await sleep(3000)
            continue
          }
          const parsed = parseQuestionArray(raw)
          if (!parsed.length) {
            failures++
            totalFailed++
            if (failures >= MAX_CONSECUTIVE_FAILURES) { console.log(`  [${key}] aborting after ${MAX_CONSECUTIVE_FAILURES} empty batches.`); break }
            console.log(`  [${key}] empty/unparseable batch (failure ${failures}/${MAX_CONSECUTIVE_FAILURES})`)
            await sleep(2000)
            continue
          }
          failures = 0

          const docs = buildDocs(parsed, {
            branch: branch.id,
            level: level.id,
            industry,
            degree_type: degree,
            assessment_category: 'skills',
          })
          if (docs.length) {
            await col.insertMany(docs)
            inserted += docs.length
            totalInserted += docs.length
            console.log(`  [${key}] +${docs.length} (${typeList.join(',')} @${branch.id}/${degree} via ${providerUsed}); bucket ${current + inserted}/${TARGET_PER_BUCKET}`)
          } else {
            console.log(`  [${key}] batch all rejected/duplicates (${parsed.length} parsed)`)
          }
          const el = ((Date.now() - startedAt) / 60000).toFixed(1)
          console.log(`  [elapsed ${el}m, total ${totalInserted} new, ${totalFailed} failed]`)
          if (MAX_INSERTS > 0 && totalInserted >= MAX_INSERTS) { console.log(`  [${key}] reached MAX_INSERTS=${MAX_INSERTS}, stopping.`); stopRequested = true; break }
          await sleep(1200)
        }
        if (stopRequested) break
      }
      if (stopRequested) break
    }

    if (stopRequested) { console.log('\n=== stop requested — skipping remaining industries + top-up ===') }
    else {
    // Soft industries: 5 × 3 levels × 1000 = 15k
    for (const industry of SOFT_INDUSTRIES) {
      if (ONLY_INDUSTRY && industry.id !== ONLY_INDUSTRY) continue
      for (const level of LEVELS) {
        if (ONLY_LEVEL && level.id !== ONLY_LEVEL) continue
        const key = `${industry.id}/${level.id}`
        const current = await col.countDocuments({ industry: industry.id, level: level.id })
        const remaining = TARGET_PER_BUCKET - current
        console.log(`\n=== Bucket ${key}: ${current}/${TARGET_PER_BUCKET} existing, ${Math.max(0, remaining)} to generate ===`)
        if (remaining <= 0) { console.log(`Bucket ${key} already at target, skipping.`); continue }

        let failures = 0
        let inserted = 0
        while (inserted < remaining) {
          const need = Math.min(BATCH, remaining - inserted)
          const types = [SOFT_TYPES[typeIdx++ % SOFT_TYPES.length], SOFT_TYPES[typeIdx++ % SOFT_TYPES.length], SOFT_TYPES[typeIdx++ % SOFT_TYPES.length]]
          const typeList = [...new Set(types)]
          const prompt = buildSoftPrompt(industry, level, industry.focus, need, typeList)
          let raw = ''
          let providerUsed = ''
          try { const r = await aiComplete(prompt); raw = r.content; providerUsed = r.provider } catch (e) {
            failures++
            totalFailed++
            if (failures >= MAX_CONSECUTIVE_FAILURES) { console.log(`  [${key}] aborting after ${MAX_CONSECUTIVE_FAILURES} failures.`); break }
            console.log(`  [${key}] ai error (${e instanceof Error ? e.message : e}) failure ${failures}/${MAX_CONSECUTIVE_FAILURES}`)
            await sleep(3000)
            continue
          }
          const parsed = parseQuestionArray(raw)
          if (!parsed.length) {
            failures++
            totalFailed++
            if (failures >= MAX_CONSECUTIVE_FAILURES) { console.log(`  [${key}] aborting after ${MAX_CONSECUTIVE_FAILURES} empty batches.`); break }
            console.log(`  [${key}] empty/unparseable batch (failure ${failures}/${MAX_CONSECUTIVE_FAILURES})`)
            await sleep(2000)
            continue
          }
          failures = 0

          const docs = buildDocs(parsed, {
            level: level.id,
            industry: industry.id,
            degree_type: DEGREES[degreeIdx++ % DEGREES.length],
            assessment_category: industry.category,
          })
          if (docs.length) {
            await col.insertMany(docs)
            inserted += docs.length
            totalInserted += docs.length
            console.log(`  [${key}] +${docs.length} (${typeList.join(',')} via ${providerUsed}); bucket ${current + inserted}/${TARGET_PER_BUCKET}`)
          } else {
            console.log(`  [${key}] batch all rejected/duplicates (${parsed.length} parsed)`)
          }
          const el = ((Date.now() - startedAt) / 60000).toFixed(1)
          console.log(`  [elapsed ${el}m, total ${totalInserted} new, ${totalFailed} failed]`)
          await sleep(1200)
        }
      }
    }

    // ── TOP-UP PASS: guarantee every dimension bucket reaches TARGET_PER_BUCKET ──
    // Skips entirely when SKIP_TOP_UP=1 (single-industry/single-level targeted runs).
    // NOTE: these are GLOBAL counts (not per-industry); the final DB WILL exceed
    // 45,000 once top-up runs. Set SKIP_TOP_UP=1 for an exact 45k cap.
    if (SKIP_TOP_UP) {
      console.log('\n\n=== SKIP_TOP_UP=1: skipping top-up pass. ===')
    } else {
      console.log('\n\n=== TOP-UP PASS: verifying all dimension coverage ===')
      const dimensions: { name: string; field: string; values: string[] }[] = [
        { name: 'branch', field: 'branch', values: BRANCHES.map((b) => b.id) },
        { name: 'degree', field: 'degree_type', values: DEGREES },
        { name: 'type', field: 'type', values: [...ALL_TYPES] as unknown as string[] },
        { name: 'level', field: 'level', values: LEVELS.map((l) => l.id) },
      ]
      for (const level of LEVELS) {
        for (const dim of dimensions) {
          for (const value of dim.values) {
            const count = await col.countDocuments({ [dim.field]: value, level: level.id })
            if (count < TARGET_PER_BUCKET) {
              const need = TARGET_PER_BUCKET - count
              console.log(`\n=== TOP-UP ${dim.field}=${value} level=${level.id}: ${count}/${TARGET_PER_BUCKET}, generating ${need} ===`)
              let failures = 0
              let inserted = 0
              while (inserted < need) {
                const batchNeed = Math.min(BATCH, need - inserted)
                let prompt = ''
                let overrides: Partial<BankQuestionDoc> = { level: level.id, degree_type: DEGREES[degreeIdx++ % DEGREES.length] }
                if (dim.field === 'branch') {
                  const b = BRANCHES.find((x) => x.id === value)!
                  const topic = b.topics[inserted % b.topics.length]
                  const tl = [ALL_TYPES[typeIdx++ % ALL_TYPES.length], ALL_TYPES[typeIdx++ % ALL_TYPES.length]]
                  prompt = buildTechnicalPrompt(b, level, topic, batchNeed, [...new Set(tl)], overrides.degree_type!)
                  overrides = { ...overrides, branch: b.id, industry: 'engineering', assessment_category: 'skills' }
                } else if (dim.field === 'type') {
                  const type = value
                  const b = BRANCHES[(branchIdx++) % BRANCHES.length]
                  const topic = b.topics[branchIdx % b.topics.length]
                  overrides = { ...overrides, branch: b.id, industry: 'software', assessment_category: 'skills', type: type as BankQuestionDoc['type'] }
                  prompt = buildTechnicalPrompt(b, level, topic, batchNeed, [type], overrides.degree_type!)
                } else if (dim.field === 'degree') {
                  const b = BRANCHES[(branchIdx++) % BRANCHES.length]
                  const topic = b.topics[branchIdx % b.topics.length]
                  overrides = { ...overrides, branch: b.id, industry: 'engineering', assessment_category: 'skills', degree_type: value }
                  prompt = buildTechnicalPrompt(b, level, topic, batchNeed, [ALL_TYPES[typeIdx++ % ALL_TYPES.length]], value)
                } else if (dim.field === 'level') {
                  const b = BRANCHES[(branchIdx++) % BRANCHES.length]
                  const topic = b.topics[branchIdx % b.topics.length]
                  overrides = { ...overrides, branch: b.id, industry: 'engineering', assessment_category: 'skills' }
                  prompt = buildTechnicalPrompt(b, level, topic, batchNeed, [ALL_TYPES[typeIdx++ % ALL_TYPES.length]], overrides.degree_type!)
                }
                let raw = ''
                try { const r = await aiComplete(prompt); raw = r.content } catch (e) {
                  failures++
                  totalFailed++
                  if (failures >= MAX_CONSECUTIVE_FAILURES) { console.log(`  top-up ${dim.field}=${value} aborting.`); break }
                  console.log(`  ai error (${e instanceof Error ? e.message : e})`)
                  await sleep(3000)
                  continue
                }
                const parsed = parseQuestionArray(raw)
                if (!parsed.length) {
                  failures++
                  totalFailed++
                  if (failures >= MAX_CONSECUTIVE_FAILURES) { console.log(`  top-up ${dim.field}=${value} aborting.`); break }
                  await sleep(2000)
                  continue
                }
                failures = 0
                const docs = buildDocs(parsed, overrides)
                if (docs.length) { await col.insertMany(docs); inserted += docs.length; totalInserted += docs.length }
                console.log(`  top-up ${dim.field}=${value} @${level.id}: +${docs.length} (${inserted}/${need})`)
                await sleep(1200)
              }
            }
          }
        }
      }
    }

    // ── FINAL REPORT ──
    console.log('\n\n=== FINAL COVERAGE REPORT ===')
    const reportDims: { name: string; field: string; values: string[] }[] = [
      { name: 'industry', field: 'industry', values: [...Object.keys(TECH_INDUSTRY_BRANCHES), ...SOFT_INDUSTRIES.map((s) => s.id)] },
      { name: 'branch', field: 'branch', values: BRANCHES.map((b) => b.id) },
      { name: 'degree', field: 'degree_type', values: DEGREES },
      { name: 'type', field: 'type', values: [...ALL_TYPES] as unknown as string[] },
      { name: 'level', field: 'level', values: LEVELS.map((l) => l.id) },
    ]
    for (const dim of reportDims) {
      for (const level of LEVELS) {
        const short: string[] = []
        for (const value of dim.values) {
          const c = await col.countDocuments({ [dim.field]: value, level: level.id })
          if (c < TARGET_PER_BUCKET) short.push(`${value}=${c}`)
        }
        if (short.length) console.log(`SHORT ${dim.field} @${level.id}: ${short.join(', ')}`)
        else console.log(`OK ${dim.field} @${level.id}: all >= ${TARGET_PER_BUCKET}`)
      }
    }

    console.log(`\n=== DONE: inserted ${totalInserted} new questions, ${totalFailed} rejected/failed. ===`)
    }
  } finally {
    // Always close Mongo — even on error or MAX_* early-stop. Previously
    // process.exit(0) skipped this line, leaking a connection.
    await client.close()
  }
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1) })
