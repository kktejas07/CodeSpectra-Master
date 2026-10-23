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

import { driver, type Driver, type DriveStep } from 'driver.js'
import { hints, type DriverHint, type Hints } from 'driver.js/hints'

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

/**
 * Single source of truth mapping a dashboard pathname → tour id.
 * The header Guide button and the per-page tour effects must agree,
 * otherwise Guide replays the wrong tour (or nothing at all).
 */
export const TOUR_ID_FOR_PATHS: Record<string, string> = {
  '/dashboard': 'welcome',
  '/dashboard/scanner': 'scanner',
  '/dashboard/problems': 'problems',
  '/dashboard/arena': 'arena',
  '/dashboard/courses': 'courses',
  '/dashboard/events': 'events',
  '/dashboard/interviews': 'interviews',
  '/dashboard/leaderboard': 'leaderboard',
  '/dashboard/achievements': 'achievements',
  '/dashboard/assessments': 'assessments',
  '/dashboard/tracks': 'tracks',
  '/dashboard/hackathons': 'hackathons',
  '/dashboard/articles': 'articles',
  '/dashboard/codeathons': 'codeathons',
  '/dashboard/settings': 'settings',
  '/dashboard/activity/recent': 'recent',
  '/dashboard/admin/system': 'admin-system',
  // ponytail: explicit per-page entries so every admin route shows its own
  // guide; the '/dashboard/admin' catch-all below covers future pages.
  // Longer exact entries (like admin/system above) still win by longest-match.
  '/dashboard/admin': 'admin',
  '/dashboard/admin/feedback': 'feedback',
  '/dashboard/admin/ai-inventory': 'admin-ai-inventory',
  '/dashboard/admin/analytics': 'admin-analytics',
  '/dashboard/admin/announcements': 'admin-announcements',
  '/dashboard/admin/assessments': 'admin-assessments',
  '/dashboard/admin/assessments/[id]': 'admin-assessment-results',
  '/dashboard/admin/assessments/[id]/edit': 'admin-assessments-edit',
  '/dashboard/admin/assessments/[id]/results': 'admin-assessment-results',
  '/dashboard/admin/assessments/bulk': 'admin-assessments-bulk',
  '/dashboard/admin/assessments/pipeline': 'admin-assessments-pipeline',
  '/dashboard/admin/billing': 'admin-billing',
  '/dashboard/admin/blog': 'admin-blog',
  '/dashboard/admin/cdn': 'admin-cdn',
  '/dashboard/admin/certificates': 'admin-certificates',
  '/dashboard/admin/codeathons': 'admin-codeathons',
  '/dashboard/admin/content-studio': 'admin-content-studio',
  '/dashboard/admin/coupons': 'admin-coupons',
  '/dashboard/admin/courses': 'admin-courses',
  '/dashboard/admin/courses/[id]': 'admin-course-detail',
  '/dashboard/admin/cron-jobs': 'admin-cron-jobs',
  '/dashboard/admin/hackathons': 'admin-hackathons',
  '/dashboard/admin/hackathons/[id]': 'admin-hackathon-detail',
  '/dashboard/admin/hackathons/[id]/report': 'admin-hackathon-report',
  '/dashboard/admin/hackathons/create': 'admin-hackathon-create',
  '/dashboard/admin/hackathons/edit/[id]': 'admin-hackathon-edit',
  '/dashboard/admin/help': 'admin-help',
  '/dashboard/admin/hiring-manager-report': 'admin-hiring-report',
  '/dashboard/admin/integrations': 'admin-integrations',
  '/dashboard/admin/jobs': 'admin-jobs',
  '/dashboard/admin/kyc': 'admin-kyc',
  '/dashboard/admin/newsletter': 'admin-newsletter',
  '/dashboard/admin/organizations': 'admin-organizations',
  '/dashboard/admin/permissions': 'admin-permissions',
  '/dashboard/admin/plans': 'admin-plans',
  '/dashboard/admin/predictive-validity': 'admin-predictive',
  '/dashboard/admin/pricing': 'admin-plans',
  '/dashboard/admin/proctor': 'admin-proctor',
  '/dashboard/admin/question-bank': 'admin-question-bank',
  '/dashboard/admin/question-generator': 'admin-question-generator',
  '/dashboard/admin/rag': 'admin-rag',
  '/dashboard/admin/resources': 'admin-resources',
  '/dashboard/admin/resumes': 'admin-resumes',
  '/dashboard/admin/roles': 'admin-roles',
  '/dashboard/admin/security': 'admin-security',
  '/dashboard/admin/security/email-monitoring': 'admin-email-monitoring',
  '/dashboard/admin/settings': 'admin-settings',
  '/dashboard/admin/settings/cloudflare': 'admin-settings',
  '/dashboard/admin/settings/kyc': 'admin-settings',
  '/dashboard/admin/signals': 'admin-signals',
  '/dashboard/admin/sme-review': 'admin-sme-review',
  '/dashboard/admin/speed-insights': 'admin-speed-insights',
  '/dashboard/admin/sso': 'admin-sso',
  '/dashboard/admin/team': 'admin-team',
  '/dashboard/admin/team/activity': 'admin-team-activity',
  '/dashboard/admin/teams': 'admin-teams',
  '/dashboard/admin/users': 'admin-users',
  '/dashboard/admin/workflows': 'admin-workflows',
  // ponytail: bracket segments are dynamic ids — resolveTourId matches them
  // against any single path segment (see below).
  '/dashboard/interviews/[id]': 'interview-detail',
  // User pages with first-visit tours (one entry per page — the registry is
  // keyed by tour id, so ids must be unique across pages).
  '/dashboard/profile': 'profile',
  '/dashboard/notifications': 'notifications',
  '/dashboard/notifications/preferences': 'notification-preferences',
  '/dashboard/jobs': 'jobs',
  '/dashboard/mock-tests': 'mock-tests',
  '/dashboard/mock-tests/[id]': 'mock-test-detail',
  '/dashboard/challenges': 'challenges',
  '/dashboard/courses/[id]': 'course-detail',
  '/dashboard/courses/my': 'my-courses',
  '/dashboard/courses/wishlist': 'wishlist',
  '/dashboard/courses/generate': 'course-generate',
  '/dashboard/problems/[slug]': 'problem-detail',
  '/dashboard/codeathons/[id]': 'codeathon-detail',
  '/dashboard/interviews/schedule': 'interview-schedule',
  '/dashboard/interviews/setup': 'interview-setup',
  '/dashboard/interviews/ai-mock/setup': 'ai-mock-setup',
  '/dashboard/assessments/[id]': 'assessment-detail',
  '/dashboard/resumes': 'resumes',
  '/dashboard/calendar': 'calendar',
  '/dashboard/billing': 'billing',
  '/dashboard/support': 'support',
  '/dashboard/judge': 'judge-desk',
  '/dashboard/activity/sessions': 'sessions',
  '/dashboard/activity/bookmarks': 'bookmarks',
  '/dashboard/referrals': 'referrals',
  '/dashboard/certifications': 'certifications',
  '/dashboard/skill-analytics': 'skill-analytics',
  '/dashboard/resources/[slug]': 'resource-reader',
  '/dashboard/resources': 'resources',
  '/dashboard/interview-prep': 'interview-prep',
  '/dashboard/agent': 'agent',
  '/dashboard/100-days': '100-days',
  '/dashboard/identity-verify': 'identity-verify',
  '/dashboard/arena/[id]': 'arena-detail',
  '/dashboard/settings/ai': 'ai-settings',
  '/dashboard/recruiter-analytics': 'recruiter-analytics',
  '/dashboard/pricing': 'pricing',
  '/dashboard/cad': 'cad',
  '/dashboard/challenges/[id]': 'challenge-detail',
  '/dashboard/team/invites/[token]': 'team-invite',
}

