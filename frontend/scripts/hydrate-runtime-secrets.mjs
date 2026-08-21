#!/usr/bin/env node
/**
 * Load SESSION_SECRET + INTERNAL_BACKEND_SECRET from Mongo into this process
 * before `next start`. Dokploy rebuilds re-apply only Dokploy-stored env and
 * drop ad-hoc `docker service update --env-add` values — Mongo is the durable
 * copy (platform_settings.key = "secrets").
 *
 * Prints POSIX `export KEY='value'` lines to stdout for `eval`. Logs to stderr.
 * Never prints secret values. Missing Mongo URI → empty stdout, exit 0.
 */
import { randomBytes } from 'node:crypto'
import { MongoClient } from 'mongodb'

const MIN = 32
const FIELDS = [
  ['session_secret', 'SESSION_SECRET'],
  ['internal_backend_secret', 'INTERNAL_BACKEND_SECRET'],
]

function usable(value) {
  const s = String(value || '').trim()
  return s.length >= MIN && !s.includes('•')
}

function shellExport(key, value) {
  return `export ${key}='${String(value).replace(/'/g, `'\\''`)}'`
}

async function ensureField(col, field, envVal) {
  const doc = await col.findOne({ key: 'secrets' })
  const stored = String(doc?.value?.[field] || '').trim()
  if (usable(stored)) return stored
  const candidate = usable(envVal) ? String(envVal).trim() : randomBytes(32).toString('hex')
  await col.updateOne(
    { key: 'secrets' },
    { $set: { [`value.${field}`]: candidate } },
    { upsert: true },
  )
  const fresh = await col.findOne({ key: 'secrets' })
  const won = String(fresh?.value?.[field] || '').trim()
  return usable(won) ? won : candidate
}

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URL || process.env.MONGODB_URI_FALLBACK || ''
  if (!uri) {
    console.error('[hydrate] no MONGODB_URI/MONGO_URL — skip')
    return
  }
  const dbName = process.env.MONGODB_DB_NAME || 'codespectra'
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 })
  try {
    await client.connect()
    const col = client.db(dbName).collection('platform_settings')
    for (const [field, envKey] of FIELDS) {
      const value = await ensureField(col, field, process.env[envKey])
      process.stdout.write(shellExport(envKey, value) + '\n')
      console.error(`[hydrate] ${envKey}=SET`)
    }
  } finally {
    await client.close().catch(() => {})
  }
}

main().catch((err) => {
  console.error(`[hydrate] skipped: ${err?.message || err}`)
  process.exit(0)
})
