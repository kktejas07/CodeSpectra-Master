/**
 * POST /api/exams/[id]/answer-files/direct — large answer files (video
 * recordings up to UPLOADS_VIDEO_MAX_MB) straight to the private bucket.
 *
 *   { action: 'start', question_id, name, size, inviteToken?, linkToken? }
 *     → { upload_id, url, method: 'PUT', headers } — PUT the bytes there with exactly these headers
 *     → 409 { inline: true } when object storage is off: use POST ../answer-files instead
 *   { action: 'finish', upload_id, question_id, duration_s?, inviteToken?, linkToken? }
 *     → verifies size, magic bytes and the virus scan, then records the file → { file }
 *
 * Same entry gate as the multipart route on both steps.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { limitRequest } from '@/lib/rate-limit'
import { sniffAnswerFile, type AnswerFileKind } from '@/lib/upload-sniff'
import { ANSWER_CONTENT_TYPES, answerUploadRule, gateAnswerUpload, safeAnswerName, saveAnswerFile } from '@/lib/storage/exam-answer-files'
import { claimUpload, finishDirectUpload, startDirectUpload } from '@/lib/storage/uploads'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const tokens = { inviteToken: z.string().max(500).optional().nullable(), linkToken: z.string().max(500).optional().nullable() }
const qid = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/)
const body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start'), question_id: qid, name: z.string().min(1).max(300), size: z.number().int().positive(), ...tokens }),
  z.object({ action: z.literal('finish'), question_id: qid, upload_id: z.string().max(40), duration_s: z.number().nonnegative().max(36_000).optional(), ...tokens }),
])

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth().catch(() => null)
  if (!gate || 'error' in gate) return NextResponse.json({ error: 'You must be signed in to take this assessment.', code: 'exam_signin_required' }, { status: 401 })
  const user = gate.user
  const { id: examId } = await ctx.params
  const parsed = body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request', code: 'invalid_request' }, { status: 400 })
  const input = parsed.data

  const limited = await limitRequest(req, input.action === 'start' ? 'answer-upload' : 'answer-upload-finish', user.id, input.action === 'start' ? 20 : 60, 10 * 60_000)
  if (limited) return limited

  try {
    const db = await getMongoDb()
    const g = await gateAnswerUpload(db, examId, { id: user.id, email: user.email }, { inviteToken: input.inviteToken || null, linkToken: input.linkToken || null }, input.question_id)
    if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
    const scope = `exam:${examId}:${input.question_id}:${g.attemptNo}`

    if (input.action === 'start') {
      const name = safeAnswerName(input.name)
      const rule = answerUploadRule(g.q, name, true)
      if ('error' in rule) return NextResponse.json({ error: rule.error }, { status: rule.status })
      const contentType = ANSWER_CONTENT_TYPES[rule.kind]
      const r = await startDirectUpload({
        feature: 'exam-answer', tenantId: (g.exam.tenant_id as string) ?? null, ownerId: user.id, scope,
        name, size: input.size, contentType, maxBytes: rule.maxBytes, allowedTypes: [contentType], meta: { kind: rule.kind, video: rule.video },
      })
      if (!r.ok) return NextResponse.json({ error: r.error, ...('inline' in r ? { inline: true } : {}) }, { status: r.status })
      return NextResponse.json(r, { status: 201 })
    }

    const done = await finishDirectUpload({
      uploadId: input.upload_id, ownerId: user.id, scope, scanMode: 'soft',
      sniff: (head, doc) => sniffAnswerFile(head, String(doc.meta?.kind || '') as AnswerFileKind),
    })
    if (!done.ok) return NextResponse.json({ error: done.error }, { status: done.status })
    const up = await claimUpload({ uploadId: input.upload_id, ownerId: user.id, scope })
    if (!up) return NextResponse.json({ error: 'This upload was already used. Upload the file again.', code: 'exam_upload_reused' }, { status: 409 })
    const kind = String(up.meta?.kind || '') as AnswerFileKind
    const meta = await saveAnswerFile(db, {
      exam: g.exam, examId, user: { id: user.id, email: user.email }, questionId: input.question_id, attemptNo: g.attemptNo,
      name: up.name, size: up.size, kind, scan: up.scan_status || 'unscanned',
      durationS: up.meta?.video ? input.duration_s : undefined, blob: { storage: 's3', s3_key: up.key },
    })
    return NextResponse.json({ ok: true, file: meta }, { status: 201 })
  } catch (e) {
    console.error('[answer-files/direct] POST:', e instanceof Error ? e.message : 'error')
    return NextResponse.json({ error: 'Upload failed', code: 'upload_failed' }, { status: 500 })
  }
}
