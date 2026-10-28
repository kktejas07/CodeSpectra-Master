/**
 * POST /api/exams/[id]/answer-files — upload the file for one file_upload or
 * video_response question in the candidate's running attempt (multipart:
 * file, question_id, duration_s?, inviteToken?, linkToken?).
 *
 * Checks: signed in, same entry gate as submit (lib/exam-access.ts), an
 * attempt that is started and not past its deadline, the question exists and
 * takes files, the type is one the author allowed (extension AND magic bytes,
 * lib/upload-sniff.ts), the size cap, and the virus scanner. The file is
 * recorded in `exam_submission_files` (kind 'answer'), bytes in the private
 * uploads bucket when configured (lib/storage), else inline; the answer itself
 * only carries its id. Files over the body cap (videos) go through ./direct. Reviewers download it through the existing
 * /api/exams/[id]/cad-submission/files/[fileId] route (staff or owner only,
 * always as an attachment).
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { isExamStaff } from '@/lib/exam-access'
import { limitRequest } from '@/lib/rate-limit'
import { sniffAnswerFile } from '@/lib/upload-sniff'
import { ANSWER_FILE_MAX_MB } from '@/lib/question-extensions'
import { putBlob } from '@/lib/storage/blobs'
import { scanBuffer } from '@/lib/storage/scan'
import { ANSWER_CONTENT_TYPES, answerUploadRule, gateAnswerUpload, safeAnswerName, saveAnswerFile } from '@/lib/storage/exam-answer-files'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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
    if (!exam) return NextResponse.json({ error: 'Exam not found', code: 'exam_not_found' }, { status: 404 })
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
  if (!gate || 'error' in gate) return NextResponse.json({ error: 'You must be signed in to take this assessment.', code: 'exam_signin_required' }, { status: 401 })
  const user = gate.user
  const { id: examId } = await ctx.params

  const limited = await limitRequest(req, 'answer-upload', user.id, 20, 10 * 60_000)
  if (limited) return limited

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: `Upload could not be read. Files must be under ${ANSWER_FILE_MAX_MB} MB.`, code: 'upload_unreadable_mb', params: { mb: ANSWER_FILE_MAX_MB } }, { status: 400 })
  }
  const file = form.get('file')
  const questionId = String(form.get('question_id') || '')
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided', code: 'upload_no_file' }, { status: 400 })
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(questionId)) return NextResponse.json({ error: 'Unknown question', code: 'exam_unknown_question' }, { status: 400 })
  if (file.size <= 0) return NextResponse.json({ error: 'This file is empty.', code: 'file_empty' }, { status: 400 })
  const name = safeAnswerName(file.name)

  try {
    const db = await getMongoDb()
    const gate2 = await gateAnswerUpload(db, examId, { id: user.id, email: user.email }, {
      inviteToken: String(form.get('inviteToken') || '') || null,
      linkToken: String(form.get('linkToken') || '') || null,
    }, questionId)
    if ('error' in gate2) return NextResponse.json({ error: gate2.error }, { status: gate2.status })
    // This route buffers the body, so it keeps the small cap; large files use ./direct.
    const rule = answerUploadRule(gate2.q, name, false)
    if ('error' in rule) return NextResponse.json({ error: rule.error }, { status: rule.status })
    const { kind, maxBytes } = rule
    if (file.size > maxBytes) return NextResponse.json({ error: `Files must be under ${Math.round(maxBytes / 1048576)} MB.`, code: 'exam_files_max_mb', params: { mb: Math.round(maxBytes / 1048576) } }, { status: 413 })

    const bytes = Buffer.from(await file.arrayBuffer())
    if (bytes.length > maxBytes) return NextResponse.json({ error: `Files must be under ${Math.round(maxBytes / 1048576)} MB.`, code: 'exam_files_max_mb', params: { mb: Math.round(maxBytes / 1048576) } }, { status: 413 })
    if (!sniffAnswerFile(new Uint8Array(bytes), kind)) {
      return NextResponse.json({ error: 'The file content does not match its type. Save it again in the right format and retry.', code: 'file_content_mismatch' }, { status: 400 })
    }
    // Malware is rejected; an unreachable scanner marks the file 'unscanned' (reviewers see it).
    const scan = await scanBuffer(bytes, name)
    if (scan === 'infected') return NextResponse.json({ error: 'The security scanner rejected this file.', code: 'scanner_rejected' }, { status: 400 })

    const blob = await putBlob({ feature: 'exam-answer', tenantId: (gate2.exam.tenant_id as string) ?? null, bytes, contentType: ANSWER_CONTENT_TYPES[kind] })
    const meta = await saveAnswerFile(db, {
      exam: gate2.exam, examId, user: { id: user.id, email: user.email }, questionId, attemptNo: gate2.attemptNo,
      name, size: bytes.length, kind, scan, durationS: rule.video ? Number(form.get('duration_s')) : undefined, blob,
    })
    return NextResponse.json({ ok: true, file: meta }, { status: 201 })
  } catch (e) {
    console.error('[answer-files] POST:', e instanceof Error ? e.message : 'error')
    return NextResponse.json({ error: 'Upload failed', code: 'upload_failed' }, { status: 500 })
  }
}
