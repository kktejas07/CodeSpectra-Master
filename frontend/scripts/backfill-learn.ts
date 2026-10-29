/**
 * Fill the Learn hub (which powers Tracks) to `--count` posts (default 108 =
 * 9 tracks × 12).
 *
 *   cd frontend
 *   MONGODB_URI=... yarn tsx scripts/backfill-learn.ts --count=108
 *
 * Uses the app's own generator (generateNow), so every post goes through the
 * same schema/quality checks as the scheduled drafts — nothing is bypassed.
 * Resumable: counts what exists and keeps going. Exits non-zero when it stops
 * early, so a partial run is visible.
 *
 * Learn was producing 0 posts for 12 consecutive scheduled runs because the
 * response parser trusted an empty `res.json` over the JSON in `text`
 * (lib/learn/generate.ts `coercePostJson`). Run this after that fix ships.
 */
import { loadEnvConfig } from '@next/env'

loadEnvConfig(process.cwd())

const MONGO_URI = process.env.MONGODB_URI

function arg(name: string, fallback: number): number {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`))
  if (!hit) return fallback
  const n = Number(hit.split('=')[1])
  return Number.isFinite(n) && n > 0 ? n : fallback
}

const TARGET = arg('count', 108)
const MAX_FAILURES_IN_A_ROW = 5

async function main() {
  if (!MONGO_URI) {
    console.error('MONGODB_URI is required (run with the app env, e.g. on the server)')
    process.exit(2)
  }

  const { generateNow } = await import('../lib/learn/generate')
  const { learnPosts } = await import('../lib/learn/store')

  const col = await learnPosts()
  const count = () => col.countDocuments({ status: { $ne: 'rejected' } })

  let done = await count()
  console.log(`[backfill] ${done}/${TARGET} learn posts already present`)

  let failuresInARow = 0
  while (done < TARGET) {
    const results = await generateNow({ count: 1 })
    const okResults = results.filter(r => r.ok)

    if (okResults.length === 0) {
      const reason = results[0]?.error ?? 'no topic selected'
      console.error(`[backfill] failed: ${reason}`)
      // "Every enabled topic already has a post" is a hard stop, not a retry.
      if (/already has a post/i.test(reason)) break
      failuresInARow++
      if (failuresInARow >= MAX_FAILURES_IN_A_ROW) {
        console.error(`[backfill] ${MAX_FAILURES_IN_A_ROW} failures in a row — stopping. Check provider keys.`)
        process.exit(1)
      }
      continue
    }

    failuresInARow = 0
    done = await count()
    console.log(`[backfill] ${done}/${TARGET} + ${okResults[0].topic} (${okResults[0].status ?? 'draft'})`)
  }

  console.log(`[backfill] done — ${done} learn posts`)
}

main().catch((e) => {
  console.error('[backfill] failed:', e)
  process.exit(1)
})
