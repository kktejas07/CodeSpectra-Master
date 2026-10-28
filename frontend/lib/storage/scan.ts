/**
 * ClamAV scan through the backend (/internal/security/scan, the same scanner
 * as /api/upload and the résumé uploads). Never throws:
 *   clean      scanner said OK
 *   infected   scanner rejected the file (400)
 *   unscanned  scanner unreachable / timed out / file too large for it
 *
 * Small buffers go as one JSON request; anything above INLINE_MAX_BYTES (the
 * backend caps that body at ~6 MB) and every S3 object is streamed to
 * /internal/security/scan-stream, which relays the bytes to clamd INSTREAM
 * chunk by chunk — memory stays bounded whatever the file size.
 */
export type ScanStatus = 'clean' | 'infected' | 'unscanned'

export interface ScanResult {
  status: ScanStatus
  /** Why a file is unscanned: scanner unreachable / timed out, or bigger than the scanner accepts. */
  reason?: 'offline' | 'too_large'
}

const INLINE_MAX_BYTES = 4 * 1024 * 1024

/** Pure: map a backend error message to a scan result. */
export function scanResultFromError(msg: string): ScanResult {
  if (/returned 400\b/.test(msg)) return { status: 'infected' }
  if (/returned 413\b/.test(msg)) return { status: 'unscanned', reason: 'too_large' }
  return { status: 'unscanned', reason: 'offline' }
}

/** Stream timeout: ~1 minute plus 1 s per 4 MB (2 GB ≈ 9.5 min), capped at 20 minutes. */
export function streamScanTimeoutMs(size: number): number {
  return Math.min(20 * 60_000, 60_000 + Math.ceil(Math.max(0, size) / (4 * 1024 * 1024)) * 1000)
}

export async function scanBuffer(bytes: Buffer, filename: string): Promise<ScanStatus> {
  if (bytes.length > INLINE_MAX_BYTES) {
    const stream = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array(bytes)); c.close() } })
    return (await scanStream(stream, bytes.length)).status
  }
  const { backendPost } = await import('@/lib/ai/backend')
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      backendPost('/internal/security/scan', { file_base64: bytes.toString('base64'), filename }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('scan timeout')), 60_000) }),
    ])
    return 'clean'
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // 422 = malformed / empty payload on the inline route; treated as a rejection as before.
    if (/returned (400|422)\b/.test(msg)) return 'infected'
    console.error('[storage] scanner unavailable:', msg.slice(0, 120))
    return 'unscanned'
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** Scan a byte stream of known size (an S3 object body) without buffering it. */
export async function scanStream(stream: ReadableStream<Uint8Array>, size: number): Promise<ScanResult> {
  const { backendPostStream } = await import('@/lib/ai/backend')
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), streamScanTimeoutMs(size))
  try {
    await backendPostStream('/internal/security/scan-stream', stream, { size, signal: ctrl.signal })
    return { status: 'clean' }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const r = scanResultFromError(msg)
    if (r.status === 'unscanned') console.error('[storage] stream scan not completed:', r.reason, msg.slice(0, 120))
    try { await stream.cancel() } catch { /* already closed */ }
    return r
  } finally {
    clearTimeout(timer)
  }
}
