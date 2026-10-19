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
