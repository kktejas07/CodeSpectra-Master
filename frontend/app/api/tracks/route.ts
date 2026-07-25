import { NextResponse } from 'next/server'
import { getMongoDb } from '@/lib/mongodb'

export async function GET() {
  try {
    const db = await getMongoDb()
    const data = await db.collection('tracks').find({}).toArray()
    return NextResponse.json({ data })
  } catch { return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
