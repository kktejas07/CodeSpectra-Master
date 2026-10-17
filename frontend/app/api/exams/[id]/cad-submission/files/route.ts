/**
 * POST /api/exams/[id]/cad-submission/files — upload one CAD file for the
 * candidate's next attempt (multipart: file, kind=native|step, inviteToken?,
 * linkToken?). Same entry checks as the exam submit (lib/exam-access.ts), so
 * nobody can stage files for an exam they can't take.
 *
 * The file is "staged" until POST /api/exams/[id]/cad-submission attaches it
 * to the attempt. Uploading again for the same kind replaces the staged one.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { newId, nowIso } from '@/lib/db/ids'
import { checkExamEntry, ensureExamIndexes } from '@/lib/exam-access'
import { rateLimitSlidingWindow } from '@/lib/in-memory-rate-limit'
import { backendPost } from '@/lib/ai/backend'
import { CAD_MAX_FILE_BYTES, cadFileExtOk, type CadFileKind, type CadFileMeta } from '@/lib/cad-submission'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** ClamAV via the backend (same scanner as /api/upload). Malware is rejected;
 *  an unreachable scanner doesn't block a candidate mid-test — the file is
 *  marked 'unscanned' and reviewers see that before downloading. */
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
    console.error('[cad-submission/files] scanner unavailable:', msg.slice(0, 200))
    return 'unscanned'
  }
}

function safeName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() || 'file'
  return base.replace(/[\u0000-\u001f"<>|:*?]/g, '_').slice(0, 200) || 'file'
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth().catch(() => null)
  if (!gate || 'error' in gate) {
    return NextResponse.json({ error: 'You must be signed in to take this assessment.' }, { status: 401 })
  }
  const user = gate.user
  const { id: examId } = await ctx.params

  const rl = rateLimitSlidingWindow(`cad-upload:${user.id}`, 20, 10 * 60_000)
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many uploads. Try again in a few minutes.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Upload could not be read. Files must be under 9 MB.' }, { status: 400 })
  }
  const file = form.get('file')
  const kindRaw = String(form.get('kind') || '')
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  if (kindRaw !== 'native' && kindRaw !== 'step') return NextResponse.json({ error: 'Unknown file type' }, { status: 400 })
  const kind = kindRaw as CadFileKind
  const name = safeName(file.name)
  if (!cadFileExtOk(kind, name)) {
    return NextResponse.json(
      { error: kind === 'step' ? 'Upload a .step or .stp file.' : 'Upload a native CAD file (for example .sldprt, .ipt, .prt, .catpart).' },
      { status: 400 },
    )
  }
  if (file.size <= 0) return NextResponse.json({ error: 'This file is empty.' }, { status: 400 })
  if (file.size > CAD_MAX_FILE_BYTES) return NextResponse.json({ error: 'Files must be under 9 MB.' }, { status: 413 })

  try {
    const db = await getMongoDb()
    const exam = await db.collection('exams').findOne({ id: examId })
    if (!exam) return NextResponse.json({ error: 'Exam not found' }, { status: 404 })

    const access = await checkExamEntry(db, exam as Record<string, unknown>, { id: user.id, email: user.email }, {
      inviteToken: String(form.get('inviteToken') || '') || null,
      linkToken: String(form.get('linkToken') || '') || null,
    })
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

    const bytes = Buffer.from(await file.arrayBuffer())
    if (bytes.length > CAD_MAX_FILE_BYTES) return NextResponse.json({ error: 'Files must be under 9 MB.' }, { status: 413 })
    const scan = await scanFile(bytes, name)
    if (scan === 'infected') {
      return NextResponse.json({ error: 'The security scanner rejected this file. Export it again and retry.' }, { status: 400 })
    }

    await ensureExamIndexes(db)
    const col = db.collection('exam_submission_files')
    const meta: CadFileMeta = { id: newId(), kind, name, size: bytes.length, scan_status: scan, uploaded_at: nowIso() }
    await col.insertOne({
      ...meta,
      exam_id: examId,
      tenant_id: exam.tenant_id ?? null,
      user_id: user.id,
      email: user.email,
      content_type: 'application/octet-stream',
      data: bytes,
      status: 'staged',
      submission_id: null,
    })
    // One staged file per kind: drop the one this upload replaces.
    await col.deleteMany({ exam_id: examId, user_id: user.id, kind, status: 'staged', id: { $ne: meta.id } })

    return NextResponse.json({ ok: true, file: meta }, { status: 201 })
  } catch (e) {
    console.error('[cad-submission/files] POST:', e)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
