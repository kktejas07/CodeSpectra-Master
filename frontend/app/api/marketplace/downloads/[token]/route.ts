/**
 * GET /api/marketplace/downloads/[token] — serve a purchased file.
 * The token is signed, expires after 5 minutes and is bound to the buyer (the signed-in user
 * must match); each successful download spends one from the line's limit (atomic).
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { limitRequest } from '@/lib/rate-limit'
import { consumeDownload, markDownloaded, refundDownload, verifyDownload } from '@/lib/marketplace/digital'
import { orders } from '@/lib/marketplace/order-doc'
import { readProductFile } from '@/lib/marketplace/seller-files'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const deny = (status: number, error: string) => NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } })

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const limited = await limitRequest(req, 'mkt-download', null, 30, 60_000)
  if (limited) return limited
  const { token } = await params
  const claims = await verifyDownload(decodeURIComponent(token))
  if (!claims) return deny(410, 'This download link has expired. Open your order and try again.')
  const user = await getAPIUser()
  if (!user || user.id !== claims.u) return deny(403, 'Sign in with the account that bought this item.')
  const order = await (await orders()).findOne({ id: claims.o, buyer_id: user.id }, { projection: { _id: 0 } })
  const line = order?.lines.find((l) => l.id === claims.l)
  if (!order || !line || line.kind !== 'digital' || line.fulfilment.status !== 'delivered_digital' || (line.refunded_amount ?? 0) > 0 || !line.digital?.file_ids.includes(claims.f)) {
    return deny(403, 'This download is not available.')
  }
  if (!(await consumeDownload(order.id, line.id, line.digital.download_limit))) return deny(403, 'You have used all downloads for this item.')
  const file = await readProductFile(claims.f).catch(() => null)
  if (!file) {
    await refundDownload(order.id, line.id)
    return deny(404, 'The file is not available right now. Please try again later.')
  }
  await markDownloaded(order.id, line.id)
  const safe = file.name.replace(/[^\w.\- ]+/g, '_').slice(0, 120) || 'download'
  return new NextResponse(new Uint8Array(file.bytes), {
    headers: {
      'Content-Type': file.mime || 'application/octet-stream',
      'Content-Length': String(file.bytes.length),
      'Content-Disposition': `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(file.name.slice(0, 200))}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
