/**
 * POST /api/proctor/session-recording — one proctoring video chunk (raw bytes).
 *
 * Query: exam_id, stream (webcam|screen), chunk (index), started_at (epoch ms),
 *        duration_ms, has_audio (0|1), audio_error.
 * Body:  the WebM bytes (Content-Type video/webm…), ≤ 8 MB.
 *
 * Only the candidate taking that exam may upload, while the attempt runs (plus
 * a short grace for the final flush). Rate-limited per user; bytes capped per
 * chunk and per attempt. Storage + playback: lib/proctoring/recordings.ts.
 *
 * Errors are for the recorder's retry loop — the candidate never sees them.
 * A storage failure is also noted on the attempt for the reviewer.
 *
 * POST ?report=failed (JSON { exam_id, stream, chunk, reason }) — the browser
 * gave up on a chunk after its retries; recorded for the reviewer.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { limitRequest } from '@/lib/rate-limit'
import { CHUNK_MAX_BYTES, parseChunkMeta, recordUploadFailure, storeRecordingChunk, uploadWindow, isRecordingStream } from '@/lib/proctoring/recordings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status })

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getAPIUser()
  if (!user) return bad('Unauthorized', 401)
  const q = req.nextUrl.searchParams
  const report = q.get('report') === 'failed'

  // ~2 streams × 1 chunk/min, with room for retries.
  const limited = await limitRequest(req, report ? 'rec-fail' : 'rec-chunk', user.id, report ? 60 : 30, 60_000)
  if (limited) return limited

  let examId = q.get('exam_id') || ''
  let failure: { stream: string; chunk: number; reason: string } | null = null
  if (report) {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return bad('Invalid JSON')
    examId = typeof body.exam_id === 'string' ? body.exam_id : ''
    failure = {
      stream: isRecordingStream(body.stream) ? body.stream : 'webcam',
      chunk: Number.isInteger(body.chunk) ? Number(body.chunk) : -1,
      reason: typeof body.reason === 'string' ? `client_${body.reason}` : 'client_upload_failed',
    }
  }
  if (!examId || examId.length > 128) return bad('exam_id required')

  if (!report) {
    const len = Number(req.headers.get('content-length') || '0')
    if (len > CHUNK_MAX_BYTES) return bad('Chunk too large', 413)
  }

  try {
    const db = await getMongoDb()
    const [exam, draft] = await Promise.all([
      db.collection('exams').findOne({ id: examId }, { projection: { _id: 0, id: 1, tenant_id: 1, duration: 1, ends_at: 1 } }),
      db.collection('exam_drafts').findOne({ exam_id: examId, user_id: user.id }, { projection: { _id: 0, attempt_no: 1, attempt_started_at: 1, submitted_at: 1 } }),
    ])
    const now = Date.now()
    const win = uploadWindow(draft as Record<string, unknown> | null, exam as Record<string, unknown> | null, now)
    if (!win.ok) return bad(win.error, 403)
    const ctx = { examId, userId: user.id, tenantId: (exam?.tenant_id as string | undefined) ?? null, attemptNo: win.attemptNo }

    if (report && failure) {
      await recordUploadFailure(db, ctx, { stream: failure.stream, chunk_index: failure.chunk, reason: failure.reason })
      return NextResponse.json({ ok: true })
    }

    const parsed = parseChunkMeta({
      stream: q.get('stream'),
      chunk_index: q.get('chunk'),
      started_at: q.get('started_at'),
      duration_ms: q.get('duration_ms'),
      mime: req.headers.get('content-type'),
      has_audio: q.get('has_audio') === '0' ? false : true,
      audio_error: q.get('audio_error') ?? undefined,
    }, { startMs: win.startMs, nowMs: now })
    if (!parsed.ok) return bad(parsed.error)

    const bytes = Buffer.from(await req.arrayBuffer())
    if (bytes.length > CHUNK_MAX_BYTES) return bad('Chunk too large', 413)
    const res = await storeRecordingChunk(db, ctx, parsed.meta, bytes)
    if (!res.ok) return bad(res.error, res.status)
    return NextResponse.json({ ok: true, id: res.id, duplicate: res.duplicate })
  } catch (e) {
    console.error('[session-recording] error:', e instanceof Error ? e.message : e)
    return bad('Failed to save recording chunk', 500)
  }
}
