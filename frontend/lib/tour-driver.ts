'use client'

/**
 * Single tour engine for the entire app — driver.js (https://driverjs.com).
 *
 * Everything tour-related goes through this module: one driver singleton,
 * one step registry, one seen-flag scheme. Pages keep calling
 * `startTour(steps, tourId)` via `useTour()` (thin compat in
 * components/tour/tour-context.tsx) and the header Guide button replays via
 * `replayPageTour()`. There is no second/other tour implementation.
 */

import type { Driver, DriveStep } from 'driver.js'
import type { DriverHint, Hints } from 'driver.js/hints'

// SEO-050: driver.js (+ its CSS) is loaded on first use only — see lib/tour-engine.ts.
let enginePromise: Promise<typeof import('./tour-engine')> | null = null
function loadEngine() {
  enginePromise ??= import('./tour-engine').catch((e) => { enginePromise = null; throw e })
  return enginePromise
}

export interface TourStep {
  target: string
  title: string
  description: string
  position?: 'top' | 'bottom' | 'left' | 'right'
}

export interface TourHint {
  /** Stable id — used to persist dismissal in localStorage. */
  id: string
  target: string
  title: string
  description: string
  position?: 'top' | 'bottom' | 'left' | 'right'
}

/** CSS class that themes driver.js popovers to match the app (see app/driver-tour.css). */
export const TOUR_POPOVER_CLASS = 'cs-tour-popover'

export { TOUR_ID_FOR_PATHS, resolveTourId } from './tour-paths'

/**
 * Dashboard welcome tour in the user's language (SEO-061): pass the page's
 * translator; the English below is the fallback for callers without one.
 */
export function welcomeTourSteps(t: (key: 'dash.tourWelcomeHomeTitle' | 'dash.tourWelcomeHomeBody' | 'dash.tourWelcomeArenaTitle' | 'dash.tourWelcomeArenaBody' | 'dash.tourWelcomeScannerTitle' | 'dash.tourWelcomeScannerBody') => string): TourStep[] {
  const [home, arena, scanner] = WELCOME_TOUR_STEPS
  return [
    { ...home, title: t('dash.tourWelcomeHomeTitle'), description: t('dash.tourWelcomeHomeBody') },
    { ...arena, title: t('dash.tourWelcomeArenaTitle'), description: t('dash.tourWelcomeArenaBody') },
    { ...scanner, title: t('dash.tourWelcomeScannerTitle'), description: t('dash.tourWelcomeScannerBody') },
  ]
}

/** Prebuilt dashboard welcome tour, English (migrated from the old tour-hooks). */
export const WELCOME_TOUR_STEPS: TourStep[] = [
  {
    target: '[data-tour="dashboard-overview"]',
    title: 'Your developer home',
    description:
      'Your command center: track XP and streaks here, then jump into practice, scans, or events below.',
    position: 'bottom',
  },
  {
    target: '[data-tour="practice-arena"]',
    title: 'Practice arena',
    description:
      'Challenge yourself with coding problems and interview questions. Track your progress and compete with peers.',
    position: 'bottom',
  },
  {
    target: '[data-tour="scanner-tool"]',
    title: 'Code scanner',
    description:
      'AI-powered code analysis that identifies issues, suggests improvements, and provides security insights.',
    position: 'bottom',
  },
]

function seenKey(tid: string) {
  return `has_seen_${tid}_tour`
}

export function isTourSeen(tid: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(seenKey(tid)) === 'true'
  } catch {
    return false
  }
}

export function markTourSeen(tid: string) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(seenKey(tid), 'true')
  } catch {
    /* storage unavailable — tour just won't be remembered */
  }
}

export function clearTourSeen(tid: string) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(seenKey(tid))
  } catch {
    /* noop */
  }
}

function toDriveSteps(steps: TourStep[]): DriveStep[] {
  return steps.map((s) => ({
    element: s.target,
    // ponytail: NO global skipMissingElement — with it, driver.js computes
    // "last step" from the next FINDABLE step, so one missing later anchor
    // turns step 1's Next button into Finish (the screenshot bug). Missing
    // targets instead wait 3s then show the centered fallback with honest
    // Next/Finish labels. Every anchor is also verified to exist in JSX.
    popover: {
      title: s.title,
      description: s.description,
      side: s.position ?? 'bottom',
    },
  }))
}

