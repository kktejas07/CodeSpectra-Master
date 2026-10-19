/**
 * Digital-product files: extension + magic-byte check, ClamAV scan (fail
 * closed, lib/ats/files.virusScan), AES-256-GCM at rest. Bytes go to object
 * storage (lib/s3-storage) when configured, else to mkt_files (16 MB doc cap → 15 MB).
 * The buyer part's downloads read through readProductFile().
 */
import { Binary } from 'mongodb'
import { FileRejected, safeFileName, virusScan } from '@/lib/ats/files'
import { decryptBytesWithKey, encryptBytesWithKey } from '@/lib/ats/bgv/crypto'
import type { FileDoc } from './db'

export const MAX_FILE_BYTES_S3 = 100 * 1024 * 1024
export const MAX_FILE_BYTES_DB = 15 * 1024 * 1024
export const MAX_FILES_PER_SELLER = 500

const MIME: Record<string, string> = {
  pdf: 'application/pdf', epub: 'application/epub+zip', zip: 'application/zip',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  mp3: 'audio/mpeg', mp4: 'video/mp4', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  txt: 'text/plain', md: 'text/markdown',
}

/** Pure: allowed MIME for name + first bytes, or null. */
export function detectProductFileType(name: string, bytes: Uint8Array): string | null {
  const ext = String(name).toLowerCase().split('.').pop() || ''
  const h = Buffer.from(bytes.subarray(0, 12))
  const zip = h[0] === 0x50 && h[1] === 0x4b && h[2] === 0x03 && h[3] === 0x04
  switch (ext) {
    case 'pdf': return h.subarray(0, 5).toString('latin1') === '%PDF-' ? MIME.pdf : null
    case 'epub': case 'zip': case 'docx': case 'pptx': case 'xlsx': return zip ? MIME[ext] : null
    case 'png': return h.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ? MIME.png : null
    case 'jpg': case 'jpeg': return h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff ? MIME.jpg : null
    case 'mp4': return h.subarray(4, 8).toString('latin1') === 'ftyp' ? MIME.mp4 : null
    case 'mp3': return h.subarray(0, 3).toString('latin1') === 'ID3' || (h[0] === 0xff && (h[1] & 0xe0) === 0xe0) ? MIME.mp3 : null
    case 'txt': case 'md': {
      const sample = Buffer.from(bytes.subarray(0, 4096))
      if (sample.includes(0)) return null
      return MIME[ext]
    }
  }
  return null
}

async function fileKey(): Promise<Uint8Array> {
  const { deriveServerKey } = await import('@/lib/session')
  return deriveServerKey('marketplace-file')
}

const s3Key = (sellerId: string, id: string) => `marketplace/${sellerId}/${id}`

async function s3(): Promise<typeof import('@/lib/s3-storage') | null> {
  const mod = await import('@/lib/s3-storage')
  return (await mod.readS3Config()) ? mod : null
}

export async function maxUploadBytes(): Promise<number> {
  return (await s3()) ? MAX_FILE_BYTES_S3 : MAX_FILE_BYTES_DB
}

export type PublicFile = Omit<FileDoc, 'data'>

export async function storeSellerFile(sellerId: string, rawName: string, bytes: Uint8Array): Promise<PublicFile> {
  const { filesCol, newId, nowIso } = await import('./db')
  const col = await filesCol()
  if ((await col.countDocuments({ seller_id: sellerId, archived_at: { $exists: false } } as never)) >= MAX_FILES_PER_SELLER) throw new FileRejected('You have reached the file limit — delete unused files first.')
  const name = safeFileName(rawName)
  if (!bytes.byteLength) throw new FileRejected('The file is empty.')
  const store = await s3()
  const max = store ? MAX_FILE_BYTES_S3 : MAX_FILE_BYTES_DB
  if (bytes.byteLength > max) throw new FileRejected(`Files can be up to ${max / 1024 / 1024} MB.`)
  const mime = detectProductFileType(name, bytes)
  if (!mime) throw new FileRejected('Upload a PDF, EPUB, ZIP, Office file, MP3, MP4, image or text file.')
  const plain = Buffer.from(bytes)
  await virusScan(plain, name)
  const id = newId()
  const box = encryptBytesWithKey(await fileKey(), plain)
  const doc: FileDoc = { id, seller_id: sellerId, product_id: null, name, mime, size: plain.byteLength, storage: store ? 's3' : 'db', scanned: true, created_at: nowIso() }
  if (store) await store.s3PutObject(s3Key(sellerId, id), box, 'application/octet-stream')
  await col.insertOne({ ...doc, data: store ? null : new Binary(box) })
  return doc
}

