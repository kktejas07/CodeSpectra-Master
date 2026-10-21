/**
 * File-type checks by content (magic bytes), not by the browser-sent
 * Content-Type or the file name alone. Used by upload routes that had only an
 * extension / MIME check. Inventory of every upload route and its checks:
 * docs/security/07-Security-Inventories.md.
 */

export type SniffedImage = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' | 'image/svg+xml'

const EXT_FOR: Record<SniffedImage, readonly string[]> = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/gif': ['gif'],
  'image/webp': ['webp'],
  'image/svg+xml': ['svg'],
}

function startsWith(bytes: Uint8Array, sig: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + sig.length) return false
  for (let i = 0; i < sig.length; i++) if (bytes[offset + i] !== sig[i]) return false
  return true
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  let s = ''
  for (let i = start; i < Math.min(end, bytes.length); i++) s += String.fromCharCode(bytes[i])
  return s
}

/** Raster images by signature; SVG by its markup (text starting with <svg or <?xml … <svg). */
export function sniffImageMime(bytes: Uint8Array, opts: { allowSvg?: boolean } = {}): SniffedImage | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  const gif = ascii(bytes, 0, 6)
  if (gif === 'GIF87a' || gif === 'GIF89a') return 'image/gif'
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return 'image/webp'
  if (opts.allowSvg) {
    let head = ascii(bytes, 0, 1024).replace(/^﻿/, '').replace(/^\xEF\xBB\xBF/, '').trimStart()
    if (head.startsWith('<?xml')) head = head.slice(head.indexOf('?>') + 2).trimStart()
    while (head.startsWith('<!--')) {
      const end = head.indexOf('-->')
      if (end < 0) break
      head = head.slice(end + 3).trimStart()
    }
    if (head.startsWith('<!DOCTYPE svg')) head = head.slice(head.indexOf('>') + 1).trimStart()
    if (/^<svg[\s>]/i.test(head)) return 'image/svg+xml'
  }
  return null
}

/** True when the file name's extension belongs to the sniffed type. */
export function imageExtensionMatches(name: string, mime: SniffedImage): boolean {
  const ext = (name.split('.').pop() || '').toLowerCase()
  return EXT_FOR[mime].includes(ext)
}

/** STEP (ISO 10303-21) exchange files are text that starts with "ISO-10303-21;". */
export function isStepFile(bytes: Uint8Array): boolean {
  const head = ascii(bytes, 0, 64).replace(/^\xEF\xBB\xBF/, '').trimStart()
  return head.startsWith('ISO-10303-21')
}

/**
 * Decode a base64 image (bare or data: URL) with a size cap and a magic-byte
 * check. Returns the real MIME and bytes, or null when it is not a JPEG/PNG/WebP
 * within `maxBytes`.
 */
export function decodeBase64Image(
  input: unknown,
  maxBytes: number,
  allowed: readonly SniffedImage[] = ['image/jpeg', 'image/png', 'image/webp'],
): { mime: SniffedImage; bytes: Buffer } | null {
  if (typeof input !== 'string' || !input) return null
  const raw = input.startsWith('data:') ? input.slice(input.indexOf(',') + 1) : input
  // base64 is 4 chars per 3 bytes; reject oversize before decoding.
  if (raw.length > Math.ceil(maxBytes / 3) * 4 + 4) return null
  if (!/^[A-Za-z0-9+/=\s]+$/.test(raw)) return null
  const bytes = Buffer.from(raw, 'base64')
  if (!bytes.length || bytes.length > maxBytes) return null
  const mime = sniffImageMime(bytes)
  if (!mime || !allowed.includes(mime)) return null
  return { mime, bytes }
}

/**
 * Answer files (file_upload / video_response questions): the upload kind the
 * bytes really are, checked against the kind the file name claims. Office
 * formats are ZIP containers, so docx/xlsx/pptx/zip share the PK signature and
 * rely on the extension + the container's marker file name. 'text' = no NUL
 * bytes and valid UTF-8 in the first 8 KB.
 */
export type AnswerFileKind = 'pdf' | 'image' | 'docx' | 'xlsx' | 'pptx' | 'zip' | 'text' | 'webm' | 'mp4'

export function sniffAnswerFile(bytes: Uint8Array, claimed: AnswerFileKind): boolean {
  switch (claimed) {
    case 'pdf':
      return ascii(bytes, 0, 5) === '%PDF-'
    case 'image':
      return sniffImageMime(bytes) !== null
    case 'zip':
    case 'docx':
    case 'xlsx':
    case 'pptx': {
      if (!startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) && !startsWith(bytes, [0x50, 0x4b, 0x05, 0x06])) return false
      if (claimed === 'zip') return true
      const marker = claimed === 'docx' ? 'word/' : claimed === 'xlsx' ? 'xl/' : 'ppt/'
      // The member names sit in the local headers; the first few KB always name the main part.
      return ascii(bytes, 0, Math.min(bytes.length, 64 * 1024)).includes(marker) || ascii(bytes, 0, 2048).includes('[Content_Types].xml')
    }
    case 'text': {
      const head = bytes.subarray(0, 8192)
      if (head.includes(0)) return false
      try {
        // stream: a multi-byte character cut at the 8 KB edge is not an error.
        new TextDecoder('utf-8', { fatal: true }).decode(head, { stream: true })
        return true
      } catch {
        return false
      }
    }
    case 'webm':
      return startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])
    case 'mp4':
      return ascii(bytes, 4, 8) === 'ftyp'
    default:
      return false
  }
}
