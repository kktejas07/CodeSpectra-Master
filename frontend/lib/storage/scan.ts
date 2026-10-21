/**
 * ClamAV scan through the backend (/internal/security/scan, the same scanner
 * as /api/upload and the résumé uploads). Never throws:
 *   clean      scanner said OK
 *   infected   scanner rejected the file (400/422)
 *   unscanned  scanner unreachable / timed out
 */
export type ScanStatus = 'clean' | 'infected' | 'unscanned'

export async function scanBuffer(bytes: Buffer, filename: string): Promise<ScanStatus> {
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
    if (/returned (400|422)\b/.test(msg)) return 'infected'
    console.error('[storage] scanner unavailable:', msg.slice(0, 120))
    return 'unscanned'
  } finally {
    if (timer) clearTimeout(timer)
  }
}
