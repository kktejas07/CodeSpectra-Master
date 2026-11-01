/**
 * Insert the 20 hand-written interview challenges as approved.
 *
 * The route only seeded them when `challenges` was EMPTY, so a database that
 * already had the six demo rows never received them — the page showed 6 while
 * 20 authored challenges sat unused (2026-10-30).
 *
 *   cd frontend && MONGODB_URI=... npx tsx scripts/seed-authored-challenges.ts
 *
 * Idempotent; skips ids already present and titles used anywhere in practice.
 */
import { MongoClient } from 'mongodb'
import { loadEnvConfig } from '@next/env'
import { AUTHORED_CHALLENGES } from '../lib/challenges/seeds'
import { normalizeTitle } from '../lib/practice-content/uniqueness'

loadEnvConfig(process.cwd())

const MONGO_URI = process.env.MONGODB_URI
const DB_NAME = process.env.MONGODB_DB_NAME || 'codespectra'

async function main() {
  if (!MONGO_URI) { console.error('MONGODB_URI is required'); process.exit(2) }
  const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 15000 })
  await client.connect()
  const db = client.db(DB_NAME)
  const col = db.collection('challenges')

  const taken = new Set<string>()
  for (const c of ['arena_challenges', 'problems', 'challenges']) {
    for (const row of await db.collection(c).find({}, { projection: { title: 1 } }).toArray()) taken.add(normalizeTitle(row.title))
  }

  let inserted = 0, skipped = 0
  const now = new Date().toISOString()
  for (const ch of AUTHORED_CHALLENGES) {
    const key = normalizeTitle(ch.title)
    if (await col.findOne({ $or: [{ id: ch.id }, { slug: ch.id }] }) || taken.has(key)) { skipped++; continue }
    await col.insertOne({
      ...ch,
      slug: ch.id,
      review_status: 'approved',
      source: 'seed-authored',
      created_at: now,
      updated_at: now,
    })
    taken.add(key)
    inserted++
  }

  const visible = await col.countDocuments({ review_status: { $nin: ['draft', 'rejected'] } })
  await client.close()
  console.log(`[seed] inserted=${inserted} skipped=${skipped} visible=${visible}`)
}

main().catch((e) => { console.error('[seed] failed:', e); process.exit(1) })
