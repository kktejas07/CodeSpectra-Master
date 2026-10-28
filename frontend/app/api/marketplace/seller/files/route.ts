import type { NextRequest } from 'next/server'
import { errorResponse, json, sellerGate } from '@/lib/marketplace/seller-api'
import { limitRequest } from '@/lib/rate-limit'

export async function GET(req: NextRequest) {
  const g = await sellerGate(req)
  if ('res' in g) return g.res
  try {
    const { listSellerFiles, maxUploadBytes } = await import('@/lib/marketplace/seller-files')
    return json({ files: await listSellerFiles(g.seller.id), max_bytes: await maxUploadBytes() })
  } catch (e) {
    return errorResponse(e, 'files list')
  }
}

/** POST raw bytes, ?name=<file name> → { file }. Virus-scanned and encrypted before storage. */
export async function POST(req: NextRequest) {
  const g = await sellerGate(req, { approved: true })
  if ('res' in g) return g.res
  const limited = await limitRequest(req, 'mkt-upload', g.user.id, 20, 10 * 60_000)
  if (limited) return limited
  try {
    const { readCapped } = await import('@/lib/ats/bgv/storage')
    const { maxUploadBytes, storeSellerFile } = await import('@/lib/marketplace/seller-files')
    const max = await maxUploadBytes()
    const name = new URL(req.url).searchParams.get('name') || 'file'
    const bytes = await readCapped(req, max)
    if (!bytes) return json({ error: `Files can be up to ${max / 1024 / 1024} MB.`, code: 'mkt_file_too_large', params: { mb: max / 1024 / 1024 } }, 413)
    return json({ file: await storeSellerFile(g.seller.id, name, bytes) }, 201)
  } catch (e) {
    return errorResponse(e, 'file upload')
  }
}
