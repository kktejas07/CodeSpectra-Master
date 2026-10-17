import { NextResponse } from 'next/server'
import { getMongoDb } from '@/lib/mongodb'
import { requireSuperAdmin } from '@/lib/route-auth'

export async function GET() {
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  try {
    const db = await getMongoDb()
    const result = await db.collection('users').updateMany(
      {}, 
      { $set: { aiCredits: 100, creditsResetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } }
    )
    return NextResponse.json({ success: true, updated: result.modifiedCount })
  } catch (e: unknown) {
    console.error('[CodeSpectra] admin/reset-credits:', e)
    return NextResponse.json({ error: 'Failed to reset credits' }, { status: 500 })
  }
}
