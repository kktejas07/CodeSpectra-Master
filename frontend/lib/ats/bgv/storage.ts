/**
 * BGV document storage. PDF / JPG / PNG only (extension AND magic bytes),
 * 10 MB each, ClamAV scan (same fail-closed scanner as résumé uploads,
 * lib/ats/files.ts), AES-GCM encrypted at rest. Bytes go to the platform's
 * object storage (lib/s3-storage.ts) when configured, else to `ats_bgv_files`.
 * Browsers only ever get a 5-minute signed URL (crypto.fileViewToken).
 */
import { Binary } from 'mongodb'
import { FileRejected, safeFileName, virusScan } from '@/lib/ats/files'
import { bgvFiles, newId, nowIso } from './db'
import { decryptBytes, encryptBytes } from './crypto'
import type { BgvDocument } from './types'

export const MAX_DOC_BYTES = 10 * 1024 * 1024
/** Files per case (all checks together). */
export const MAX_DOCS_PER_CASE = 80

export type DocMime = BgvDocument['type']

/** Pure: allowed type from name + first bytes, or null. */
export function detectDocType(name: string, bytes: Uint8Array): DocMime | null {
  const ext = String(name).toLowerCase().split('.').pop() || ''
  const h = Buffer.from(bytes.subarray(0, 8))
  if (ext === 'pdf') return h.subarray(0, 5).toString('latin1') === '%PDF-' ? 'application/pdf' : null
  if (ext === 'jpg' || ext === 'jpeg') return h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff ? 'image/jpeg' : null
  if (ext === 'png') return h.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ? 'image/png' : null
  return null
}

/** The request body, or null once it passes `max` bytes (stops reading; Content-Length can lie). */
export async function readCapped(req: Request, max: number): Promise<Uint8Array<ArrayBuffer> | null> {
  if (!req.body) return new Uint8Array(0)
  const reader = req.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > max) { await reader.cancel().catch(() => {}); return null }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let o = 0
  for (const c of chunks) { out.set(c, o); o += c.byteLength }
  return out
}

const s3Key = (tenantId: string, caseId: string, id: string) => `ats-bgv/${tenantId}/${caseId}/${id}`

async function s3(): Promise<typeof import('@/lib/s3-storage') | null> {
  const mod = await import('@/lib/s3-storage')
  return (await mod.readS3Config()) ? mod : null
}

/** Validate, scan, encrypt and store one file. Throws FileRejected with a user-facing message. */
export async function storeDocument(p: { tenantId: string; caseId: string; slot: string; item: number | null; name: string; bytes: Uint8Array }): Promise<BgvDocument> {
  const name = safeFileName(p.name)
  if (!p.bytes.byteLength) throw new FileRejected('The file is empty.')
  if (p.bytes.byteLength > MAX_DOC_BYTES) throw new FileRejected('Files can be up to 10 MB.')
  const type = detectDocType(name, p.bytes)
  if (!type) throw new FileRejected('Upload a PDF, JPG or PNG file.')
  const plain = Buffer.from(p.bytes)
  await virusScan(plain, name)
  const id = newId()
  const box = await encryptBytes(plain)
  const store = await s3()
  if (store) {
    await store.s3PutObject(s3Key(p.tenantId, p.caseId, id), box, 'application/octet-stream')
  } else {
    await (await bgvFiles()).insertOne({ id, tenant_id: p.tenantId, case_id: p.caseId, data: new Binary(box), created_at: nowIso() })
  }
  return { id, slot: p.slot, item: p.item, name, type, size: plain.byteLength, storage: store ? 's3' : 'db', scanned: true, uploaded_at: nowIso() }
}

export async function readDocument(tenantId: string, caseId: string, doc: Pick<BgvDocument, 'id' | 'storage'>): Promise<Buffer | null> {
  let box: Buffer | null = null
  if (doc.storage === 's3') {
    const store = await s3()
    if (!store) return null
    box = await store.s3GetObject(s3Key(tenantId, caseId, doc.id)).catch(() => null)
  } else {
    const row = await (await bgvFiles()).findOne({ id: doc.id, tenant_id: tenantId, case_id: caseId })
    const d = row?.data as Binary | Buffer | undefined
    box = d ? (Buffer.isBuffer(d) ? d : Buffer.from((d as Binary).buffer)) : null
  }
  return box ? decryptBytes(box) : null
}

/** Deletes every file it can; throws (after trying all) when any object-storage delete failed. */
export async function deleteDocuments(tenantId: string, caseId: string, docs: Pick<BgvDocument, 'id' | 'storage'>[]): Promise<void> {
  if (!docs.length) return
  const failed: string[] = []
  const s3Docs = docs.filter((d) => d.storage === 's3')
  if (s3Docs.length) {
    const store = await s3()
    if (!store) failed.push(...s3Docs.map((d) => d.id)) // storage unconfigured: can't confirm the delete
    else for (const d of s3Docs) {
      await store.s3DeleteObject(s3Key(tenantId, caseId, d.id)).catch((e) => { failed.push(d.id); console.error('[ats/bgv] s3 delete failed', d.id, e) })
    }
  }
  await (await bgvFiles()).deleteMany({ tenant_id: tenantId, case_id: caseId, id: { $in: docs.map((d) => d.id) } })
  if (failed.length) throw new Error(`BGV file delete failed for ${failed.length} file(s)`)
}
