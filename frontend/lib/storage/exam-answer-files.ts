/**
 * Glue between the answer-file routes (multipart POST and direct upload) and
 * the shared storage module. One place for the entry gate, the per-question
 * type/size rules and writing the `exam_submission_files` record.
 */
import type { Db } from 'mongodb'
import { newId, nowIso } from '@/lib/db/ids'
import { attemptTimeState, checkExamEntry, ensureExamIndexes, getExamDraft } from '@/lib/exam-access'
import { canonicalType } from '@/lib/question-types'
import { ANSWER_FILE_MAX_MB, VIDEO_FILE_EXTS, extendedFieldsOf, uploadKindForName } from '@/lib/question-extensions'
import type { AnswerFileKind } from '@/lib/upload-sniff'
import { deleteBlobs, type BlobRef } from './blobs'
import { largeUploadLimits } from './config'

export const ANSWER_CONTENT_TYPES: Record<AnswerFileKind, string> = {
  pdf: 'application/pdf', image: 'application/octet-stream', docx: 'application/octet-stream', xlsx: 'application/octet-stream',
  pptx: 'application/octet-stream', zip: 'application/zip', text: 'text/plain', webm: 'video/webm', mp4: 'video/mp4',
}

type Err = { error: string; status: number }
type Doc = Record<string, unknown>

export function safeAnswerName(raw: string): string {
  const base = String(raw || '').split(/[\\/]/).pop() || 'file'
  return base.replace(/[\u0000-\u001f"<>|:*?]/g, '_').slice(0, 200) || 'file'
}

/**
 * Pure: the file kind and byte cap for one question. `large` = object storage
 * is on and the bytes go straight to the bucket (video up to
 * UPLOADS_VIDEO_MAX_MB, files up to the author's max_mb within UPLOADS_FILE_MAX_MB).
 */
export function answerUploadRule(q: Doc, name: string, large: boolean, limits = largeUploadLimits()): { kind: AnswerFileKind; maxBytes: number; video: boolean } | Err {
  const type = canonicalType(q.type)
  if (type !== 'file_upload' && type !== 'video_response') return { error: 'This question does not take files.', status: 400 }
  const lower = name.toLowerCase()
  if (type === 'video_response') {
    if (!VIDEO_FILE_EXTS.some((e) => lower.endsWith(e))) return { error: 'Recordings must be WebM or MP4.', status: 400 }
    return { kind: lower.endsWith('.mp4') ? 'mp4' : 'webm', maxBytes: large ? limits.videoBytes : ANSWER_FILE_MAX_MB * 1048576, video: true }
  }
  const ext = extendedFieldsOf(q)
  const k = uploadKindForName(name, ext.upload?.allowed ?? ['pdf'])
  if (!k) return { error: 'This file type is not allowed for this question.', status: 400 }
  const authorMb = ext.upload?.max_mb ?? 5
  const capBytes = large ? limits.fileBytes : ANSWER_FILE_MAX_MB * 1048576
  return { kind: k as AnswerFileKind, maxBytes: Math.min(capBytes, authorMb * 1048576), video: false }
}

/** Same entry gate as submit: signed-in candidate, allowed in, attempt running, question takes files. */
export async function gateAnswerUpload(db: Db, examId: string, user: { id: string; email: string }, tokens: { inviteToken: string | null; linkToken: string | null }, questionId: string): Promise<{ exam: Doc; q: Doc; attemptNo: number } | Err> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(questionId)) return { error: 'Unknown question', status: 400 }
  const exam = await db.collection('exams').findOne({ id: examId })
  if (!exam) return { error: 'Exam not found', status: 404 }
  const access = await checkExamEntry(db, exam as Doc, { id: user.id, email: user.email }, tokens)
  if (!access.ok) return { error: access.error, status: access.status }
  const draft = await getExamDraft(db, examId, user.id)
  const time = attemptTimeState(exam as Doc, draft, access.attemptNo)
  if (time.status === 'not_started') return { error: 'Start the assessment before uploading.', status: 409 }
  if (time.status === 'expired') return { error: 'Time is up for this attempt.', status: 409 }
  const list = (Array.isArray(exam.questionList) ? exam.questionList : Array.isArray(exam.questions) ? exam.questions : []) as Doc[]
  const q = list.find((x) => String(x?.id) === questionId)
  if (!q) return { error: 'This question does not take files.', status: 400 }
  return { exam: exam as Doc, q, attemptNo: access.attemptNo }
}

/** Write the answer-file record and drop the one it replaces (record + object). */
export async function saveAnswerFile(db: Db, p: {
  exam: Doc; examId: string; user: { id: string; email: string }; questionId: string; attemptNo: number
  name: string; size: number; kind: AnswerFileKind; scan: string; durationS?: number
  blob: { storage: 's3'; s3_key: string } | { storage: 'db'; data: Buffer }
}): Promise<Doc> {
  await ensureExamIndexes(db)
  const col = db.collection('exam_submission_files')
  const meta = {
    id: newId(),
    name: p.name,
    size: p.size,
    type: p.kind,
    scan_status: p.scan,
    uploaded_at: nowIso(),
    ...(p.durationS && Number.isFinite(p.durationS) && p.durationS > 0 ? { duration_s: Math.min(3600, Math.round(p.durationS)) } : {}),
  }
  await col.insertOne({
    ...meta,
    kind: 'answer',
    question_id: p.questionId,
    attempt_no: p.attemptNo,
    exam_id: p.examId,
    tenant_id: p.exam.tenant_id ?? null,
    user_id: p.user.id,
    email: p.user.email,
    content_type: ANSWER_CONTENT_TYPES[p.kind],
    ...p.blob,
    status: 'answer',
  })
  // One file per question per attempt: the new upload replaces the previous one.
  const old = { exam_id: p.examId, user_id: p.user.id, kind: 'answer', question_id: p.questionId, attempt_no: p.attemptNo, id: { $ne: meta.id } }
  const prev = (await col.find(old, { projection: { _id: 0, storage: 1, s3_key: 1 } }).toArray()) as BlobRef[]
  await deleteBlobs(prev)
  await col.deleteMany(old)
  return meta
}
