/**
 * W4-02: what to do with already-loaded third-party tags when the route
 * changes (pure, client-safe).
 *
 *   'none'   — public page, or nothing loaded.
 *   'pause'  — private page; every loaded tag can be paused in place.
 *   'reload' — private page; a tag that can't be paused is loaded (LinkedIn
 *              Insight has no stop API; GA4 / GTM keep sending cookieless
 *              pings with the page URL under Consent Mode "denied"), so the
 *              page is reloaded — a fresh load of a private path loads no tags.
 */
export type TagPlan = 'none' | 'pause' | 'reload'

/** Tags that cannot be fully silenced once loaded. */
export const UNPAUSABLE_TAGS: ReadonlySet<string> = new Set(['linkedin', 'ga4', 'gtm'])
/** Tags with a working stop / opt-out API. */
export const PAUSABLE_TAGS: ReadonlySet<string> = new Set(['clarity', 'posthog', 'meta'])

export function tagPlanForPath(onPrivate: boolean, loaded: ReadonlySet<string>): TagPlan {
  if (!onPrivate) return 'none'
  let anyLoaded = false
  for (const k of loaded) {
    if (UNPAUSABLE_TAGS.has(k)) return 'reload'
    if (PAUSABLE_TAGS.has(k)) anyLoaded = true
  }
  return anyLoaded ? 'pause' : 'none'
}
