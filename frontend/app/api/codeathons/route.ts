import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { codeathons, newId, nowIso, type CodeathonDoc } from '@/lib/db/content'
import type { Filter } from 'mongodb'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') as CodeathonDoc['status'] | null

  const filter: Filter<CodeathonDoc> = {}
  if (status) filter.status = status

  try {
    const col = await codeathons()
    const list = await col.find(filter).sort({ created_at: -1 }).toArray()
    return NextResponse.json(list)
  } catch (error) {
    console.error('[CodeSpectra] codeathons GET:', error)
    return NextResponse.json([])
  }
}

export async function POST(request: Request) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  try {
    const data = await request.json()
    const now = nowIso()
    const doc: CodeathonDoc = {
      id: newId(),
      title: String(data.title || 'Untitled codeathon'),
      description: String(data.description || ''),
      start_date: String(data.startDate || data.start_date || now),
      end_date: String(data.endDate || data.end_date || now),
      prize_pool: data.prizePool || data.prize_pool || null,
      participants: 0,
      status: (data.status as CodeathonDoc['status']) || 'upcoming',
      rules: data.rules || null,
      tracks: Array.isArray(data.tracks) ? data.tracks : [],
      created_by: gate.user.id,
      created_at: now,
      updated_at: now,
    }
    const col = await codeathons()
    await col.insertOne(doc)
    return NextResponse.json(doc, { status: 201 })
  } catch (error) {
    console.error('[CodeSpectra] codeathons POST:', error)
    return NextResponse.json({ error: 'Failed to create codeathon' }, { status: 400 })
  }
}
