/**
 * Backfill coding problems until `--count` AI-generated published problems exist
 * (default 100), each verified before publish.
 *
 *   cd frontend
 *   MONGODB_URI=... yarn tsx scripts/backfill-problems.ts --count=100
 *
 * Reuses the app's own pipeline (generate → verify with the reference solution →
 * publish), so a run is exactly what the daily cron does, only in a loop.
 * Resumable: counts what already exists and tops up; exits non-zero if it gives
 * up, so a partial run is never silent.
 */
import { MongoClient } from 'mongodb'
import { loadEnvConfig } from '@next/env'

loadEnvConfig(process.cwd())

const MONGO_URI = process.env.MONGODB_URI
const DB_NAME = process.env.MONGODB_DB_NAME || 'codespectra'

function arg(name: string, fallback: number): number {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`))
  if (!hit) return fallback
  const n = Number(hit.split('=')[1])
  return Number.isFinite(n) && n > 0 ? n : fallback
}

const TARGET = arg('count', 100)
const MAX_FAILURES_IN_A_ROW = 6

const TOPICS = [
  'arrays', 'strings', 'hash map', 'two pointers', 'sliding window', 'stack',
  'queue', 'linked list', 'binary tree', 'graph', 'dynamic programming',
  'greedy', 'binary search', 'sorting', 'recursion', 'bit manipulation', 'math',
]
const DIFFICULTIES = ['easy', 'medium', 'hard'] as const

async function main() {
  if (!MONGO_URI) {
    console.error('MONGODB_URI is required (run with the app env, e.g. on the server)')
    process.exit(2)
  }

  const { generateVerifiedProblem, systemPracticeUser } = await import('../lib/practice-content/problems-generate')

  const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 15000, connectTimeoutMS: 15000 })
  await client.connect()
  const col = client.db(DB_NAME).collection('problems')

  const countGenerated = () => col.countDocuments({ source: 'ai_agent', is_published: true })

  let done = await countGenerated()
  console.log(`[backfill] ${done}/${TARGET} verified generated problems already published`)

  let failuresInARow = 0
  while (done < TARGET) {
    const i = done + failuresInARow
    const topic = TOPICS[i % TOPICS.length]
    const difficulty = DIFFICULTIES[i % DIFFICULTIES.length]

    const result = await generateVerifiedProblem({
      user: systemPracticeUser(),
      difficulty,
      topics: [topic],
    })

    if (!result.ok) {
      failuresInARow++
      console.error(`[backfill] rejected (${topic}/${difficulty}): ${result.reason}`)
      if (failuresInARow >= MAX_FAILURES_IN_A_ROW) {
        console.error(`[backfill] ${MAX_FAILURES_IN_A_ROW} failures in a row — stopping. Check provider keys / sandbox.`)
        await client.close()
        process.exit(1)
      }
      continue
    }

    done = await countGenerated()
    failuresInARow = 0
    console.log(`[backfill] ${done}/${TARGET} + ${result.slug} (${difficulty}, ${topic})`)
  }

  await client.close()
  console.log(`[backfill] done — ${done} verified generated problems`)
}

main().catch((e) => {
  console.error('[backfill] failed:', e)
  process.exit(1)
})