/**
 * SEO-061: button and progress labels in the user's language. The tour
 * provider (components/tour/tour-context.tsx) sets them from the active
 * catalog; they are applied before every drive() and to every hint, so a
 * language switch mid-session takes effect on the next tour.
 */
export interface TourLabels { next: string; back: string; finish: string; progress: string; gotIt: string }
export const ENGLISH_TOUR_LABELS: TourLabels = { next: 'Next', back: 'Back', finish: 'Finish', progress: '{{current}} of {{total}}', gotIt: 'Got it' }
let labels: TourLabels = ENGLISH_TOUR_LABELS
export function setTourLabels(next: Partial<TourLabels> | null) {
  labels = { ...ENGLISH_TOUR_LABELS, ...(next ?? {}) }
}
export function getTourLabels(): TourLabels {
  return labels
}
/** driver.js config fields for the current labels. */
export function tourLabelConfig(l: TourLabels = labels) {
  return { nextBtnText: l.next, prevBtnText: l.back, doneBtnText: l.finish, progressText: l.progress }
}

let instance: Driver | null = null
let activeTourId: string | null = null
// ponytail: registry of last-started steps per tour id, so replayTour works
// with zero changes to the 15+ tour pages.
const registry: Record<string, TourStep[]> = {}
// Flag to suppress markTourSeen when destroying the old instance to replay.
let replaying = false

const ARIA_POPUP_CAPABLE = 'button,a[href],input,select,textarea,summary,[role="button"],[role="combobox"],[role="link"],[role="menuitem"],[role="tab"],[role="treeitem"],[role="gridcell"],[role="row"],[role="application"]'

/** Remove aria-haspopup / aria-expanded where the element's role doesn't allow them. */
export function stripUnsupportedTourAria(el: Element): void {
  if (el.matches(ARIA_POPUP_CAPABLE)) return
  el.removeAttribute('aria-haspopup')
  el.removeAttribute('aria-expanded')
}

async function getDriver(): Promise<Driver | null> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null
  if (!instance) {
    const { driver } = await loadEngine()
    if (instance) return instance
    instance = driver({
      showProgress: true,
      ...tourLabelConfig(),
      popoverClass: TOUR_POPOVER_CLASS,
      smoothScroll: true,
      allowKeyboardControl: true,
      allowClose: true,
      overlayClickBehavior: 'close',
      waitForElement: 3000,
      // driver.js marks every highlighted element aria-haspopup/aria-expanded,
      // which is invalid ARIA on plain containers (axe: aria-allowed-attr) and
      // confuses screen readers. Keep them only on elements that support them.
      // driver.js sets those attributes synchronously right after
      // onHighlightStarted, but onHighlighted only fires once the ~400 ms
      // stage animation ends — so strip in a microtask after the start hook
      // (covers the animation window) and again when highlighting finishes.
      onHighlightStarted: (el) => { if (el) queueMicrotask(() => stripUnsupportedTourAria(el)) },
      onHighlighted: (el) => { if (el) stripUnsupportedTourAria(el) },
      onDestroyed: () => {
        // ponytail: mark seen on EVERY destroy (finish, X, overlay click) —
        // but NOT when we're destroying the old instance to replay.
        if (!replaying && activeTourId) markTourSeen(activeTourId)
        activeTourId = null
      },
    })
  }
  return instance
}

/** Register tour steps in the registry (always runs, even if tour was seen). */
export function registerPageTour(tourId: string, steps: TourStep[]) {
  if (!steps || steps.length === 0) return
  registry[tourId] = steps
}

/** Start (or restart) a page tour. No-op on empty steps or server-side. */
export function startPageTour(tourId: string, steps: TourStep[], opts: { replay?: boolean } = {}) {
  if (!steps || steps.length === 0) return
  registry[tourId] = steps
  void getDriver().then((d) => {
    if (!d || registry[tourId] !== steps) return
    if (d.isActive()) {
      replaying = !!opts.replay
      try { d.destroy() } finally { replaying = false }
    }
    activeTourId = tourId
    // configure() replaces the whole config, so merge onto the current one.
    d.setConfig({ ...d.getConfig(), ...tourLabelConfig() })
    d.setSteps(toDriveSteps(steps))
    d.drive()
  }).catch(() => { /* chunk failed to load (offline) — the tour just doesn't start */ })
}

