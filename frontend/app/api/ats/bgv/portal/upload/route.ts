import { NextRequest, NextResponse } from 'next/server'
import { errorResponse, NO_STORE } from '@/lib/ats/bgv/http'
import { caseFromToken, portalView, uploadDocument } from '@/lib/ats/bgv/service'
import { MAX_DOC_BYTES, readCapped } from '@/lib/ats/bgv/storage'
import { limitRequest } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MAX_BODY = MAX_DOC_BYTES + 64 * 1024

/** POST multipart { token, check, slot, item?, file } — public (signed link): one document, PDF/JPG/PNG ≤ 10 MB. */
export async function POST(req: NextRequest) {
  const limited = await limitRequest(req, 'ats-bgv-upload', null, 30, 60_000)
  if (limited) return limited
  // Declared length required (no chunked uploads), and the body read itself is capped too.
  const lenHeader = req.headers.get('content-length')
  const len = lenHeader && /^\d+$/.test(lenHeader) ? Number(lenHeader) : NaN
  if (!Number.isFinite(len)) return NextResponse.json({ error: 'Upload size missing' }, { status: 411 })
  if (len > MAX_BODY) return NextResponse.json({ error: 'Files can be up to 10 MB.' }, { status: 413 })
  try {
    const body = await readCapped(req, len)
    if (!body) return NextResponse.json({ error: 'Files can be up to 10 MB.' }, { status: 413 })
    const form = await new Response(body, { headers: { 'content-type': req.headers.get('content-type') || '' } }).formData().catch(() => null)
    if (!form) return NextResponse.json({ error: 'Invalid upload' }, { status: 400 })
    const c = await caseFromToken(form.get('token'))
    if (!c) return NextResponse.json({ error: 'This link has expired or was replaced by a newer one.', code: 'expired' }, { status: 404 })
    const file = form.get('file')
    if (!file || typeof file === 'string') return NextResponse.json({ error: 'Choose a file' }, { status: 400 })
    if (file.size > MAX_DOC_BYTES) return NextResponse.json({ error: 'Files can be up to 10 MB.' }, { status: 413 })
    const next = await uploadDocument(c, {
      type: form.get('check'),
      slot: form.get('slot'),
      item: form.get('item'),
      name: file.name || 'document',
      bytes: new Uint8Array(await file.arrayBuffer()),
    })
    return NextResponse.json(await portalView(next), { headers: NO_STORE })
  } catch (e) {
    return errorResponse(e, 'bgv upload')
  }
}
