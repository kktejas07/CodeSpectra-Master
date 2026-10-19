import { NextRequest, NextResponse } from 'next/server'
import { verifyFileViewToken } from '@/lib/ats/bgv/crypto'
import { getCase } from '@/lib/ats/bgv/service'
import { readDocument } from '@/lib/ats/bgv/storage'
import { limitRequest } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ token: string }> }

/**
 * GET — streams one decrypted BGV document for a 5-minute signed token minted
 * by /api/ats/bgv/[caseId]/documents/[docId] (which checks the role and logs the view).
 */
export async function GET(req: NextRequest, { params }: Ctx) {
  const limited = await limitRequest(req, 'ats-bgv-file', null, 60, 60_000)
  if (limited) return limited
  const t = await verifyFileViewToken((await params).token)
  if (!t) return NextResponse.json({ error: 'This link has expired. Open the document again from the candidate page.' }, { status: 404 })
  const c = await getCase(t.tenantId, t.caseId)
  const doc = c?.checks.flatMap((k) => k.documents).find((d) => d.id === t.docId)
  if (!c || !doc) return NextResponse.json({ error: 'File not found' }, { status: 404 })
  const bytes = await readDocument(c.tenant_id, c.id, doc).catch(() => null)
  if (!bytes) return NextResponse.json({ error: 'File not available' }, { status: 404 })
  const safeName = doc.name.replace(/[^\w.\- ]+/g, '_')
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'Content-Type': doc.type,
      'Content-Length': String(bytes.byteLength),
      'Content-Disposition': `inline; filename="${safeName}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      'Referrer-Policy': 'no-referrer',
    },
  })
}
