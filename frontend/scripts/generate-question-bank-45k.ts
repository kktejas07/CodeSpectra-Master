import { MongoClient } from 'mongodb'
import { createHash } from 'crypto'
import { normalizeBankQuestion, bankContentHash, type BankQuestionDoc } from '../lib/question-bank'

// ────────────────────────────────────────────────────────────────────────────
// Local 45k question-bank generator.
// Buckets by (industry, level): 15 industries × 3 levels × 1000 = 45k.
// Rotates branches, degree types and question types within each bucket so every
// dimension reaches >=1k per level. Soft industries get cognitive/behavioral
// (aptitude) questions instead of engineering technical ones. Runs from the Mac
// over an SSH tunnel to prod Mongo, calling OpenRouter directly.
//
// Strict no-duplicate rule: dedupe keys are (a) normalized text fingerprint of
// question+options+answer (case/space/punctuation insensitive) and (b) the
// existing bankContentHash. Any doc matching an existing or previously-inserted
// fingerprint is skipped.
// ────────────────────────────────────────────────────────────────────────────

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://mongo:kfgXeV32FU2WPp1tERVs@127.0.0.1:27018/?authSource=admin&directConnection=true'
const MONGO_DB = process.env.MONGODB_DB_NAME || 'codespectra'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const MODEL = process.env.MODEL || 'openai/gpt-4o-mini'
const TARGET_PER_BUCKET = Number(process.env.TARGET_PER_BUCKET) || 1000
const BATCH = Number(process.env.BATCH_SIZE) || 16
const MAX_CONSECUTIVE_FAILURES = 8
const MAX_429_RETRIES = 8
const MAX_BUCKETS = process.env.MAX_BUCKETS ? Number(process.env.MAX_BUCKETS) : Infinity
const ONLY_INDUSTRY = process.env.ONLY_INDUSTRY || ''
const PROVIDERS = (process.env.PROVIDERS || 'opencode,nvidia,groq').split(',').map((s) => s.trim()).filter(Boolean)

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

async function loadSecrets() {
  const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 15000, connectTimeoutMS: 15000 })
  await client.connect()
  const secrets = (await client.db(MONGO_DB).collection('platform_settings').findOne({ key: 'secrets' }))?.value || {}
  openrouterKey = secrets.openrouter_api_key || secrets.openai_api_key || ''
  groqKey = secrets.groq_api_key || ''
  nvidiaKey = secrets.nvidia_api_key || ''
  opencodeKey = secrets.opencode_api_key || ''
  await client.close()
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
        // NVIDIA 8b misbehaves with json_object (returns a bare object + 7x slower);
        // omit response_format for it so it returns a clean array fast.
        if (p.id !== 'nvidia') payload.response_format = { type: 'json_object' }
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

