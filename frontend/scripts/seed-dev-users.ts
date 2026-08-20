/**
 * One-time seed script for dev user accounts with password hashes.
 *
 * Usage:
 *   npx tsx scripts/seed-dev-users.ts
 *
 * Reads MONGODB_URI from .env.local or defaults to localhost.
 */
import { MongoClient } from 'mongodb'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'

function loadEnv() {
  const envPath = path.resolve(__dirname, '..', '.env.local')
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z0-9_]+)\s*=\s*(.*)$/)
      if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
    }
  }
}

loadEnv()

const DEV_ACCOUNTS = [
  { email: 'superadmin@codespectra.com', password: process.env.SEED_SUPERADMIN_PASS || 'ChangeMe123!', role: 'superadmin', name: 'Super Admin' },
  { email: 'admin@codespectra.com', password: process.env.SEED_ADMIN_PASS || 'ChangeMe123!', role: 'tenant_admin', name: 'Tenant Admin' },
  { email: 'demo@codespectra.com', password: process.env.SEED_DEMO_PASS || 'ChangeMe123!', role: 'user', name: 'Demo User' },
  { email: 'qa@codespectra.ai', password: process.env.SEED_QA_PASS || 'ChangeMe123!', role: 'superadmin', name: 'QA Admin' },
]

async function main() {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    console.error('MONGODB_URI environment variable is required')
    process.exit(1)
  }
  console.log(`Connecting to ${uri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')} …`)
  const client = new MongoClient(uri)
  await client.connect()
  const db = client.db(process.env.MONGODB_DB_NAME || 'codespectra')
  const col = db.collection('user')

  for (const acc of DEV_ACCOUNTS) {
    const existing = await col.findOne({ email: acc.email })
    const passwordHash = await bcrypt.hash(acc.password, 12)

    if (existing) {
      await col.updateOne(
        { email: acc.email },
        { $set: { passwordHash, role: acc.role, updatedAt: new Date() } },
      )
      console.log(`  ✓ ${acc.email} — updated (passwordHash + role: ${acc.role})`)
    } else {
      const uid = randomUUID()
      await col.insertOne({
        _id: uid,
        email: acc.email,
        name: acc.name,
        passwordHash,
        role: acc.role,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any)
      console.log(`  ✓ ${acc.email} — created (role: ${acc.role})`)
    }
  }

  await client.close()
  console.log('Done.')
}

main().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
