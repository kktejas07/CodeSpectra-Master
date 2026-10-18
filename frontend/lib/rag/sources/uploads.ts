/**
 * Company uploads (JDs, rubrics, policies…): file checks + text extraction.
 *
 *  - PDF  via pdfjs-dist (already a dependency; legacy build, in-process worker)
 *  - DOCX via a tiny ZIP reader (node:zlib) + word/document.xml → text. No new dependency.
 *  - TXT / MD as UTF-8.
 * Type is decided by extension AND magic bytes; size and extracted length are capped.
 * Virus scanning happens in the upload route (same ClamAV backend as /api/upload).
 */
import { inflateRawSync } from 'zlib'
import type { Db } from 'mongodb'
import type { ExtractedSource } from '../types'
import { str } from './util'

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
export const MAX_UPLOAD_TEXT_CHARS = 1_000_000
export const UPLOAD_KINDS = ['jd', 'rubric', 'policy', 'other'] as const
export type UploadKind = (typeof UPLOAD_KINDS)[number]

export type UploadFileType = 'pdf' | 'docx' | 'txt' | 'md'

export function detectUploadType(name: string, bytes: Uint8Array): UploadFileType | null {
  const ext = name.toLowerCase().split('.').pop() || ''
  const head = Buffer.from(bytes.subarray(0, 8))
  if (ext === 'pdf') return head.subarray(0, 5).toString('latin1') === '%PDF-' ? 'pdf' : null
  if (ext === 'docx') return head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04 ? 'docx' : null
  if (ext === 'txt' || ext === 'md' || ext === 'markdown') {
    // Plain text: no NUL bytes in the first 8KB.
    const sample = bytes.subarray(0, 8192)
    for (const b of sample) if (b === 0) return null
    return ext === 'txt' ? 'txt' : 'md'
  }
  return null
}

// ─── ZIP (DOCX) ──────────────────────────────────────────────────────────────

/** Read one entry from a ZIP archive (stored or deflate). Throws on malformed archives. */
export function readZipEntry(buf: Buffer, entryName: string, maxBytes = 20 * 1024 * 1024): Buffer | null {
  // End of central directory: signature 0x06054b50 within the last 64KB + 22 bytes.
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('Not a valid DOCX (zip) file')
  const count = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)
  for (let n = 0; n < count && p + 46 <= buf.length; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Corrupt zip directory')
    const method = buf.readUInt16LE(p + 10)
    const compSize = buf.readUInt32LE(p + 20)
    const size = buf.readUInt32LE(p + 24)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const localOff = buf.readUInt32LE(p + 42)
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf-8')
    p += 46 + nameLen + extraLen + commentLen
    if (name !== entryName) continue
    if (size > maxBytes) throw new Error('Document is too large to read')
    if (buf.readUInt32LE(localOff) !== 0x04034b50) throw new Error('Corrupt zip entry')
    const lName = buf.readUInt16LE(localOff + 26)
    const lExtra = buf.readUInt16LE(localOff + 28)
    const start = localOff + 30 + lName + lExtra
    const data = buf.subarray(start, start + compSize)
    if (method === 0) return Buffer.from(data)
    if (method === 8) return inflateRawSync(data, { maxOutputLength: maxBytes })
    throw new Error('Unsupported zip compression')
  }
  return null
}

/** word/document.xml → text with paragraph breaks; headings become markdown. */
export function docxXmlToText(xml: string): string {
  const paras = xml.split(/<\/w:p>/)
  const out: string[] = []
  for (const p of paras) {
    const style = /<w:pStyle\s+w:val="([^"]+)"/.exec(p)?.[1] ?? ''
    const marked = p.replace(/<w:tab\/>/g, '<w:t>\t</w:t>').replace(/<w:br\/>/g, '<w:t>\n</w:t>')
    const text = [...marked.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
      .trim()
    if (!text) continue
    const h = /^Heading([1-6])$/i.exec(style) ?? (/^Title$/i.test(style) ? ['', '1'] : null)
    const isList = /<w:numPr\b/.test(p)
    out.push(h ? `${'#'.repeat(Number(h[1]))} ${text}` : isList ? `- ${text}` : text)
  }
  return out.join('\n\n')
}

export function extractDocx(buf: Buffer): string {
  const xml = readZipEntry(buf, 'word/document.xml')
  if (!xml) throw new Error('This DOCX has no document body')
  return docxXmlToText(xml.toString('utf-8'))
}