export async function listSellerFiles(sellerId: string): Promise<PublicFile[]> {
  const { filesCol } = await import('./db')
  return (await filesCol()).find({ seller_id: sellerId, archived_at: { $exists: false } } as never, { projection: { _id: 0, data: 0 } }).sort({ created_at: -1 }).limit(MAX_FILES_PER_SELLER).toArray()
}

/** Decrypted bytes for a download (buyer part checks entitlement first). */
export async function readProductFile(fileId: string): Promise<{ name: string; mime: string; bytes: Buffer } | null> {
  const { filesCol } = await import('./db')
  const f = await (await filesCol()).findOne({ id: fileId }, { projection: { _id: 0 } })
  if (!f) return null
  let box: Buffer | null = null
  if (f.storage === 's3') {
    const store = await s3()
    box = store ? await store.s3GetObject(s3Key(f.seller_id, f.id)).catch(() => null) : null
  } else if (f.data) {
    box = Buffer.isBuffer(f.data) ? f.data : Buffer.from((f.data as Binary).buffer)
  }
  const bytes = box ? decryptBytesWithKey(await fileKey(), box) : null
  return bytes ? { name: f.name, mime: f.mime, bytes } : null
}

/**
 * Delete files the seller owns that no published / pending / archived product uses AND that no buyer
 * bought (order lines snapshot their file ids — buyers keep their downloads even after the product
 * was unpublished, rejected or the file removed from the listing). Purchased files are archived
 * instead (hidden from the seller's file list, still served to buyers).
 */
export async function deleteSellerFiles(sellerId: string, ids: string[]): Promise<number> {
  if (!ids.length) return 0
  const { filesCol, productsCol, ordersCol, nowIso } = await import('./db')
  const inUse = await (await productsCol()).find({ seller_id: sellerId, status: { $in: ['published', 'pending_review', 'archived'] }, 'digital.file_ids': { $in: ids } }, { projection: { 'digital.file_ids': 1 } }).toArray()
  const used = new Set(inUse.flatMap((p) => p.digital?.file_ids ?? []))
  const soldOrders = await (await ordersCol()).find({ 'lines.digital.file_ids': { $in: ids } } as never, { projection: { _id: 0, lines: 1 } }).limit(10_000).toArray()
  const sold = new Set(soldOrders.flatMap((o) => o.lines.flatMap((l) => (l as { digital?: { file_ids?: string[] } | null }).digital?.file_ids ?? [])).filter((f) => ids.includes(f)))
  const col = await filesCol()
  const keep = ids.filter((id) => sold.has(id) && !used.has(id))
  if (keep.length) await col.updateMany({ seller_id: sellerId, id: { $in: keep } }, { $set: { archived_at: nowIso() } })
  const del = ids.filter((id) => !used.has(id) && !sold.has(id))
  if (!del.length) return keep.length
  const rows = await col.find({ seller_id: sellerId, id: { $in: del } }, { projection: { id: 1, storage: 1 } }).toArray()
  const store = rows.some((r) => r.storage === 's3') ? await s3() : null
  for (const r of rows) if (r.storage === 's3' && store) await store.s3DeleteObject(s3Key(sellerId, r.id)).catch(() => {})
  const res = await col.deleteMany({ seller_id: sellerId, id: { $in: rows.map((r) => r.id) } })
  return res.deletedCount + keep.length
}
