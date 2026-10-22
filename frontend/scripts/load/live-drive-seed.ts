/**
 * Seed N load-test candidates into a live drive and write their bearer
 * session tokens (for scripts/load/live-drive.k6.js). Local / staging only:
 * needs LOAD_TEST_DB=1 and refuses production-like settings.
 *
 *   LOAD_TEST_DB=1 MONGODB_URI=mongodb://localhost:27017/codespectra \
 *     npx tsx scripts/load/live-drive-seed.ts --drive <id> --count 1000 --out /tmp/ld-tokens.json
 *
 * Users are `loadtest+<n>@example.test` (role user). Run with the same
 * session secret as the server so the tokens verify. Re-running is safe
 * (upserts). Remove them with: --cleanup.
 */
import { writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : fallback
}

async function main() {
  const uri = process.env.MONGODB_URI || ''
  if (process.env.LOAD_TEST_DB !== '1') throw new Error('Set LOAD_TEST_DB=1 to confirm this is a test database.')
  if (process.env.NODE_ENV === 'production' || /codespectra|prod/i.test(uri.replace(/^mongodb(\+srv)?:\/\/[^@]*@/, ''))) throw new Error('Refusing: this looks like production.')
  const driveId = arg('drive')
  const count = Math.min(5000, Number(arg('count', '1000')))
  const out = arg('out', '/tmp/ld-tokens.json')!
  if (!driveId) throw new Error('--drive is required')

  const { getMongoDb } = await import('@/lib/mongodb')
  const { signSessionToken } = await import('@/lib/session')
  const db = await getMongoDb()
  const emails = Array.from({ length: count }, (_, i) => `loadtest+${i}@example.test`)

  if (process.argv.includes('--cleanup')) {
    const ids = (await db.collection('user').find({ email: { $in: emails } }, { projection: { id: 1 } }).toArray()).map((u) => u.id)
    await db.collection('live_drive_candidates').deleteMany({ drive_id: driveId, user_id: { $in: ids } })
    await db.collection('user').deleteMany({ email: { $in: emails } })
    process.stdout.write(`removed ${ids.length} load-test users\n`)
    process.exit(0)
  }

  const drive = await db.collection('live_drives').findOne({ id: driveId })
  if (!drive) throw new Error('Drive not found')
  const now = new Date().toISOString()
  for (let i = 0; i < emails.length; i += 500) {
    await db.collection('user').bulkWrite(emails.slice(i, i + 500).map((email, j) => ({
      updateOne: { filter: { email }, update: { $setOnInsert: { id: randomUUID(), email, name: `Load test ${i + j}`, role: 'user', status: 'active', created_at: now } }, upsert: true },
    })), { ordered: false })
  }
  const users = await db.collection('user').find({ email: { $in: emails } }, { projection: { _id: 0, id: 1, email: 1, name: 1 } }).toArray()
  for (let i = 0; i < users.length; i += 500) {
    await db.collection('live_drive_candidates').bulkWrite(users.slice(i, i + 500).map((u, j) => ({
      updateOne: {
        filter: { drive_id: driveId, user_id: u.id },
        update: { $setOnInsert: {
          id: randomUUID(), drive_id: driveId, user_id: u.id, email: u.email, name: u.name, group_no: Math.floor((i + j) / 50) + 1, invigilator_id: null, source: 'manual',
          state: 'not_started', system_check: null, started_at: null, submitted_at: null, auto_submitted: false, extra_ms: 0, paused_ms: 0, paused_at: null,
          last_seen_at: null, rejoin_allowed_at: null, disconnects: 0, answers: {}, answered_count: 0, save_seq: 0, saved_at: null, flag_count: 0, flagged: null,
          terminated: null, inbox: [], result: null, scored_at: null, published: false, created_at: now, updated_at: now,
        } },
        upsert: true,
      },
    })), { ordered: false })
  }
  await db.collection('live_drives').updateOne({ id: driveId }, { $set: { candidate_count: await db.collection('live_drive_candidates').countDocuments({ drive_id: driveId }) } })
  const tokens: string[] = []
  for (const u of users) tokens.push(await signSessionToken({ uid: String(u.id), email: String(u.email), role: 'user', ver: 1 }, '6h'))
  writeFileSync(out, JSON.stringify(tokens))
  process.stdout.write(`seeded ${users.length} candidates into ${driveId}; tokens → ${out}\n`)
  process.exit(0)
}

main().catch((e) => { process.stderr.write(`${(e as Error).message}\n`); process.exit(1) })