function extractArray(text: string): Record<string, unknown>[] {
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim()
  // OpenRouter with json_object may wrap in {"questions": [...]} or return a bare array.
  let start = cleaned.indexOf('[')
  let end = cleaned.lastIndexOf(']')
  if (start === -1 || end === -1 || end <= start) {
    // try to unwrap {"...": [...]}
    const m = cleaned.match(/\[\s*\{/)
    if (m) { start = m.index ?? -1; end = cleaned.lastIndexOf(']'); }
  }
  if (start === -1 || end === -1 || end <= start) return []
  try {
    const arr = JSON.parse(cleaned.slice(start, end + 1))
    return Array.isArray(arr) ? arr : []
  } catch { return [] }
}

/** Normalized fingerprint — case/space/punctuation-insensitive duplicate detector.
 *  Question-text only: the same question rendered as mcq vs descriptive (or with
 *  O(n²) vs O(n^2)) must still be caught as a duplicate. bankContentHash handles
 *  full-content equality; this catches re-worded-but-identical questions. */
function fingerprint(doc: Partial<BankQuestionDoc>): string {
  const text = (doc.question || doc.title || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
  return createHash('sha256').update(text).digest('hex')
}

function pickDifficulty(mix: [number, number, number]): string {
  const r = Math.random()
  if (r < mix[0]) return 'Easy'
  if (r < mix[0] + mix[1]) return 'Medium'
  return 'Hard'
}

function buildTechnicalPrompt(branch: (typeof BRANCHES)[0], level: (typeof LEVELS)[0], topic: string, count: number, typeList: string[], degree: string): string {
  const perType = Math.max(1, Math.floor(count / typeList.length))
  const typeSpec = typeList.map((t) => `${t}:~${perType}`).join(', ')
  return [
    `Generate exactly ${count} distinct technical assessment questions for ${branch.label} campus hiring at a top MNC, targeting ${level.label}.`,
    `Focus subject/topic: ${topic}.`,
    `Degree level of candidate: ${degree.toUpperCase()}.`,
    `Question types (approximate counts): ${typeSpec}.`,
    `Type rules: 'mcq' = exactly 4 options + correct answer. 'multiple_response' = 4 options + all correct answers comma-separated. 'true_false' = options ["True","False"]. 'fill_blanks' = question has a ____ blank + 4 candidate fill-ins as options. 'coding' = empty options, answer is a short approach outline (no full solution). 'descriptive' = empty options, answer is a model-answer paragraph.`,
    `Vary concepts: do NOT repeat the same concept twice in one batch.`,
    `Respond with ONLY a JSON array. Each object: {"title": short label, "question": full prompt, "type", "options": [string], "answer", "explanation", "difficulty": "Easy"|"Medium"|"Hard", "marks": 5-20, "subject": "${topic}", "tags": [2-4 tags]}.`,
  ].join('\n')
}

function buildSoftPrompt(industry: (typeof SOFT_INDUSTRIES)[0], level: (typeof LEVELS)[0], focus: string, count: number, typeList: string[]): string {
  const perType = Math.max(1, Math.floor(count / typeList.length))
  const typeSpec = typeList.map((t) => `${t}:~${perType}`).join(', ')
  return [
    `Generate exactly ${count} distinct ${industry.label} screening questions for MNC hiring, targeting ${level.label}.`,
    `Assessment category: ${industry.category.toUpperCase()} aptitude. Focus: ${focus}.`,
    `Question types (approximate counts): ${typeSpec}.`,
    `Type rules: 'mcq' = exactly 4 options + correct answer. 'multiple_response' = 4 options + all correct answers. 'true_false' = options ["True","False"]. 'fill_blanks' = statement with a ____ blank + 4 fill-ins. 'descriptive' = empty options, model-answer paragraph.`,
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
  const col = client.db(MONGO_DB).collection<BankQuestionDoc>('question_bank')
  await loadSecrets()

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

  // Rotating counters per dimension (global across the whole run).
  let branchIdx = 0
  let degreeIdx = 0
  let typeIdx = 0

  const buildDocs = (parsed: Record<string, unknown>[], overrides: Partial<BankQuestionDoc>): BankQuestionDoc[] => {
    const out: BankQuestionDoc[] = []
    for (const q of parsed) {
      const doc = normalizeBankQuestion({ id: undefined, ...q, source: 'ai', createdAt: new Date().toISOString(), ...overrides })
      if (!doc) continue
      const h = bankContentHash(doc)
      const f = fingerprint(doc)
      if (seenHashes.has(h) || seenFp.has(f)) continue
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
      bucketCount++
      if (bucketCount > MAX_BUCKETS) { console.log(`Reached MAX_BUCKETS=${MAX_BUCKETS}, stopping.`); process.exit(0) }
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
        const need = Math.min(BATCH, remaining - inserted)
        const branch = branches[topicIdx % branches.length]
        const topic = branch.topics[topicIdx % branch.topics.length]
        topicIdx++
        const degree = DEGREES[degreeIdx++ % DEGREES.length]
        const types = [ALL_TYPES[typeIdx++ % ALL_TYPES.length], ALL_TYPES[typeIdx++ % ALL_TYPES.length], ALL_TYPES[typeIdx++ % ALL_TYPES.length]]
        const typeList = [...new Set(types)]

        const prompt = buildTechnicalPrompt(branch, level, topic, need, typeList, degree)
        let raw = ''
        let providerUsed = ''
        try { const r = await aiComplete(prompt); raw = r.content; providerUsed = r.provider } catch (e) {
          failures++
          if (failures >= MAX_CONSECUTIVE_FAILURES) { console.log(`  [${key}] aborting after ${MAX_CONSECUTIVE_FAILURES} failures.`); break }
          console.log(`  [${key}] ai error (${e instanceof Error ? e.message : e}) failure ${failures}/${MAX_CONSECUTIVE_FAILURES}`)
          await sleep(3000)
          continue
        }
        const parsed = extractArray(raw)
        if (!parsed.length) {
          failures++
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
          console.log(`  [${key}] batch all duplicates (${parsed.length} parsed)`)
        }
        const el = ((Date.now() - startedAt) / 60000).toFixed(1)
        console.log(`  [elapsed ${el}m, total ${totalInserted} new, ${totalFailed} failed]`)
        await sleep(1200)
      }
    }
  }

  // Soft industries: 5 × 3 levels × 1000 = 15k
  for (const industry of SOFT_INDUSTRIES) {
    if (ONLY_INDUSTRY && industry.id !== ONLY_INDUSTRY) continue
    for (const level of LEVELS) {
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
          if (failures >= MAX_CONSECUTIVE_FAILURES) { console.log(`  [${key}] aborting after ${MAX_CONSECUTIVE_FAILURES} failures.`); break }
          console.log(`  [${key}] ai error (${e instanceof Error ? e.message : e}) failure ${failures}/${MAX_CONSECUTIVE_FAILURES}`)
          await sleep(3000)
          continue
        }
        const parsed = extractArray(raw)
        if (!parsed.length) {
          failures++
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
          console.log(`  [${key}] batch all duplicates (${parsed.length} parsed)`)
        }
        const el = ((Date.now() - startedAt) / 60000).toFixed(1)
        console.log(`  [elapsed ${el}m, total ${totalInserted} new, ${totalFailed} failed]`)
        await sleep(1200)
      }
    }
  }

  // ── TOP-UP PASS: guarantee every dimension bucket reaches TARGET_PER_BUCKET ──
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
              if (failures >= MAX_CONSECUTIVE_FAILURES) { console.log(`  top-up ${dim.field}=${value} aborting.`); break }
              console.log(`  ai error (${e instanceof Error ? e.message : e})`)
              await sleep(3000)
              continue
            }
            const parsed = extractArray(raw)
            if (!parsed.length) {
              failures++
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

  // ── FINAL REPORT ──
  console.log('\n\n=== FINAL COVERAGE REPORT ===')
  for (const dim of [{ name: 'industry', field: 'industry', values: [...Object.keys(TECH_INDUSTRY_BRANCHES), ...SOFT_INDUSTRIES.map((s) => s.id)] }, ...dimensions]) {
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

  console.log(`\n=== DONE: inserted ${totalInserted} new questions. ===`)
  await client.close()
  process.exit(0)
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1) })
