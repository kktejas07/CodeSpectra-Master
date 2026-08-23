import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { collabDocuments, getOrCreateDocument, nowIso, newId } from '@/lib/db/collab'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ponytail: known ceiling — any AUTHENTICATED user with the session UUID can
// read/write these docs (collab rooms are shared-link by design, ids are
// randomUUID so unguessable). If rooms ever need per-user ACLs, add a
// `participants: string[]` field on create and gate all three handlers on it.

/** GET /api/collab/[session] — fetch current document (with ?v= for conditional) */
export async function GET(req: NextRequest, ctx: { params: Promise<{ session: string }> }) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { session } = await ctx.params
  const clientVersion = Number(req.nextUrl.searchParams.get('v')) || 0

  const col = await collabDocuments()
  const doc = await col.findOne({ session_id: session })
  if (!doc) return NextResponse.json({ document: null })

  if (doc.version <= clientVersion) {
    return NextResponse.json({ changed: false, version: doc.version })
  }

  return NextResponse.json({
    changed: true,
    document: {
      id: doc.id,
      content: doc.content,
      language: doc.language,
      version: doc.version,
      last_editor_name: doc.last_editor_name,
      updated_at: doc.updated_at,
    },
  })
}

/** PATCH /api/collab/[session] — push document update */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ session: string }> }) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { session } = await ctx.params

  const body = await req.json().catch(() => ({})) as {
    content?: string; language?: string; version?: number
  }
  if (body.content === undefined) return NextResponse.json({ error: 'content required' }, { status: 400 })

  const col = await collabDocuments()
  const doc = await col.findOne({ session_id: session })

  if (doc) {
    const nextVersion = doc.version + 1
    await col.updateOne(
      { session_id: session },
      {
        $set: {
          content: body.content,
          language: body.language || doc.language,
          version: nextVersion,
          last_editor_id: gate.user.id,
          last_editor_name: gate.user.name || gate.user.email || 'Unknown',
          updated_at: nowIso(),
        },
      },
    )
    return NextResponse.json({ ok: true, version: nextVersion })
  }

  await col.insertOne({
    id: newId(),
    session_id: session,
    content: body.content,
    language: body.language || 'javascript',
    version: 1,
    last_editor_id: gate.user.id,
    last_editor_name: gate.user.name || gate.user.email || 'Unknown',
    created_at: nowIso(),
    updated_at: nowIso(),
  })
  return NextResponse.json({ ok: true, version: 1 })
}

/** DELETE /api/collab/[session] — reset document to template */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ session: string }> }) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { session } = await ctx.params

  const { getOrCreateDocument } = await import('@/lib/db/collab')
  const doc = await getOrCreateDocument(session, 'javascript')
  return NextResponse.json({ ok: true, document: doc })
}
