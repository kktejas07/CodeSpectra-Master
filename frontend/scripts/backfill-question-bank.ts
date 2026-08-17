import { MongoClient, ObjectId } from 'mongodb'
import { cleanTitle, isPlaceholderTitle, deriveTitleFromQuestion, type BankQuestionDoc } from '../lib/question-bank'

// ────────────────────────────────────────────────────────────────────────────
// Question-bank backfill: report + safe remediation of audit findings.
//   DRY-RUN (default): prints anomaly counts and the exact changes it WOULD
//   make, writes nothing.  --apply: performs only safe, reversible fixes.
//
// Safe fixes:
//   A. derive a readable title where the title is a placeholder/numbered ("Q1")
//   B. re-derive titles of duplicate-title docs (keeps first, fixes the rest)
//   C. deactivate malformed MCQs (mcq/multiple_response with <2 options)
//   D. deactivate objective questions with no answer (ungradeable deterministic)
//
// Report-only (never auto-changed): free-text missing answers, coding rows
// missing tech_stack.
//
// Usage:  MONGODB_URI=... [MONGODB_DB_NAME=codespectra] npx tsx scripts/backfill-question-bank.ts [--apply]
// ────────────────────────────────────────────────────────────────────────────

const MONGO_URI = process.env.MONGODB_URI
if (!MONGO_URI) {
  console.error('MONGODB_URI environment variable is required')
  process.exit(1)
}
const MONGO_DB = process.env.MONGODB_DB_NAME || 'codespectra'
const APPLY = process.argv.includes('--apply')

const OBJECTIVE = new Set(['mcq', 'true_false', 'multiple_response', 'fill_blanks'])
const titleKey = (t?: string) => (t || '').toLowerCase().replace(/\s+/g, ' ').trim()

async function main() {
  const client = new MongoClient(MONGO_URI as string, { serverSelectionTimeoutMS: 15000, connectTimeoutMS: 15000 })
  await client.connect()
  const col = client.db(MONGO_DB).collection<BankQuestionDoc & { _id: ObjectId }>('question_bank')
  const docs = await col.find({}).toArray()
  console.log(`Loaded ${docs.length} question-bank docs.\n`)

  const malformedMcq: typeof docs = []
  const objectiveNoAnswer: typeof docs = []
  const freeTextNoAnswer: typeof docs = []
  const codingNoStack: typeof docs = []
  const placeholderTitles: typeof docs = []
  const dupTitleMap = new Map<string, typeof docs>()

  for (const d of docs) {
    const type = (d.type || '').toLowerCase()
    if (type === 'mcq' || type === 'multiple_response') {
      if (!Array.isArray(d.options) || d.options.filter((o: string) => (o || '').trim()).length < 2) malformedMcq.push(d)
    }
    const hasAnswer = !!(d.answer && (d.answer as string).trim())
    if (OBJECTIVE.has(type) && !hasAnswer) objectiveNoAnswer.push(d)
    if ((type === 'coding' || type === 'descriptive') && !hasAnswer) freeTextNoAnswer.push(d)
    if (type === 'coding' && !d.tech_stack?.length) codingNoStack.push(d)
    if (isPlaceholderTitle(d.title || '')) placeholderTitles.push(d)
    const k = titleKey(d.title)
    if (k) {
      const arr = dupTitleMap.get(k) || []
      arr.push(d)
      dupTitleMap.set(k, arr)
    }
  }
  const dupGroups = [...dupTitleMap.values()].filter((g) => g.length > 1)
  const dupAffected = dupGroups.reduce((n, g) => n + g.length - 1, 0)

  console.log('=== AUDIT SUMMARY ===')
  console.log(`  malformed MCQs (<2 options):            ${malformedMcq.length}`)
  console.log(`  objective, no answer (ungradeable):     ${objectiveNoAnswer.length}`)
  console.log(`  coding/descriptive, no answer:           ${freeTextNoAnswer.length} (report-only)`)
  console.log(`  coding, no tech_stack:                   ${codingNoStack.length} (report-only)`)
  console.log(`  placeholder/numbered titles:             ${placeholderTitles.length}`)
  console.log(`  duplicate titles (groups=${dupGroups.length}):          ${dupAffected} docs affected (1 kept per group\n`)

  const deactivateSet = new Set<ObjectId>(malformedMcq.map((d) => d._id))
  for (const d of objectiveNoAnswer) deactivateSet.add(d._id)

  const retitle: { _id: ObjectId; from: string; to: string }[] = []
  const seenDerived = new Set<string>(docs.map((d) => titleKey(d.title)))
  const retitleDoc = (d: typeof docs[number]) => {
    const derived = deriveTitleFromQuestion(d.question)
    let to = cleanTitle(derived)
    if (isPlaceholderTitle(to) || !to) to = `Question ${String(d._id).slice(-6)}`
    if (seenDerived.has(titleKey(to))) to = `${to} (${String(d._id).slice(-6)})`
    seenDerived.add(titleKey(to))
    return to
  }
  for (const d of placeholderTitles) {
    const to = retitleDoc(d)
    if (titleKey(to) !== titleKey(d.title)) retitle.push({ _id: d._id, from: d.title, to })
  }
  for (const g of dupGroups) {
    for (const d of g.slice(1)) {
      if (retitle.some((r) => String(r._id) === String(d._id))) continue
      const to = retitleDoc(d)
      if (titleKey(to) !== titleKey(d.title)) retitle.push({ _id: d._id, from: d.title, to })
    }
  }

  console.log('=== PLANNED CHANGES ===')
  console.log(`  re-title ${retitle.length} docs (placeholder + duplicates)`)
  console.log(`  deactivate ${deactivateSet.size} docs (${malformedMcq.length} malformed MCQ + ${objectiveNoAnswer.length} objective-no-answer)`)

  if (!APPLY) {
    console.log('\n=== DRY RUN — no writes performed. Re-run with --apply to execute. ===')
    const preview = Math.min(4, retitle.length)
    console.log(`Sample re-titles (${preview}/${retitle.length}):`)
    for (const r of retitle.slice(0, preview)) console.log(`  [${String(r._id)}] "${r.from}" -> "${r.to}"`)
    await client.close()
    process.exit(0)
  }

  // ── Apply (batched bulkWrite — thousands of docs must not go one round-trip at a time) ──
  const BATCH = 1000
  const retitleOps = retitle.map((r) => ({ updateOne: { filter: { _id: r._id }, update: { $set: { title: r.to } } } }))
  const deactivateOps = [...deactivateSet].map((id) => ({ updateOne: { filter: { _id: id }, update: { $set: { is_active: false } } } }))
  let fixed = 0
  let deactivated = 0
  for (let i = 0; i < retitleOps.length; i += BATCH) {
    const res = await col.bulkWrite(retitleOps.slice(i, i + BATCH) as any, { ordered: false })
    fixed += res.modifiedCount
  }
  for (let i = 0; i < deactivateOps.length; i += BATCH) {
    const res = await col.bulkWrite(deactivateOps.slice(i, i + BATCH) as any, { ordered: false })
    deactivated += res.modifiedCount
  }
  console.log(`\n=== APPLIED: retitled ${fixed}, deactivated ${deactivated} ===`)
  await client.close()
  process.exit(0)
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1) })