/**
 * Auto-play a page tour (first-visit only). Registers steps ALWAYS (so the
 * Guide button can replay them later), then plays only when the tour hasn't
 * been seen yet. This replaces the old pattern where pages called
 * `if (!seen) startTour(...)` — that pattern left the registry empty when
 * the tour had been seen, making Guide always fall back to a page reload.
 */
export function autoPlayPageTour(tourId: string, steps: TourStep[]) {
  registerPageTour(tourId, steps)
  if (!isTourSeen(tourId)) {
    startPageTour(tourId, steps)
  }
}

/**
 * Replay a page tour (Guide button). Steps MUST be registered first
 * via registerPageTour or autoPlayPageTour. Returns false if no steps found.
 */
export function replayPageTour(tourId: string): boolean {
  const steps = registry[tourId]
  if (!steps || steps.length === 0) return false
  clearTourSeen(tourId)
  startPageTour(tourId, steps, { replay: true })
  return true
}

export function endPageTour() {
  if (instance?.isActive()) instance.destroy()
  activeTourId = null
}

export function nextTourStep() {
  instance?.moveNext()
}

export function prevTourStep() {
  instance?.movePrevious()
}

export function goTourStep(index: number) {
  instance?.moveTo(index)
}

export function getActiveTourId(): string | null {
  return activeTourId
}

/** True when steps were registered for a tour id this session (replayable). */
export function hasRegisteredTour(tourId: string): boolean {
  const steps = registry[tourId]
  return !!steps && steps.length > 0
}

// ── Feature hints (driver.js/hints) ─────────────────────────────────────────
// Pulsing beacons pinned to elements; click opens a popover, "Got it"
// dismisses. Dismissals persist in localStorage so a dismissed hint never
// comes back. Separate singleton from the tour driver (per docs, each
// driver()/hints() instance is independent).

let hintsInstance: Hints | null = null

function hintSeenKey(id: string) {
  return `has_seen_hint_${id}`
}

function isHintDismissed(id: string): boolean {
  if (typeof window === 'undefined') return true
  try {
    return window.localStorage.getItem(hintSeenKey(id)) === 'true'
  } catch {
    return false
  }
}

async function getHints(): Promise<Hints | null> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null
  if (!hintsInstance) {
    const { hints } = await loadEngine()
    if (hintsInstance) return hintsInstance
    hintsInstance = hints({
      popoverClass: TOUR_POPOVER_CLASS,
      buttonText: labels.gotIt,
      onDismiss: (_el, hint) => {
        const id = typeof hint.id === 'string' ? hint.id : null
        if (id) {
          try {
            window.localStorage.setItem(hintSeenKey(id), 'true')
          } catch {
            /* storage unavailable — hint just won't be remembered */
          }
        }
      },
    })
  }
  return hintsInstance
}

function toDriverHints(hintSetId: string, items: TourHint[]): DriverHint[] {
  return items
    .filter((h) => !isHintDismissed(`${hintSetId}:${h.id}`))
    .map((h) => ({
      element: h.target,
      id: `${hintSetId}:${h.id}`,
      popover: {
        title: h.title,
        description: h.description,
        side: h.position ?? 'bottom',
        popoverClass: TOUR_POPOVER_CLASS,
        buttonText: labels.gotIt,
      },
    }))
}

/**
 * Show a set of feature-hint beacons. Already-dismissed hints are skipped;
 * missing elements are skipped by driver.js and picked up on a later show().
 * No-op when everything was dismissed or on the server.
 */
export function startPageHints(hintSetId: string, items: TourHint[]) {
  if (!items || items.length === 0) return
  const pending = toDriverHints(hintSetId, items)
  if (pending.length === 0) return
  void getHints().then((h) => {
    if (!h) return
    h.setHints(pending)
    h.show()
  }).catch(() => { /* chunk failed to load — no beacons */ })
}

/** Dismiss one hint programmatically (marks it seen so it never returns). */
export function dismissPageHint(hintSetId: string, id: string) {
  const fullId = `${hintSetId}:${id}`
  try {
    window.localStorage.setItem(hintSeenKey(fullId), 'true')
  } catch {
    /* noop */
  }
  hintsInstance?.dismiss(fullId)
}

/** Hide all currently visible beacons without dismissing them. */
export function hidePageHints() {
  hintsInstance?.hide()
}
