import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { permissions } from '@/lib/db/admin'

/**
 * GET /api/roles — list permission definitions.
 * Phase 4 migration: reads from MongoDB `permissions` collection. Returns
 * an empty array when the collection is empty (no seed yet).
 */
export async function GET() {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  try {
    const col = await permissions()
    const roles = await col.find({}).toArray()
    return NextResponse.json(roles)
  } catch (error) {
    console.error('Error fetching roles:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
