/**
 * Résumé files: type check, ClamAV scan (same backend as /api/upload and the
 * knowledge uploads — fail closed), text extraction (PDF/DOCX/TXT/MD).
 */
import { detectUploadType, extractUploadText } from '@/lib/rag/sources/uploads'

export const MAX_RESUME_BYTES = 5 * 1024 * 1024
export const MAX_BULK_FILES = 50
export const MAX_RESUME_TEXT = 60_000

export class FileRejected extends Error {
  constructor(message: string, public status = 400) {
    super(message)
  }
}

export function safeFileName(raw: string): string {
  const base = String(raw || '').split(/[\\/]/).pop() || 'resume'
  return base.replace(/[\u0000-\u001f"<>|:*?]/g, '_').slice(0, 200) || 'resume'
}

/** ClamAV scan through the backend; fail closed. Also used by BGV documents (lib/ats/bgv/storage.ts). */
export async function virusScan(bytes: Buffer, filename: string): Promise<void> {
  const { backendPost } = await import('@/lib/ai/backend')
  try {
    await Promise.race([
      backendPost('/internal/security/scan', { file_base64: bytes.toString('base64'), filename }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('scan timeout')), 30_000)),
    ])
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/returned (400|422)\b/.test(msg)) throw new FileRejected('The security scanner rejected this file.')
    console.error('[ats/files] scanner unavailable:', msg.slice(0, 200))
    throw new FileRejected('The security scanner is offline right now. Try again in a few minutes.', 503)
  }
}

/** Validate, scan and extract one résumé. Throws FileRejected with a user-facing message. */
export async function readResumeFile(name: string, bytes: Uint8Array): Promise<{ file_name: string; text: string }> {
  const file_name = safeFileName(name)
  if (!bytes.byteLength) throw new FileRejected('The file is empty.')
  if (bytes.byteLength > MAX_RESUME_BYTES) throw new FileRejected(`Résumés can be up to ${MAX_RESUME_BYTES / 1024 / 1024} MB.`)
  const type = detectUploadType(file_name, bytes)
  if (!type) throw new FileRejected('Upload a PDF, DOCX, TXT or Markdown résumé.')
  await virusScan(Buffer.from(bytes), file_name)
  let text: string
  try {
    text = await extractUploadText(type, bytes)
  } catch (e) {
    console.error('[ats/files] extraction failed:', (e as Error).message)
    throw new FileRejected("We couldn't read this file. If it's a scanned PDF, upload a text version.")
  }
  text = text.replace(/[ \t]+\n/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim().slice(0, MAX_RESUME_TEXT)
  if (text.length < 30) throw new FileRejected("We couldn't find any text in this file. If it's a scanned PDF, upload a text version.")
  return { file_name, text }
}
