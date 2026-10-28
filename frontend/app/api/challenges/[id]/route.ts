import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  try {
    const db = await getMongoDb()
    const { id } = await params

    let doc = null
    try {
      doc = await db.collection('challenges').findOne({ _id: new ObjectId(id) })
    } catch {
      // Not an ObjectId — fall back to the stable string id / slug the seeds use.
    }
    if (!doc) {
      doc = await db.collection('challenges').findOne({ $or: [{ id }, { slug: id }] })
    }

    if (!doc) {
      return NextResponse.json({ error: 'Not found', code: 'not_found' }, { status: 404 })
    }

    return NextResponse.json({
      id: doc._id.toString(),
      title: doc.title,
      description: doc.description,
      examples: doc.examples || [],
      initialCode: doc.initialCode || doc.starterCode || '',
    })
  } catch {
    return NextResponse.json({ error: 'Failed', code: 'failed' }, { status: 500 })
  }
}
