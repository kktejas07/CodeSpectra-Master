/**
 * GET /api/admin/exams/[id]/recordings — proctoring recordings of one test.
 *
 *   (no params)                 → every attempt with a recording: candidate,
 *                                 attempt, size, chunk count, upload failures.
 *   ?user_id=…                  → that candidate's attempts (summary only).
 *   ?user_id=…&attempt_no=N     → playlist for one attempt: per-stream chunks
 *                                 with offsets, gaps, and 30-minute
 *                                 viewer-bound URLs. Writes an audit row.
 *
 * Staff only: superadmin, or the exam's tenant admin.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, requireTenantEntity } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { auditAdmin } from '@/lib/admin-audit'
import { CHUNKS, MANIFESTS, RECORDING_STREAMS, buildPlaylist, candidateLookupFilter, candidateMap, chunkViewUrl, type RecordingChunkDoc, type RecordingManifest } from '@/lib/proctoring/recordings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { id: examId } = await ctx.params
  const userId = req.nextUrl.searchParams.get('user_id') || ''
  const attemptRaw = req.nextUrl.searchParams.get('attempt_no')
  try {
    const db = await getMongoDb()
    const owned = await requireTenantEntity(db, 'exams', examId, gate.user)
    if ('error' in owned) return NextResponse.json({ error: owned.error }, { status: owned.status })

    const filter: Record<string, unknown> = { exam_id: examId, ...(userId ? { user_id: userId } : {}) }
    const manifests = (await db.collection(MANIFESTS)
      .find(filter, { projection: { _id: 0 } })
      .sort({ updated_at: -1 })
      .limit(500)
      .toArray()) as unknown as RecordingManifest[]
    const userIds = [...new Set(manifests.map((m) => m.user_id))]
    // W4-03: accounts live in 'user'; manifests may hold id, _id or firebase_uid.
    const people = userIds.length
      ? await db.collection('user').find(candidateLookupFilter(userIds) as never, { projection: { _id: 1, id: 1, firebase_uid: 1, name: 1, full_name: 1, email: 1 } }).toArray()
      : []
    const who = candidateMap(people as Array<Record<string, unknown>>)
    const attempts = manifests.map((m) => ({
      user_id: m.user_id,
      attempt_no: m.attempt_no,
      candidate: who.get(m.user_id) ?? { name: '', email: '' },
      total_bytes: m.total_bytes || 0,
      chunk_count: m.chunk_count || 0,
      failed_uploads: m.failed_uploads || 0,
      last_error: m.last_error ?? null,
      last_error_at: m.last_error_at ?? null,
      duration_ms: m.first_chunk_at_ms && m.last_chunk_end_ms ? Math.max(0, m.last_chunk_end_ms - m.first_chunk_at_ms) : 0,
      started_at: m.first_chunk_at_ms ? new Date(m.first_chunk_at_ms).toISOString() : m.created_at,
    }))

    const attemptNo = Number(attemptRaw)
    if (!userId || !Number.isInteger(attemptNo) || attemptNo < 1) {
      return NextResponse.json({ exam: { id: examId, title: owned.doc.title ?? '' }, attempts })
    }

    const chunks = (await db.collection(CHUNKS)
      .find({ exam_id: examId, user_id: userId, attempt_no: attemptNo }, { projection: { _id: 0, id: 1, stream: 1, chunk_index: 1, started_at_ms: 1, duration_ms: 1, mime: 1, size: 1, has_audio: 1 } })
      .limit(2 * 600)
      .toArray()) as unknown as RecordingChunkDoc[]
    const playlist = buildPlaylist(chunks)
    const streams = Object.fromEntries(await Promise.all(RECORDING_STREAMS.map(async (s) => [
      s,
      await Promise.all(playlist.streams[s].map(async (it) => ({ ...it, url: await chunkViewUrl(it.id, gate.user.id) }))),
    ])))
    const manifest = manifests.find((m) => m.attempt_no === attemptNo) ?? null
    await auditAdmin(gate.user, 'proctor_recording.view', 'exam_attempt', `${examId}:${userId}:${attemptNo}`, `${chunks.length} chunks`)
    return NextResponse.json({
      exam: { id: examId, title: owned.doc.title ?? '' },
      attempts,
      recording: {
        user_id: userId,
        attempt_no: attemptNo,
        candidate: who.get(userId) ?? { name: '', email: '' },
        origin_ms: playlist.origin_ms,
        total_ms: playlist.total_ms,
        streams,
        gaps: playlist.gaps,
        failed_uploads: manifest?.failed_uploads || 0,
        failed_chunks: manifest?.failed_chunks ?? [],
        last_error: manifest?.last_error ?? null,
        has_audio: chunks.some((c) => c.stream === 'webcam' && c.has_audio),
      },
    })
  } catch (e) {
    console.error('[admin/recordings] GET:', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'Could not load recordings' }, { status: 500 })
  }
}
