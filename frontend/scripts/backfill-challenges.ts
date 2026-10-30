/**
 * Backfill challenge prompts until `--count` AI-generated ones exist
 * (default 100). They land as drafts and stay invisible until approved at
 * /dashboard/admin/practice-review — challenges are prose, so there is nothing
 * to execute and verify.
 *
 *   cd frontend
 *   MONGODB_URI=... yarn tsx scripts/backfill-challenges.ts --count=100
 *
 * Resumable: counts what already exists and tops up; deduped by slug/title.
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
const TYPES = ['technical', 'system_design', 'behavioral', 'code_review', 'debugging'] as const
const DIFFICULTIES = ['easy', 'medium', 'hard'] as const
// Without variety the model repeats one title forever (seen live: 7 identical
// "Detect a Cycle in a Directed Graph Using DFS" back to back).
const HINTS = [
  'concurrency and race conditions', 'database indexing and query plans', 'HTTP caching and ETags',
  'memory leaks and profiling', 'API versioning', 'message queues and backpressure',
  'authentication vs authorization', 'idempotency and retries', 'pagination strategies',
  'connection pooling', 'load balancing health checks', 'schema migrations with zero downtime',
  'rate limiting algorithms', 'observability and tracing', 'CI pipeline flakiness',
  'dependency injection and testability', 'immutable data structures', 'feature flags and rollouts',
  'eventual consistency', 'cascading failures and circuit breakers', 'timezone handling',
  'unicode and text normalisation', 'floating point money handling', 'accessibility in forms',
  'caching invalidation', 'batch processing vs streaming', 'file uploads and validation',
  'websocket reconnection', 'secrets rotation', 'cost optimisation in the cloud',
]

async function main() {
  if (!MONGO_URI) {
    console.error('MONGODB_URI is required (run with the app env, e.g. on the server)')
    process.exit(2)
  }

  const { generateChallenge } = await import('../lib/practice-content/challenges-generate')
  const { findTitleOwner } = await import('../lib/practice-content/uniqueness')

  const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 15000, connectTimeoutMS: 15000 })
  await client.connect()
  const db = client.db(DB_NAME)
  const col = db.collection('challenges')

  const countGenerated = () => col.countDocuments({ source: 'ai' })

  let done = await countGenerated()
  console.log(`[backfill] ${done}/${TARGET} generated challenges already present (drafts until approved)`)

  let failuresInARow = 0
  // A duplicate is not a failure: the model re-uses good titles. Cap them
  // instead of aborting, or a small model parks the whole run.
  let duplicates = 0
  const MAX_DUPLICATES = 25
  while (done < TARGET) {
    const i = done + failuresInARow
    const type = TYPES[i % TYPES.length]
    const difficulty = DIFFICULTIES[i % DIFFICULTIES.length]

    const result = await generateChallenge({ type, difficulty, topicHint: HINTS[i % HINTS.length] })
    if (!result.ok) {
      failuresInARow++
      console.error(`[backfill] rejected (${type}/${difficulty}): ${result.reason}`)
      if (failuresInARow >= MAX_FAILURES_IN_A_ROW) {
        console.error(`[backfill] ${MAX_FAILURES_IN_A_ROW} failures in a row — stopping. Check provider keys.`)
        await client.close()
        process.exit(1)
      }
      continue
    }

    const c = result.challenge
    const exists = (await col.findOne({ $or: [{ id: c.id }, { slug: c.slug }, { title: c.title }] }))
      ?? (await findTitleOwner(db, c.title))
    if (exists) {
      duplicates++
      console.log(`[backfill] duplicate skipped (${duplicates}/${MAX_DUPLICATES}): ${c.title}`)
      if (duplicates >= MAX_DUPLICATES) {
        console.error(`[backfill] ${MAX_DUPLICATES} duplicates in a row — the model is repeating itself. Stopping.`)
        await client.close()
        process.exit(1)
      }
      continue
    }

    await col.insertOne({ ...c, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    done = await countGenerated()
    failuresInARow = 0
    console.log(`[backfill] ${done}/${TARGET} + ${c.title} (${type}, ${difficulty})`)
  }

  await client.close()
  console.log(`[backfill] done — ${done} generated challenges awaiting review`)
}

main().catch((e) => {
  console.error('[backfill] failed:', e)
  process.exit(1)
})
