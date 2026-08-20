import { NextResponse } from 'next/server'
import { getMongoDb } from '@/lib/mongodb'

export async function GET() {
  try {
    const db = await getMongoDb()
    const result = await db.collection('users').updateMany(
      {}, 
      { $set: { aiCredits: 100, creditsResetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } }
    )
    return NextResponse.json({ success: true, updated: result.modifiedCount })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
