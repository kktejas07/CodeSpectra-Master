/**
 * Backfill arena challenges until the collection holds `--count` AI-generated
 * ones (default 100), each verified before insert.
 *
 *   cd frontend
 *   MONGODB_URI=... yarn tsx scripts/backfill-arena.ts --count=100
 *
 * Reads the encrypted provider keys from `platform_settings` the same way
 * lib/ai/backend does (run it with the app's env, e.g. on the server), and
 * writes through the shared insert helper so re-runs top up instead of
 * duplicating. Every candidate is executed in the sandbox first: a challenge
 * whose reference solution doesn't print the expected output is rejected, not
 * published (see lib/practice-content/arena-generate.ts).
 *
 * Resumable: Ctrl-C is safe, re-run to continue. Exits non-zero if the target
 * could not be reached, so a partial run is visible instead of silent.
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

const CATEGORIES = [
  'Arrays', 'Strings', 'Hash Maps', 'Two Pointers', 'Sliding Window', 'Stacks',
  'Queues', 'Linked Lists', 'Trees', 'Graphs', 'Dynamic Programming',
  'Greedy', 'Binary Search', 'Sorting', 'Recursion', 'Bit Manipulation', 'Math',
]
const DIFFICULTIES = ['easy', 'medium', 'hard'] as const

async function main() {
  if (!MONGO_URI) {
    console.error('MONGODB_URI is required (run with the app env, e.g. on the server)')
    process.exit(2)
  }

  // Import after env is loaded: the generator reads provider keys on demand.
  const { generateArenaChallenge } = await import('../lib/practice-content/arena-generate')
  const { insertVerifiedArenaChallenge, countGeneratedArena } = await import('../lib/practice-content/arena-store')
  const { ARENA_COLLECTION } = await import('../lib/arena-challenges')

  const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 15000, connectTimeoutMS: 15000 })
  await client.connect()
  const col = client.db(DB_NAME).collection(ARENA_COLLECTION)

  let done = await countGeneratedArena(col)
  console.log(`[backfill] ${done}/${TARGET} generated arena challenges already present`)

  let failuresInARow = 0
  // A duplicate is not a failure: the model re-uses good titles. Cap them
  // instead of aborting, or a small model parks the whole run.
  let duplicates = 0
  const MAX_DUPLICATES = 25
  while (done < TARGET) {
    const i = done + failuresInARow
    const category = CATEGORIES[i % CATEGORIES.length]
    const difficulty = DIFFICULTIES[i % DIFFICULTIES.length]

    const result = await generateArenaChallenge({ category, difficulty, feature: 'practice-content-backfill' })
    if (!result.ok) {
      failuresInARow++
      console.error(`[backfill] rejected (${category}/${difficulty}): ${result.reason}`)
      if (failuresInARow >= MAX_FAILURES_IN_A_ROW) {
        console.error(`[backfill] ${MAX_FAILURES_IN_A_ROW} failures in a row — stopping. Check provider keys / sandbox.`)
        await client.close()
        process.exit(1)
      }
      continue
    }

    const outcome = await insertVerifiedArenaChallenge(col, result.challenge)
    if (outcome === 'inserted') {
      done++
      failuresInARow = 0
      console.log(`[backfill] ${done}/${TARGET} + ${result.challenge.title} (${difficulty}, ${category})`)
    } else {
      duplicates++
      console.log(`[backfill] duplicate skipped (${duplicates}/${MAX_DUPLICATES}): ${result.challenge.title}`)
      if (duplicates >= MAX_DUPLICATES) {
        console.error(`[backfill] ${MAX_DUPLICATES} duplicates in a row — the model is repeating itself. Stopping.`)
        await client.close()
        process.exit(1)
      }
    }
  }

  await client.close()
  console.log(`[backfill] done — ${done} generated arena challenges`)
}

main().catch((e) => {
  console.error('[backfill] failed:', e)
  process.exit(1)
})
