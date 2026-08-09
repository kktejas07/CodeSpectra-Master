/**
 * Data migration: Backfill tenant_id on existing entities.
 *
 * Run: npx tsx scripts/migrate-tenant-id.ts
 *
 * Logic:
 * - For each entity, find documents where tenant_id is missing/null
 * - Assign them to a default "platform" tenant (or leave null for superadmin visibility)
 * - Reports what was migrated
 */
import { getMongoDb } from '@/lib/mongodb'

const COLLECTIONS = [
  'hackathons',
  'exams',
  'challenges',
  'certifications',
  'interviews',
  'jobs',
  'workflows',
  'codeathons',
]

async function main() {
  console.log('Starting tenant_id backfill migration...\n')
  const db = await getMongoDb()

  // Ensure default tenant exists
  const tenants = db.collection('tenants')
  const defaultTenant = await tenants.findOne({ slug: 'platform' })
  if (!defaultTenant) {
    await tenants.insertOne({
      id: 'tenant_platform',
      name: 'Platform (Default)',
      slug: 'platform',
      plan: 'enterprise',
      is_active: true,
      member_count: 0,
      created_at: new Date().toISOString(),
      created_by: 'system',
    } as any)
    console.log('Created default "platform" tenant (tenant_platform)\n')
  }

  let totalMigrated = 0

  for (const collection of COLLECTIONS) {
    const col = db.collection(collection)
    const count = await col.countDocuments({ tenant_id: { $exists: false } })
    const nullCount = await col.countDocuments({ tenant_id: null })

    if (count === 0 && nullCount === 0) {
      console.log(`  ${collection}: already has tenant_id on all documents`)
      continue
    }

    // Set tenant_id to null (superadmin sees all null-tenant entities)
    const result = await col.updateMany(
      { tenant_id: { $exists: false } },
      { $set: { tenant_id: null } },
    )

    console.log(`  ${collection}: ${result.modifiedCount} documents backfilled (tenant_id: null)`)
    totalMigrated += result.modifiedCount
  }

  console.log(`\nMigration complete. ${totalMigrated} documents updated.`)
  console.log('Existing documents with no tenant_id are now visible to superadmin only (tenant_id: null).')
  console.log('New documents created by tenant_admin will have tenant_id set automatically.')
}

main().catch((e) => {
  console.error('Migration failed:', e)
  process.exit(1)
})
