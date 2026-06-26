/**
 * Lazy in-process scheduler bootstrap.
 *
 * Called from API routes (e.g. `getAPIUser` / `bootSchedulerOnce`) so the
 * scheduler tick loop starts on the first request — never from
 * `instrumentation.ts` (which would force the MongoDB driver into the
 * Edge bundle).
 */

let bootPromise: Promise<void> | null = null

export function bootSchedulerOnce(): void {
  if (bootPromise) return
  if (typeof window !== 'undefined') return
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  if (process.env.NEXT_PUBLIC_DISABLE_SCHEDULER === '1') return
  bootPromise = (async () => {
    try {
      const mod = await import('./scheduler')
      mod.startSchedulerLoop()
      console.log('[CodeSpectra] scheduler loop booted lazily on first request')
    } catch (e) {
      console.warn('[CodeSpectra] scheduler bootstrap skipped:', e)
      bootPromise = null
    }
  })()
}