// ─── PDF ─────────────────────────────────────────────────────────────────────

type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs')
let pdfjsPromise: Promise<PdfJs> | null = null

async function loadPdfJs(): Promise<PdfJs> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      // In-process "fake worker": pdfjs looks for globalThis.pdfjsWorker before spawning one.
      const g = globalThis as { pdfjsWorker?: unknown }
      if (!g.pdfjsWorker) g.pdfjsWorker = await import('pdfjs-dist/legacy/build/pdf.worker.mjs')
      return import('pdfjs-dist/legacy/build/pdf.mjs')
    })().catch((e) => {
      pdfjsPromise = null
      throw e
    })
  }
  return pdfjsPromise
}

export async function extractPdf(bytes: Uint8Array, maxPages = 300): Promise<string> {
  const pdfjs = await loadPdfJs()
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(bytes),
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
  }).promise
  try {
    const pages: string[] = []
    let total = 0
    for (let i = 1; i <= Math.min(doc.numPages, maxPages) && total < MAX_UPLOAD_TEXT_CHARS; i++) {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      let line = ''
      const lines: string[] = []
      for (const item of content.items as Array<{ str?: string; hasEOL?: boolean }>) {
        line += item.str ?? ''
        if (item.hasEOL) { lines.push(line); line = '' }
      }
      if (line) lines.push(line)
      const text = lines.join('\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
      total += text.length
      pages.push(text)
    }
    return pages.filter(Boolean).join('\n\n')
  } finally {
    await doc.destroy().catch(() => {})
  }
}

export async function extractUploadText(type: UploadFileType, bytes: Uint8Array): Promise<string> {
  let text: string
  if (type === 'pdf') text = await extractPdf(bytes)
  else if (type === 'docx') text = extractDocx(Buffer.from(bytes))
  else text = Buffer.from(bytes).toString('utf-8').replace(/^﻿/, '')
  // Strip control characters except tab/newline.
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').slice(0, MAX_UPLOAD_TEXT_CHARS)
}

export function parseTags(raw: unknown): string[] {
  const s = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw.join(',') : ''
  return [...new Set(s.split(',').map((t) => t.trim().toLowerCase().replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 40)).filter(Boolean))].slice(0, 12)
}

// ─── Source ──────────────────────────────────────────────────────────────────

export const UPLOAD_KIND_LABELS: Record<UploadKind, string> = {
  jd: 'Job description', rubric: 'Rubric', policy: 'Policy', other: 'Document',
}

export function uploadSource(u: Record<string, unknown>): ExtractedSource | null {
  const id = str(u.id, 200)
  const text = str(u.text, MAX_UPLOAD_TEXT_CHARS)
  if (!id || !text.trim()) return null
  const tenant = typeof u.tenant_id === 'string' && u.tenant_id ? u.tenant_id : null
  const kind = (UPLOAD_KINDS as readonly string[]).includes(String(u.kind)) ? (u.kind as UploadKind) : 'other'
  const tags = Array.isArray(u.tags) ? u.tags.map((t) => str(t, 40)).filter(Boolean) : []
  const header = [`- Type: ${UPLOAD_KIND_LABELS[kind]}`, tags.length ? `- Tags: ${tags.join(', ')}` : '', `- File: ${str(u.file_name, 200)}`].filter(Boolean).join('\n')
  return {
    type: 'upload',
    source_id: id,
    tenant_id: tenant,
    visibility: tenant ? 'tenant' : 'platform_admin',
    title: str(u.title, 200) || str(u.file_name, 200) || 'Document',
    url: null,
    text: `${header}\n\n${text}`,
    metadata: { kind, tags, file_name: str(u.file_name, 200) },
  }
}

export async function loadUpload(db: Db, id: string): Promise<ExtractedSource | null> {
  const u = await db.collection('rag_uploads').findOne({ id })
  return u ? uploadSource(u as Record<string, unknown>) : null
}

export async function listUploadIds(db: Db, limit: number, tenantId?: string | null): Promise<string[]> {
  const rows = await db.collection('rag_uploads').find(tenantId ? { tenant_id: tenantId } : {}, { projection: { _id: 0, id: 1 } }).limit(limit).toArray()
  return rows.map((r) => str(r.id, 200)).filter(Boolean)
}
