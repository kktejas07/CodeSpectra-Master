/**
 * POST /api/exams/[id]/identity — store the candidate's identity check for
 * their current attempt. Start and submit (main test and CAD) refuse an
 * attempt without a stored result that satisfies the test's settings
 * (lib/exam-access.ts identityCheckSatisfies), so this step can't be skipped
 * by calling those APIs directly.
 *
 * Two shapes:
 *  - JSON { method: 'camera', idPhoto?, facePhoto?, faceMatch?, inviteToken?, linkToken? }
 *    Webcam flow: ID card photo + live face photo (as the test requires).
 *    `faceMatch` is the browser's face-api comparison — stored as advisory only.
 *  - multipart { file, reason, inviteToken?, linkToken? }
 *    No camera / camera blocked, allowed only when the test's
 *    no_camera_policy is 'allow_flag'. The ID image is type/size checked and
 *    virus-scanned; the attempt is flagged for manual identity review.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { newId, nowIso, proctorEvents } from '@/lib/db/ai'
import { backendPost } from '@/lib/ai/backend'
import { rateLimitSlidingWindow } from '@/lib/in-memory-rate-limit'
import {
  attemptTimeState,
  checkExamEntry,
  examIdentityPolicy,
  getExamDraft,
  identityCheckSatisfies,
  identityRequirement,
  sanitizeFaceMatch,
  saveIdentityCheck,
  NO_CAMERA_REVIEW_LABEL,
  type IdentityCheckRecord,
} from '@/lib/exam-access'
import { toMediaRef } from '@/lib/identity-media'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
const MAX_ID_DATA_URL = 7_000_000
const MAX_FACE_DATA_URL = 2_000_000
const UPLOAD_TYPES: Record<string, string> = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' }
const NO_CAMERA_REASONS = ['no_device', 'permission_denied', 'error'] as const

/** Image type from the file's first bytes (never trust the declared type alone). */
function sniffImage(bytes: Uint8Array): 'jpeg' | 'png' | 'webp' | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg'
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png'
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'webp'
  return null
}

/** A data:image URL whose bytes really are that image type, or null. */
function dataUrlImage(v: unknown, maxChars: number): string | null {
  if (typeof v !== 'string' || v.length > maxChars) return null
  const m = /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=]+)$/.exec(v)
  if (!m) return null
  const head = Buffer.from(m[2].slice(0, 64), 'base64')
  const kind = sniffImage(head)
  const declared = m[1] === 'jpg' ? 'jpeg' : m[1]
  return kind && kind === declared ? v : null
}

/** ClamAV via the backend — the same scanner and verdicts as CAD uploads
 *  (app/api/exams/[id]/cad-submission/files). Malware is rejected; an
 *  unreachable scanner doesn't strand the candidate: the upload is kept as
 *  'unscanned' and reviewers see that. */
