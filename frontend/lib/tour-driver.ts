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

export interface TourStep {
  target: string
  title: string
  description: string
  position?: 'top' | 'bottom' | 'left' | 'right'
}

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
}

/** Longest-prefix match so `/dashboard` doesn't shadow every page. */
export function resolveTourId(pathname: string): string | null {
  const base = pathname.split('?')[0]
  if (TOUR_ID_FOR_PATHS[base]) return TOUR_ID_FOR_PATHS[base]
  let best: string | null = null
  for (const path of Object.keys(TOUR_ID_FOR_PATHS)) {
    if ((base === path || base.startsWith(path + '/')) && (!best || path.length > best.length)) {
      best = path
    }
  }
  return best ? TOUR_ID_FOR_PATHS[best] : null
}

/** Prebuilt dashboard welcome tour (migrated from the old tour-hooks). */
export const WELCOME_TOUR_STEPS: TourStep[] = [
  {
    target: '[data-tour="dashboard-overview"]',
    title: 'Welcome to CodeSpectra!',
    description:
      'Your AI-powered engineering platform. Get insights into your code, practice challenges, and showcase your skills.',
    position: 'bottom',
  },
  {
    target: '[data-tour="practice-arena"]',
    title: 'Practice Arena',
    description:
      'Challenge yourself with coding problems and interview questions. Track your progress and compete with peers.',
    position: 'bottom',
  },
  {
    target: '[data-tour="scanner-tool"]',
    title: 'Code Scanner',
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
    // ponytail: driver.js natively waits for late-rendering targets and skips
    // ones that never appear — the two failure modes the old custom tooltip
    // had to hand-roll retry/skip logic for.
    skipMissingElement: true,
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

function getDriver(): Driver | null {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null
  if (!instance) {
    instance = driver({
      showProgress: true,
      progressText: '{{current}} of {{total}}',
      smoothScroll: true,
      allowKeyboardControl: true,
      allowClose: true,
      overlayClickBehavior: 'close',
      skipMissingElement: true,
      waitForElement: 3000,
      nextBtnText: 'Next',
      prevBtnText: 'Back',
      doneBtnText: 'Finish',
      onDestroyed: () => {
        activeTourId = null
      },
    })
  }
  return instance
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
 * Replay the last-started tour for an id (header Guide button).
 * Returns false when this page's tour hasn't run yet this session —
 * callers fall back to clearing the seen flag + reloading.
 */
export function replayPageTour(tourId: string): boolean {
  const steps = registry[tourId]
  if (!steps || steps.length === 0) return false
  clearTourSeen(tourId)
  startPageTour(tourId, steps)
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
