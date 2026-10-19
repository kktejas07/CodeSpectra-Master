/**
 * Fullscreen + device helpers for proctored tests (audit CORE-027). iPhone
 * Safari has no Element.requestFullscreen (iPad only the webkit-prefixed one),
 * so calling it unguarded threw a TypeError on every tap.
 */
type FsDoc = { fullscreenElement?: Element | null; webkitFullscreenElement?: Element | null }
type FsEl = { requestFullscreen?: () => Promise<void>; webkitRequestFullscreen?: () => void | Promise<void> }

export function isFullscreen(doc: FsDoc): boolean {
  return !!(doc.fullscreenElement || doc.webkitFullscreenElement)
}

/** 'ok' | 'unsupported' (no API on this browser) | 'rejected' (browser said no). Never throws. */
export async function requestFullscreenSafe(el: FsEl): Promise<'ok' | 'unsupported' | 'rejected'> {
  try {
    if (typeof el.requestFullscreen === 'function') { await el.requestFullscreen(); return 'ok' }
    if (typeof el.webkitRequestFullscreen === 'function') { await el.webkitRequestFullscreen(); return 'ok' }
    return 'unsupported'
  } catch {
    return 'rejected'
  }
}

/** Phones and tablets: no screen sharing and (often) no fullscreen — candidates should use a computer. */
export function isMobileUserAgent(ua: string): boolean {
  return /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle|Opera Mini|IEMobile/i.test(ua)
}
