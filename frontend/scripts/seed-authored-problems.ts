/**
 * Publish the authored problem bank that was never inserted.
 *
 * `SEED_PROBLEMS_BULK` ships 55 hand-written problems with tests (15 easy /
 * 30 medium / 10 hard), but `ensureSeeded` only ran when the collection was
 * EMPTY — so a database that already had 22 rows never received them, and
 * /dashboard/problems showed 6 solvable problems while 55 sat in the repo
 * (measured 2026-10-30).
 *
 *   cd frontend && MONGODB_URI=... npx tsx scripts/seed-authored-problems.ts
 *
 * Idempotent: skips ids/slugs already present and titles already used anywhere
 * in practice (arena/problems/challenges). Starters are rewritten to read
 * stdin, because the grader feeds stdin and compares stdout — a LeetCode-style
 * `class Solution` stub can never run.
 */
import { MongoClient } from 'mongodb'
import { loadEnvConfig } from '@next/env'
import { SEED_PROBLEMS_BULK } from './seed-problems-bulk'
import { normalizeTitle } from '../lib/practice-content/uniqueness'

loadEnvConfig(process.cwd())

const MONGO_URI = process.env.MONGODB_URI
const DB_NAME = process.env.MONGODB_DB_NAME || 'codespectra'

const STDIN_STARTERS: Record<string, string> = {
  python: 'import sys\nsrc = sys.stdin.read()\n# TODO: parse `src`, compute the answer, print it\n',
  javascript: "const src = require('fs').readFileSync(0, 'utf8')\n// TODO: parse `src`, compute the answer, print it with console.log\n",
}

async function main() {
  if (!MONGO_URI) {
    console.error('MONGODB_URI is required')
    process.exit(2)
  }

  const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 15000, connectTimeoutMS: 15000 })
  await client.connect()
  const db = client.db(DB_NAME)
  const problems = db.collection('problems')

  const taken = new Set<string>()
  for (const c of ['arena_challenges', 'problems', 'challenges']) {
    for (const row of await db.collection(c).find({}, { projection: { title: 1 } }).toArray()) {
      taken.add(normalizeTitle(row.title))
    }
  }

  let inserted = 0, skipped = 0
  const now = new Date().toISOString()
  for (const seed of SEED_PROBLEMS_BULK) {
    const key = normalizeTitle(seed.title)
    if (await problems.findOne({ $or: [{ id: seed.id }, { slug: seed.slug }] }) || taken.has(key)) {
      skipped++
      continue
    }

    const starter: Record<string, string> = { ...(seed.starter_code ?? {}) }
    for (const [lang, code] of Object.entries(STDIN_STARTERS)) {
      if (!/stdin|readFileSync|input\(/i.test(String(starter[lang] ?? ''))) starter[lang] = code
    }

    await problems.insertOne({ ...seed, starter_code: starter, is_published: true, source: 'seed-bulk', created_at: now, updated_at: now })
    taken.add(key)
    inserted++
  }

  const published = await problems.countDocuments({ is_published: true })
  const dist: Record<string, number> = {}
  for (const p of await problems.find({ is_published: true }, { projection: { difficulty: 1 } }).toArray()) {
    const d = String(p.difficulty ?? '?')
    dist[d] = (dist[d] ?? 0) + 1
  }
  await client.close()
  console.log(`[seed] inserted=${inserted} skipped=${skipped} published=${published} levels=${JSON.stringify(dist)}`)
}

main().catch((e) => { console.error('[seed] failed:', e); process.exit(1) })
