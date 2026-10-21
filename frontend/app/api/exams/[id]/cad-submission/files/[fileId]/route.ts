/**
 * GET /api/exams/[id]/cad-submission/files/[fileId] — download one CAD file.
 * Reviewers (superadmin / the exam's tenant admins) and the candidate who
 * uploaded it. Always served as an attachment with a generic type so a
 * crafted upload can never render in the app's origin.
 */
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { isExamStaff } from '@/lib/exam-access'
import { blobDownloadUrl, bytesOf, type BlobRef } from '@/lib/storage/blobs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request, ctx: { params: Promise<{ id: string; fileId: string }> }) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { id: examId, fileId } = await ctx.params
  try {
    const db = await getMongoDb()
    const file = await db.collection('exam_submission_files').findOne({ id: fileId, exam_id: examId })
    if (!file) return NextResponse.json({ error: 'File not found', code: 'file_not_found' }, { status: 404 })
    const exam = await db.collection('exams').findOne({ id: examId }, { projection: { tenant_id: 1 } })
    const staff = !!exam && isExamStaff(gate.user, exam as Record<string, unknown>)
    if (!staff && file.user_id !== gate.user.id) return NextResponse.json({ error: 'File not found', code: 'file_not_found' }, { status: 404 })

    // Object storage: a 5-minute presigned URL (attachment, generic type), issued only after the check above.
    // ?mode=play (answer videos): the URL as JSON with a video type, for the reviewer's <video> element.
    const play = new URL(req.url).searchParams.get('mode') === 'play' && (file.type === 'webm' || file.type === 'mp4')
    const signed = await blobDownloadUrl(file as BlobRef, String(file.name || 'file'), play ? `video/${file.type}` : undefined)
    if (signed && play) return NextResponse.json({ url: signed }, { headers: { 'Cache-Control': 'private, no-store' } })
    if (signed) return NextResponse.redirect(signed, { status: 302, headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } })
    const bytes = bytesOf(file.data)
    if (!bytes) return NextResponse.json({ error: 'File not found', code: 'file_not_found' }, { status: 404 })
    const name = String(file.name || 'file').replace(/[^\w.\- ]/g, '_')
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(bytes.length),
        'Content-Disposition': `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(String(file.name || 'file'))}`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (e) {
    console.error('[cad-submission/files/[fileId]] GET:', e)
    return NextResponse.json({ error: 'Download failed', code: 'download_failed' }, { status: 500 })
  }
}
