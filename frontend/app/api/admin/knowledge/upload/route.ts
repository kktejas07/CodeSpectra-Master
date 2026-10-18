/**
 * POST /api/admin/knowledge/upload  (multipart: file, title?, kind=jd|rubric|policy|other, tags?, tenant?)
 *   Upload a company document (PDF, DOCX, TXT, MD; ≤ 10 MB). Virus-scanned
 *   (fail closed), text extracted, indexed for the caller's organisation.
 *   `tenant` is honoured for superadmin only; tenant admins always upload to their own.
 */
import { NextResponse } from 'next/server'
import { auditAdmin } from '@/lib/admin-audit'
import { uploadDocument } from '@/lib/rag/admin'
import { MAX_UPLOAD_BYTES } from '@/lib/rag/sources/uploads'
import { knowledgeError, knowledgeGate, knowledgeLimit } from '@/lib/rag/route-helpers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const g = await knowledgeGate()
  if ('response' in g) return g.response
  const limited = knowledgeLimit(g.caller, 'upload', 20, 10 * 60_000)
  if (limited) return limited
  const len = Number(request.headers.get('content-length') || 0)
  if (len > MAX_UPLOAD_BYTES + 64 * 1024) {
    return NextResponse.json({ error: `Files can be up to ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.` }, { status: 413 })
  }
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Send the file as multipart form data.' }, { status: 400 })
  }
  const file = form.get('file')
  if (!file || typeof file === 'string') return NextResponse.json({ error: 'Choose a file to upload.' }, { status: 400 })
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: `Files can be up to ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.` }, { status: 413 })
  }
  try {
    const res = await uploadDocument(g.caller, {
      fileName: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
      title: form.get('title'),
      kind: form.get('kind'),
      tags: form.get('tags'),
      tenant: form.get('tenant'),
    })
    await auditAdmin({ id: g.caller.userId }, 'knowledge.upload', 'knowledge_source', res.id, file.name)
    return NextResponse.json({ ok: true, ...res }, { status: 201 })
  } catch (e) {
    return knowledgeError(e, 'admin/knowledge/upload')
  }
}
