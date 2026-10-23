/**
 * SEC-023: is the code runner image pinned by digest? docker-compose passes the
 * operator's PISTON_IMAGE through (empty = compose fell back to the floating
 * `:latest` tag). Shown as a warning on Admin → System; never blocks anything.
 */
export function pistonImagePinned(value: string | undefined = process.env.PISTON_IMAGE): boolean {
  return /@sha256:[0-9a-f]{64}$/.test((value || '').trim())
}
