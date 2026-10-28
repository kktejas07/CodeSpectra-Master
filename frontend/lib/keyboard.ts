/**
 * SEO-062: "Enter sends" for text inputs, safe for Hindi / Telugu (and any
 * IME) typing. While a phonetic keyboard is composing, the Enter that picks
 * the suggested word must not submit the half-written message.
 *
 *   onKeyDown={(e) => { if (isSubmitEnter(e)) { e.preventDefault(); void send() } }}
 *   isSubmitEnter(e, { shift: false })      // Shift+Enter = new line
 *   isSubmitEnter(e, { modifier: true })    // only Ctrl/Cmd+Enter submits
 *
 * Works for React keyboard events and native KeyboardEvents (pure, client-safe).
 */
interface KeyLike {
  key: string
  shiftKey?: boolean
  metaKey?: boolean
  ctrlKey?: boolean
  keyCode?: number
  isComposing?: boolean
  nativeEvent?: { isComposing?: boolean; keyCode?: number }
}

/** True while an IME is composing (Safari reports keyCode 229 instead of isComposing). */
export function isImeComposing(e: KeyLike): boolean {
  return Boolean(e.isComposing || e.nativeEvent?.isComposing || e.keyCode === 229 || e.nativeEvent?.keyCode === 229)
}

export function isSubmitEnter(e: KeyLike, opts: { shift?: boolean; modifier?: boolean } = {}): boolean {
  if (e.key !== 'Enter' || isImeComposing(e)) return false
  if (opts.shift === false && e.shiftKey) return false
  if (opts.modifier && !(e.metaKey || e.ctrlKey)) return false
  return true
}
