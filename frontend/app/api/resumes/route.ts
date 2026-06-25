import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { resumes, newId, nowIso, type ResumeDoc } from '@/lib/db/content'

export async function GET() {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  try {
    const col = await resumes()
    const list = await col
      .find({ user_id: gate.user.id })
      .sort({ uploaded_at: -1 })
      .toArray()
    return NextResponse.json(list)
  } catch (error) {
    console.error('[CodeSpectra] resumes GET:', error)
    return NextResponse.json([])
  }
}

export async function POST(request: Request) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  try {
    const body = (await request.json()) as Partial<ResumeDoc>
    const doc: ResumeDoc = {
      id: newId(),
      user_id: gate.user.id,
      file_name: String(body.file_name || 'resume.pdf'),
      file_size: Number(body.file_size ?? 0),
      storage_url: body.storage_url ?? null,
      is_primary: false,
      status: 'uploaded',
      analysis: null,
      uploaded_at: nowIso(),
    }
    const col = await resumes()
    await col.insertOne(doc)
    return NextResponse.json(doc, { status: 201 })
  } catch (error) {
    console.error('[CodeSpectra] resumes POST:', error)
    return NextResponse.json({ error: 'Failed to upload resume' }, { status: 400 })
  }
}
