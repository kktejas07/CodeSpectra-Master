/**
 * POST /api/exams/[id]/answer-files — upload the file for one file_upload or
 * video_response question in the candidate's running attempt (multipart:
 * file, question_id, duration_s?, inviteToken?, linkToken?).
 *
 * Checks: signed in, same entry gate as submit (lib/exam-access.ts), an
 * attempt that is started and not past its deadline, the question exists and
 * takes files, the type is one the author allowed (extension AND magic bytes,
 * lib/upload-sniff.ts), the size cap, and the virus scanner. The file is
 * stored in `exam_submission_files` (kind 'answer'); the answer itself only
 * carries its id. Reviewers download it through the existing
 * /api/exams/[id]/cad-submission/files/[fileId] route (staff or owner only,
 * always as an attachment).
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { newId, nowIso } from '@/lib/db/ids'
import { attemptTimeState, checkExamEntry, ensureExamIndexes, getExamDraft, isExamStaff } from '@/lib/exam-access'
import { limitRequest } from '@/lib/rate-limit'
import { backendPost } from '@/lib/ai/backend'
import { sniffAnswerFile, type AnswerFileKind } from '@/lib/upload-sniff'
import { canonicalType } from '@/lib/question-types'
import { ANSWER_FILE_MAX_MB, VIDEO_FILE_EXTS, extendedFieldsOf, uploadKindForName } from '@/lib/question-extensions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Same ClamAV path as the CAD upload: malware is rejected, an unreachable scanner marks the file 'unscanned'. */
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
    console.error('[answer-files] scanner unavailable:', msg.slice(0, 200))
    return 'unscanned'
  }
}