async function scanFile(bytes: Buffer, filename: string): Promise<'clean' | 'unscanned' | 'infected'> {
  try {
    await Promise.race([
      backendPost('/internal/security/scan', { file_base64: bytes.toString('base64'), filename }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('scan timeout')), 30_000)),
    ])
    return 'clean'
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/returned (400|422)\b/.test(msg)) return 'infected'
    console.error('[exams/identity] scanner unavailable:', msg.slice(0, 200))
    return 'unscanned'
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth().catch(() => null)
  if (!gate || 'error' in gate) {
    return NextResponse.json({ error: 'You must be signed in to take this assessment.' }, { status: 401 })
  }
  const { id: userId, email } = gate.user
  const { id: examId } = await ctx.params

  const rl = rateLimitSlidingWindow(`exam-identity:${userId}:${examId}`, 20, 10 * 60_000)
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many tries. Wait a few minutes and try again.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  const isMultipart = (req.headers.get('content-type') || '').toLowerCase().startsWith('multipart/form-data')
  let form: FormData | null = null
  let body: Record<string, unknown> = {}
  try {
    if (isMultipart) form = await req.formData()
    else body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'The upload could not be read. Use an image under 5 MB.' }, { status: 400 })
  }
  const field = (k: string): string | null => {
    const v = form ? form.get(k) : body[k]
    return typeof v === 'string' && v ? v : null
  }
  const inviteToken = field('inviteToken')
  const linkToken = field('linkToken')

  try {
    const db = await getMongoDb()
    const exam = (await db.collection('exams').findOne({ id: examId })) as Record<string, unknown> | null
    if (!exam || !exam.published) return NextResponse.json({ error: 'Exam not found' }, { status: 404 })

    // Same entry checks as start. Re-checking identity on an attempt that is
    // already running (resume after the window closed) is allowed.
    let access = await checkExamEntry(db, exam, { id: userId, email }, { inviteToken, linkToken })
    if (!access.ok) {
      const draft = await getExamDraft(db, examId, userId)
      const late = draft
        ? await checkExamEntry(db, exam, { id: userId, email }, { inviteToken, linkToken }, { ignoreWindowClose: true })
        : null
      if (!late || !late.ok || attemptTimeState(exam, draft, late.attemptNo).status === 'not_started') {
        return NextResponse.json({ error: access.error }, { status: access.status })
      }
      access = late
    }

    const policy = examIdentityPolicy(exam)
    const now = nowIso()
    const base = {
      id: newId(),
      exam_id: examId,
      tenant_id: exam.tenant_id ?? null,
      user_id: userId,
      email,
      attempt_no: access.attemptNo,
      created_at: now,
      updated_at: now,
    }

    const mediaCtx = { examId, userId, tenantId: typeof exam.tenant_id === 'string' ? exam.tenant_id : null }
    let record: typeof base & IdentityCheckRecord & Record<string, unknown>
    if (isMultipart && form) {
      // ─── No camera: uploaded ID photo ───────────────────────────────────
      if (identityRequirement(policy, false).kind !== 'upload_id') {
        return NextResponse.json({ error: 'This test needs a working camera. Connect one or allow camera access, then try again.' }, { status: 403 })
      }
      const file = form.get('file')
      if (!(file instanceof File)) return NextResponse.json({ error: 'Choose a photo of your ID.' }, { status: 400 })
      if (!UPLOAD_TYPES[file.type]) return NextResponse.json({ error: 'Use a JPG, PNG or WebP image.' }, { status: 400 })
      if (file.size <= 0) return NextResponse.json({ error: 'This file is empty.' }, { status: 400 })
      if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: 'The photo must be under 5 MB.' }, { status: 413 })
      const bytes = Buffer.from(await file.arrayBuffer())
      if (bytes.length > MAX_UPLOAD_BYTES) return NextResponse.json({ error: 'The photo must be under 5 MB.' }, { status: 413 })
      const kind = sniffImage(bytes)
      if (!kind) return NextResponse.json({ error: 'This file isn’t a JPG, PNG or WebP image.' }, { status: 400 })
      const scan = await scanFile(bytes, `id-photo.${kind === 'jpeg' ? 'jpg' : kind}`)
      if (scan === 'infected') {
        return NextResponse.json({ error: 'The security scanner rejected this file. Take a new photo of your ID and try again.' }, { status: 400 })
      }
      const reasonRaw = field('reason')
      const reason = (NO_CAMERA_REASONS as readonly string[]).includes(reasonRaw || '') ? reasonRaw : 'no_device'
      record = {
        ...base,
        method: 'no_camera_upload',
        // Encrypted at rest, stored outside the record (lib/identity-media.ts) — the record keeps "media:<id>".
        id_photo: await toMediaRef(`data:image/${kind};base64,${bytes.toString('base64')}`, { ...mediaCtx, kind: 'id' }),
        face_photo: null,
        face_match: null,
        no_camera_reason: reason,
        upload_scan_status: scan,
        upload_size: bytes.length,
        needs_manual_review: true,
      }
    } else {
      // ─── Camera flow ────────────────────────────────────────────────────
      if (body.method !== 'camera') return NextResponse.json({ error: 'Unknown identity check.' }, { status: 400 })
      const idPhoto = policy.requireId ? await toMediaRef(dataUrlImage(body.idPhoto, MAX_ID_DATA_URL), { ...mediaCtx, kind: 'id' }) : null
      const facePhoto = policy.requireFace ? await toMediaRef(dataUrlImage(body.facePhoto, MAX_FACE_DATA_URL), { ...mediaCtx, kind: 'face' }) : null
      record = {
        ...base,
        method: 'camera',
        id_photo: idPhoto,
        face_photo: facePhoto,
        face_match: idPhoto && facePhoto ? sanitizeFaceMatch(body.faceMatch) : null,
        no_camera_reason: null,
        upload_scan_status: null,
        // The ID name only partly matched the account (id-ocr route, A-005) → reviewer checks it.
        needs_manual_review: body.nameMatch === 'partial',
        ...(body.nameMatch === 'partial' ? { name_match: 'partial' } : {}),
      }
    }

    const verdict = identityCheckSatisfies(policy, record)
    if (!verdict.ok) return NextResponse.json({ error: verdict.error }, { status: 400 })

    await saveIdentityCheck(db, record)

    // Proctoring timeline: the no-camera case is a review flag, the normal case is informational.
    const faceMatch = record.face_match as Record<string, unknown> | null
    const col = await proctorEvents()
    await col.insertOne({
      id: newId(),
      user_id: userId,
      session_kind: 'exam',
      session_id: examId,
      event_type: record.method === 'no_camera_upload' ? 'identity_no_camera' : 'identity_check_completed',
      meta: record.method === 'no_camera_upload'
        ? { label: NO_CAMERA_REVIEW_LABEL, reason: String(record.no_camera_reason), scan: String(record.upload_scan_status), attempt_no: access.attemptNo, source: 'server' }
        : {
            id_photo: !!record.id_photo,
            face_photo: !!record.face_photo,
            ...(faceMatch?.status === 'compared' ? { face_similarity: Number(faceMatch.similarity), face_match_advisory: faceMatch.likely_match ? 'likely same person' : 'may differ — review photos' } : {}),
            attempt_no: access.attemptNo,
            source: 'server',
          },
      created_at: now,
    }).catch((e) => console.error('[exams/identity] proctor event failed:', e))

    return NextResponse.json({
      ok: true,
      method: record.method,
      needs_manual_review: record.needs_manual_review === true,
      attempt_no: access.attemptNo,
    })
  } catch (e) {
    console.error('[exams/identity] POST:', e)
    return NextResponse.json({ error: 'Could not save your identity check. Try again.' }, { status: 500 })
  }
}
