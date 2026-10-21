/**
 * Build-time prerender helpers.
 *
 * `next build` runs without a database (Dockerfile / CI: secrets are runtime
 * only), so data helpers fall back to empty lists and default settings while
 * static and ISR pages are prerendered. Those placeholders must not live for a
 * whole revalidate window: during the build we register a 1-second cache
 * lifetime with `unstable_cache`, which lowers the prerendered entry's
 * revalidate (node_modules/next/dist/server/web/spec-extension/unstable-cache.js
 * → workUnitStore.revalidate). The first request after deploy is served the
 * placeholder and regenerates the page in the background; from then on the
 * route's own `revalidate` applies. Outside the build this is a no-op.
 */
export function isBuildPhase(): boolean {
  return process.env.NEXT_PHASE === 'phase-production-build'
}

export async function expireSoonIfBuilding(): Promise<void> {
  if (!isBuildPhase()) return
  try {
    const { unstable_cache } = await import('next/cache')
    await unstable_cache(async () => 1, ['cs-build-placeholder'], { revalidate: 1 })()
  } catch {
    /* outside a prerender (route handlers, scripts): nothing to shorten */
  }
}