function safeName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() || 'file'
  return base.replace(/[\u0000-\u001f"<>|:*?]/g, '_').slice(0, 200) || 'file'
}

const CONTENT_TYPES: Record<AnswerFileKind, string> = {
  pdf: 'application/pdf', image: 'application/octet-stream', docx: 'application/octet-stream', xlsx: 'application/octet-stream',
  pptx: 'application/octet-stream', zip: 'application/zip', text: 'text/plain', webm: 'video/webm', mp4: 'video/mp4',
}

/**
 * GET — answer-file metadata (never bytes). Staff pass ?user_id= to see a
 * candidate's files (the review page only links files that really belong to
 * that candidate); anyone else gets their own.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { id: examId } = await ctx.params
  try {
    const db = await getMongoDb()
    const exam = await db.collection('exams').findOne({ id: examId }, { projection: { tenant_id: 1 } })
    if (!exam) return NextResponse.json({ error: 'Exam not found' }, { status: 404 })
    const asked = req.nextUrl.searchParams.get('user_id')
    const staff = isExamStaff(gate.user, exam as Record<string, unknown>)
    const userId = staff && asked && /^[A-Za-z0-9_-]{1,128}$/.test(asked) ? asked : gate.user.id
    const files = await db.collection('exam_submission_files')
      .find({ exam_id: examId, user_id: userId, kind: 'answer' }, { projection: { _id: 0, id: 1, question_id: 1, attempt_no: 1, name: 1, size: 1, type: 1, scan_status: 1, uploaded_at: 1, duration_s: 1 } })
      .sort({ uploaded_at: -1 })
      .limit(200)
      .toArray()
    return NextResponse.json({ files })
  } catch (e) {
    console.error('[answer-files] GET:', e instanceof Error ? e.message : 'error')
    return NextResponse.json({ error: 'Failed to load files' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth().catch(() => null)
  if (!gate || 'error' in gate) return NextResponse.json({ error: 'You must be signed in to take this assessment.' }, { status: 401 })
  const user = gate.user
  const { id: examId } = await ctx.params

  const limited = await limitRequest(req, 'answer-upload', user.id, 20, 10 * 60_000)
  if (limited) return limited

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: `Upload could not be read. Files must be under ${ANSWER_FILE_MAX_MB} MB.` }, { status: 400 })
  }
  const file = form.get('file')
  const questionId = String(form.get('question_id') || '')
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(questionId)) return NextResponse.json({ error: 'Unknown question' }, { status: 400 })
  if (file.size <= 0) return NextResponse.json({ error: 'This file is empty.' }, { status: 400 })
  const name = safeName(file.name)

  try {
    const db = await getMongoDb()
    const exam = await db.collection('exams').findOne({ id: examId })
    if (!exam) return NextResponse.json({ error: 'Exam not found' }, { status: 404 })
    const access = await checkExamEntry(db, exam as Record<string, unknown>, { id: user.id, email: user.email }, {
      inviteToken: String(form.get('inviteToken') || '') || null,
      linkToken: String(form.get('linkToken') || '') || null,
    })
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })
    const draft = await getExamDraft(db, examId, user.id)
    const time = attemptTimeState(exam as Record<string, unknown>, draft, access.attemptNo)
    if (time.status === 'not_started') return NextResponse.json({ error: 'Start the assessment before uploading.' }, { status: 409 })
    if (time.status === 'expired') return NextResponse.json({ error: 'Time is up for this attempt.' }, { status: 409 })

    const list = (Array.isArray(exam.questionList) ? exam.questionList : Array.isArray(exam.questions) ? exam.questions : []) as Record<string, unknown>[]
    const q = list.find((x) => String(x?.id) === questionId)
    const type = q ? canonicalType(q.type) : null
    if (!q || (type !== 'file_upload' && type !== 'video_response')) return NextResponse.json({ error: 'This question does not take files.' }, { status: 400 })
    const ext = extendedFieldsOf(q)

    let kind: AnswerFileKind
    let maxBytes: number
    if (type === 'video_response') {
      const lower = name.toLowerCase()
      if (!VIDEO_FILE_EXTS.some((e) => lower.endsWith(e))) return NextResponse.json({ error: 'Recordings must be WebM or MP4.' }, { status: 400 })
      kind = lower.endsWith('.mp4') ? 'mp4' : 'webm'
      maxBytes = ANSWER_FILE_MAX_MB * 1024 * 1024
    } else {
      const allowed = ext.upload?.allowed ?? ['pdf']
      const k = uploadKindForName(name, allowed)
      if (!k) return NextResponse.json({ error: 'This file type is not allowed for this question.' }, { status: 400 })
      kind = k as AnswerFileKind
      maxBytes = Math.min(ANSWER_FILE_MAX_MB, ext.upload?.max_mb ?? 5) * 1024 * 1024
    }
    if (file.size > maxBytes) return NextResponse.json({ error: `Files must be under ${Math.round(maxBytes / 1048576)} MB.` }, { status: 413 })

    const bytes = Buffer.from(await file.arrayBuffer())
    if (bytes.length > maxBytes) return NextResponse.json({ error: `Files must be under ${Math.round(maxBytes / 1048576)} MB.` }, { status: 413 })
    if (!sniffAnswerFile(new Uint8Array(bytes), kind)) {
      return NextResponse.json({ error: 'The file content does not match its type. Save it again in the right format and retry.' }, { status: 400 })
    }
    const scan = await scanFile(bytes, name)
    if (scan === 'infected') return NextResponse.json({ error: 'The security scanner rejected this file.' }, { status: 400 })

    await ensureExamIndexes(db)
    const col = db.collection('exam_submission_files')
    const durationRaw = Number(form.get('duration_s'))
    const meta = {
      id: newId(),
      name,
      size: bytes.length,
      type: kind,
      scan_status: scan,
      uploaded_at: nowIso(),
      ...(type === 'video_response' && Number.isFinite(durationRaw) && durationRaw > 0 ? { duration_s: Math.min(3600, Math.round(durationRaw)) } : {}),
    }
    await col.insertOne({
      ...meta,
      kind: 'answer',
      question_id: questionId,
      attempt_no: access.attemptNo,
      exam_id: examId,
      tenant_id: exam.tenant_id ?? null,
      user_id: user.id,
      email: user.email,
      content_type: CONTENT_TYPES[kind],
      data: bytes,
      status: 'answer',
    })
    // One file per question per attempt: the new upload replaces the previous one.
    await col.deleteMany({ exam_id: examId, user_id: user.id, kind: 'answer', question_id: questionId, attempt_no: access.attemptNo, id: { $ne: meta.id } })
    return NextResponse.json({ ok: true, file: meta }, { status: 201 })
  } catch (e) {
    console.error('[answer-files] POST:', e instanceof Error ? e.message : 'error')
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
