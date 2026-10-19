'use client'

/**
 * W4-10: read browser-only values (window, document.cookie, localStorage,
 * matchMedia, navigator, location) without breaking hydration.
 *
 * Server render and the first client render both use `fallback`; the real
 * value is read in an effect after mount, so the two trees always match.
 * Never read these APIs in render or in a useState / useMemo initialiser.
 */
import { useEffect, useState } from 'react'

export function useBrowserValue<T>(read: () => T, fallback: T, deps: readonly unknown[] = []): T {
  const [value, setValue] = useState<T>(fallback)
  useEffect(() => {
    try {
      setValue(read())
    } catch {
      /* storage blocked, etc. — keep the fallback */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return value
}

/** window.location.origin after mount ('' on the server / first render). */
export function useOrigin(fallback = ''): string {
  return useBrowserValue(() => window.location.origin, fallback)
}

/** window.location.href after mount. */
export function useHref(fallback = ''): string {
  return useBrowserValue(() => window.location.href, fallback)
}
