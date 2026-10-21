/**
 * /api/interview-sim/[id]/recording (owner only; the session opted into recording)
 *
 * POST JSON  { action: 'start', size, mime } → presigned PUT to the private bucket
 *            (409 { inline: true } when object storage is off: send multipart instead)
 *            { action: 'finish', upload_id, duration_s? } → size + magic bytes + scan → saved
 * POST multipart  file (≤ 9 MB), duration_s — the small-file path without object storage
 * GET    → { url } (presigned, ≤ 5 min) or the bytes for inline storage
 * DELETE → removes the recording now
 *
 * Recordings expire after the admin's retention (default 30 days); the
 * scheduler deletes them (lib/interview-sim/store sweepExpiredRecordings).
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { limitRequest } from '@/lib/rate-limit'
import { SESSION_ID_RE, serverError, simUser } from '@/lib/interview-sim/http'
import { ANSWER_FILE_MAX_MB } from '@/lib/question-extensions'
import { sniffAnswerFile } from '@/lib/upload-sniff'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

type Ctx = { params: Promise<{ id: string }> }
const MIMES = ['video/webm', 'audio/webm', 'video/mp4', 'audio/mp4'] as const
type Mime = (typeof MIMES)[number]
const kindOf = (m: string) => (m.endsWith('mp4') ? 'mp4' : 'webm') as 'mp4' | 'webm'
const INLINE_MAX = ANSWER_FILE_MAX_MB * 1048576

const body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start'), size: z.number().int().positive(), mime: z.enum(MIMES) }),
  z.object({ action: z.literal('finish'), upload_id: z.string().max(40), duration_s: z.number().nonnegative().max(4 * 3600).optional() }),
])

async function ownSession(id: string, userId: string) {
  const { getOwnSession, getSimSettings } = await import('@/lib/interview-sim/store')
  const [s, settings] = await Promise.all([getOwnSession(id, userId), getSimSettings()])
  if (!s) return { error: NextResponse.json({ error: 'Interview not found.' }, { status: 404 }) }
  if (!s.config.record || !settings.allow_recordings) return { error: NextResponse.json({ error: 'Recording is off for this interview.' }, { status: 400 }) }
  return { s, settings }
}

async function saveRecording(p: { sessionId: string; userId: string; retentionDays: number; blob: { storage: 'db'; data: Buffer } | { storage: 's3'; s3_key: string }; size: number; mime: string; durationS?: number; scan: string }) {
  const { recordings, deleteRecording } = await import('@/lib/interview-sim/store')
  const { newId } = await import('@/lib/db/ids')
  await deleteRecording(p.sessionId, p.userId)
  const now = new Date()
  const expires = new Date(now.getTime() + p.retentionDays * 86_400_000)
  await (await recordings()).insertOne({
    id: newId(), session_id: p.sessionId, user_id: p.userId, ...p.blob, size: p.size, mime: p.mime,
    ...(p.durationS ? { duration_s: Math.round(p.durationS) } : {}), scan_status: p.scan, created_at: now.toISOString(), expires_at: expires,
    ...(p.blob.storage === 'db' ? { purge_at: new Date(expires.getTime() + 2 * 86_400_000) } : {}),
  })
  return { size: p.size, mime: p.mime, expires_at: expires.toISOString() }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const g = await simUser()
  if ('res' in g) return g.res
  const { id } = await ctx.params
  if (!SESSION_ID_RE.test(id)) return NextResponse.json({ error: 'Interview not found.' }, { status: 404 })
  const limited = await limitRequest(req, 'interview-sim-recording', g.user.id, 20, 10 * 60_000)
  if (limited) return limited
  try {
    const own = await ownSession(id, g.user.id)
    if ('error' in own) return own.error
    const scope = `interview-sim:${id}`
    const isMultipart = (req.headers.get('content-type') || '').includes('multipart/form-data')

    if (isMultipart) {
      let form: FormData
      try { form = await req.formData() } catch { return NextResponse.json({ error: `Recordings must be under ${ANSWER_FILE_MAX_MB} MB here.` }, { status: 413 }) }
      const file = form.get('file')
      if (!(file instanceof File) || file.size <= 0) return NextResponse.json({ error: 'No recording was sent.' }, { status: 400 })
      if (file.size > INLINE_MAX) return NextResponse.json({ error: `Recordings must be under ${ANSWER_FILE_MAX_MB} MB here.` }, { status: 413 })
      const mime = (MIMES as readonly string[]).includes(file.type.split(';')[0]) ? (file.type.split(';')[0] as Mime) : 'video/webm'
      const bytes = Buffer.from(await file.arrayBuffer())
      if (!sniffAnswerFile(new Uint8Array(bytes), kindOf(mime))) return NextResponse.json({ error: 'That file is not a WebM or MP4 recording.' }, { status: 400 })
      const { scanBuffer } = await import('@/lib/storage/scan')
      const scan = await scanBuffer(bytes, `recording.${kindOf(mime)}`)
      if (scan === 'infected') return NextResponse.json({ error: 'The security scanner rejected this file.' }, { status: 400 })
      const { putBlob } = await import('@/lib/storage/blobs')
      const blob = await putBlob({ feature: 'interview-sim', tenantId: null, bytes, contentType: mime })
      const durationS = Number(form.get('duration_s')) || undefined
      const recording = await saveRecording({ sessionId: id, userId: g.user.id, retentionDays: own.settings.recording_retention_days, blob, size: bytes.length, mime, durationS, scan })
      return NextResponse.json({ recording }, { status: 201 })
    }

    const parsed = body.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    const { startDirectUpload, finishDirectUpload, claimUpload } = await import('@/lib/storage/uploads')
    const { largeUploadLimits } = await import('@/lib/storage/config')
    if (parsed.data.action === 'start') {
      const r = await startDirectUpload({
        feature: 'interview-sim', tenantId: null, ownerId: g.user.id, scope, name: `recording.${kindOf(parsed.data.mime)}`, size: parsed.data.size,
        contentType: parsed.data.mime, maxBytes: largeUploadLimits().videoBytes, allowedTypes: MIMES, meta: { mime: parsed.data.mime },
      })
      if (!r.ok) return NextResponse.json({ error: r.error, ...('inline' in r ? { inline: true } : {}) }, { status: r.status })
      return NextResponse.json(r, { status: 201 })
    }
    const done = await finishDirectUpload({
      uploadId: parsed.data.upload_id, ownerId: g.user.id, scope, scanMode: 'soft',
      sniff: (head, doc) => sniffAnswerFile(head, kindOf(String(doc.meta?.mime || doc.content_type))),
      sniffError: 'That file is not a WebM or MP4 recording.',
    })
    if (!done.ok) return NextResponse.json({ error: done.error }, { status: done.status })
    const up = await claimUpload({ uploadId: parsed.data.upload_id, ownerId: g.user.id, scope })
    if (!up) return NextResponse.json({ error: 'This upload was already used.' }, { status: 409 })
    const recording = await saveRecording({
      sessionId: id, userId: g.user.id, retentionDays: own.settings.recording_retention_days, blob: { storage: 's3', s3_key: up.key },
      size: up.size, mime: up.content_type, durationS: parsed.data.duration_s, scan: up.scan_status || 'unscanned',
    })
    return NextResponse.json({ recording }, { status: 201 })
  } catch (e) {
    return serverError('recording', e)
  }
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const g = await simUser()
  if ('res' in g) return g.res
  const { id } = await ctx.params
  if (!SESSION_ID_RE.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  try {
    const { recordings } = await import('@/lib/interview-sim/store')
    const rec = await (await recordings()).findOne({ session_id: id, user_id: g.user.id }, { projection: { _id: 0 } })
    if (!rec || rec.expires_at.getTime() <= Date.now()) return NextResponse.json({ error: 'No recording for this interview.' }, { status: 404 })
    const { blobDownloadUrl, bytesOf } = await import('@/lib/storage/blobs')
    if (rec.storage === 's3') {
      const url = await blobDownloadUrl(rec, `interview-${id}.${kindOf(rec.mime)}`, rec.mime)
      if (!url) return NextResponse.json({ error: 'The recording is not available right now.' }, { status: 503 })
      return NextResponse.json({ url })
    }
    const bytes = bytesOf(rec.data)
    if (!bytes) return NextResponse.json({ error: 'No recording for this interview.' }, { status: 404 })
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': rec.mime, 'Content-Length': String(bytes.length), 'Cache-Control': 'private, no-store',
        'Content-Disposition': `inline; filename="interview-${id}.${kindOf(rec.mime)}"`, 'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (e) {
    return serverError('recording-get', e)
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const g = await simUser()
  if ('res' in g) return g.res
  const { id } = await ctx.params
  if (!SESSION_ID_RE.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  try {
    const { deleteRecording } = await import('@/lib/interview-sim/store')
    const ok = await deleteRecording(id, g.user.id)
    return NextResponse.json({ ok })
  } catch (e) {
    return serverError('recording-delete', e)
  }
}