/**
 * Longest-prefix match so `/dashboard` doesn't shadow every page.
 * `[param]` segments (e.g. `/dashboard/interviews/[id]`) match any single
 * path segment, so dynamic pages resolve to their own tour instead of the
 * parent list page's tour.
 */
export function resolveTourId(pathname: string): string | null {
  const base = pathname.split('?')[0]
  if (TOUR_ID_FOR_PATHS[base]) return TOUR_ID_FOR_PATHS[base]
  let best: string | null = null
  for (const path of Object.keys(TOUR_ID_FOR_PATHS)) {
    const pattern = new RegExp(
      '^' + path.split('/').map((seg) => (/^\[.+\]$/.test(seg) ? '[^/]+' : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join('/') + '(/|$)',
    )
    if (pattern.test(base) && (!best || path.length > best.length)) {
      best = path
    }
  }
  return best ? TOUR_ID_FOR_PATHS[best] : null
}

/** Prebuilt dashboard welcome tour (migrated from the old tour-hooks). */
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

function getDriver(): Driver | null {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null
  if (!instance) {
    instance = driver({
      showProgress: true,
      progressText: '{{current}} of {{total}}',
      popoverClass: TOUR_POPOVER_CLASS,
      smoothScroll: true,
      allowKeyboardControl: true,
      allowClose: true,
      overlayClickBehavior: 'close',
      waitForElement: 3000,
      nextBtnText: 'Next',
      prevBtnText: 'Back',
      doneBtnText: 'Finish',
      // driver.js marks every highlighted element aria-haspopup/aria-expanded,
      // which is invalid ARIA on plain containers (axe: aria-allowed-attr) and
      // confuses screen readers. Keep them only on elements that support them.
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
export function startPageTour(tourId: string, steps: TourStep[]) {
  if (!steps || steps.length === 0) return
  registry[tourId] = steps
  const d = getDriver()
  if (!d) return
  if (d.isActive()) d.destroy()
  activeTourId = tourId
  d.setSteps(toDriveSteps(steps))
  d.drive()
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
  replaying = true
  try {
    startPageTour(tourId, steps)
  } finally {
    replaying = false
  }
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

function getHints(): Hints | null {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null
  if (!hintsInstance) {
    hintsInstance = hints({
      popoverClass: TOUR_POPOVER_CLASS,
      buttonText: 'Got it',
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
  const h = getHints()
  if (!h) return
  const pending = toDriverHints(hintSetId, items)
  if (pending.length === 0) return
  h.setHints(pending)
  h.show()
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
