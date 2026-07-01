import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  try {
    const db = await getMongoDb()
    const id = params.id

    let doc = null
    try {
      doc = await db.collection('challenges').findOne({ _id: new ObjectId(id) })
    } catch {
      doc = await db.collection('challenges').findOne({ slug: id })
    }

    if (!doc) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json({
      id: doc._id.toString(),
      title: doc.title,
      description: doc.description,
      examples: doc.examples || [],
      initialCode: doc.initialCode || doc.starterCode || '',
    })
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
