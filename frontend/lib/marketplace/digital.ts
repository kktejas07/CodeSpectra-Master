/**
 * Digital delivery: short-lived signed download links + an atomic per-line download counter.
 *  issueDownloadLink  — the buyer asks for a link (entitlement checked here).
 *  consumeDownload    — the download route spends one download atomically
 *                       (`used < limit` in the update filter), so parallel clicks can't exceed it.
 */
import 'server-only'
import type { Collection } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'
import { nowIso } from './db'
import { orders } from './order-doc'
import { signDownloadToken, verifyDownloadToken, downloadsLeft, type DownloadClaims } from './download-token'
import { CartError } from './cart'

interface GrantDoc { id: string; order_id: string; line_id: string; used: number; limit: number; updated_at: string }

async function grants(): Promise<Collection<GrantDoc>> {
  return (await getMongoDb()).collection<GrantDoc>('mkt_download_grants')
}

async function key(): Promise<Uint8Array> {
  const { deriveServerKey } = await import('@/lib/session')
  return deriveServerKey('mkt-download')
}

export async function issueDownloadLink(userId: string, orderId: string, lineId: string, fileId: string): Promise<{ url: string; expires_in: number; downloads_left: number | null }> {
  const order = await (await orders()).findOne({ id: orderId, buyer_id: userId }, { projection: { _id: 0 } })
  const line = order?.lines.find((l) => l.id === lineId)
  if (!order || !line || line.kind !== 'digital') throw new CartError(404, 'Download not found')
  if (line.fulfilment.status !== 'delivered_digital' || (line.refunded_amount ?? 0) > 0 || line.refund_lock) throw new CartError(403, 'This download is not available.')
  if (!line.digital?.file_ids?.includes(fileId)) throw new CartError(404, 'File not found')
  const g = await (await grants()).findOne({ id: `${orderId}:${lineId}` })
  const left = downloadsLeft(g?.used ?? line.fulfilment.downloads_used ?? 0, line.digital.download_limit)
  if (left <= 0) throw new CartError(403, 'You have used all downloads for this item. Contact support if you need help.')
  const token = signDownloadToken(await key(), { o: orderId, l: lineId, f: fileId, u: userId })
  return { url: `/api/marketplace/downloads/${encodeURIComponent(token)}`, expires_in: 300, downloads_left: Number.isFinite(left) ? left : null }
}

export async function verifyDownload(token: string): Promise<DownloadClaims | null> {
  return verifyDownloadToken(await key(), token)
}

/**
 * Atomically spend one download. Returns false when the limit is reached or a refund holds the line.
 * First a conditional update on the order line itself (no refund lock, nothing refunded) marks it
 * `download_claimed` — the buyer refund claim requires that flag to be absent, and both are atomic
 * updates of the same order document, so a refund and a download can't both win.
 */
export async function consumeDownload(orderId: string, lineId: string, limit: number): Promise<boolean> {
  const mark = await (await orders()).updateOne(
    { id: orderId, lines: { $elemMatch: { id: lineId, kind: 'digital', 'fulfilment.status': 'delivered_digital', refund_lock: { $exists: false }, refunded_amount: { $in: [0, null] } } } } as never,
    { $set: { 'lines.$.fulfilment.download_claimed': true } } as never,
  )
  if (!mark.matchedCount) return false
  const col = await grants()
  const id = `${orderId}:${lineId}`
  await col.updateOne({ id }, { $setOnInsert: { id, order_id: orderId, line_id: lineId, used: 0, limit: Math.max(0, limit || 0), updated_at: nowIso() } }, { upsert: true })
  const r = await col.updateOne(
    { id, $or: [{ limit: 0 }, { used: { $lt: Math.max(0, limit || 0) } }] } as never,
    { $inc: { used: 1 }, $set: { updated_at: nowIso() } },
  )
  return r.modifiedCount === 1
}

/** After a file was actually served: mirror the count onto the order line (views + "downloaded" refund rule). */
export async function markDownloaded(orderId: string, lineId: string): Promise<void> {
  const g = await (await grants()).findOne({ id: `${orderId}:${lineId}` })
  await (await orders()).updateOne({ id: orderId, 'lines.id': lineId } as never, { $set: { 'lines.$.fulfilment.downloads_used': Math.max(1, g?.used ?? 1) } } as never).catch(() => {})
}

/** Give a download back when the file could not be served (and the refund right, if nothing was ever served). */
export async function refundDownload(orderId: string, lineId: string): Promise<void> {
  const col = await grants()
  await col.updateOne({ id: `${orderId}:${lineId}`, used: { $gt: 0 } }, { $inc: { used: -1 } })
  const g = await col.findOne({ id: `${orderId}:${lineId}` })
  if ((g?.used ?? 0) === 0) {
    await (await orders()).updateOne(
      { id: orderId, lines: { $elemMatch: { id: lineId, 'fulfilment.downloads_used': { $in: [0, null] } } } } as never,
      { $unset: { 'lines.$.fulfilment.download_claimed': '' } } as never,
    )
  }
}
