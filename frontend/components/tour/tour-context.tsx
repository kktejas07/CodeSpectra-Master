'use client'

import { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react'

export interface TourStep {
  target: string
  title: string
  description: string
  position?: 'top' | 'bottom' | 'left' | 'right'
}

function seenKey(tid: string) {
  return `has_seen_${tid}_tour`
}

function readSeen(tid: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(seenKey(tid)) === 'true'
  } catch {
    return false
  }
}

function writeSeen(tid: string) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(seenKey(tid), 'true')
  } catch {
    /* storage unavailable — tour just won't be remembered */
  }
}

function clearSeen(tid: string) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(seenKey(tid))
  } catch {
    /* noop */
  }
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

interface TourContextValue {
  isTourActive: boolean
  currentTour: TourStep[] | null
  currentStepIndex: number
  tourId: string | null
  startTour: (steps: TourStep[], tourId?: string) => void
  endTour: () => void
  nextStep: () => void
  prevStep: () => void
  goToStep: (index: number) => void
  setTourSeen: (tourId?: string) => void
  isTourSeen: (tourId: string) => boolean
  /** Replays the last-started tour for an id (used by the header Guide button). */
  replayTour: (tourId: string) => boolean
}

const TourContext = createContext<TourContextValue | undefined>(undefined)

export function TourProvider({ children }: { children: ReactNode }) {
  const [isTourActive, setIsTourActive] = useState(false)
  const [currentTour, setCurrentTour] = useState<TourStep[] | null>(null)
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [tourId, setTourId] = useState<string | null>(null)
  // ponytail: registry of last-started steps per tour id. startTour captures
  // automatically, so replayTour works with zero edits to the 15+ tour pages.
  const registryRef = useRef<Record<string, TourStep[]>>({})

  const startTour = useCallback((steps: TourStep[], id?: string) => {
    if (!steps || steps.length === 0) return
    if (id) registryRef.current[id] = steps
    setCurrentTour(steps)
    setCurrentStepIndex(0)
    setIsTourActive(true)
    if (id) setTourId(id)
  }, [])

  const endTour = useCallback(() => {
    setIsTourActive(false)
    setCurrentTour(null)
    setCurrentStepIndex(0)
    setTourId(null)
  }, [])

  const nextStep = useCallback(() => {
    if (currentTour && currentStepIndex < currentTour.length - 1) {
      setCurrentStepIndex(currentStepIndex + 1)
    } else {
      endTour()
    }
  }, [currentTour, currentStepIndex, endTour])

  const prevStep = useCallback(() => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(currentStepIndex - 1)
    }
  }, [currentStepIndex])

  const goToStep = useCallback(
    (index: number) => {
      if (currentTour && index >= 0 && index < currentTour.length) {
        setCurrentStepIndex(index)
      }
    },
    [currentTour],
  )

  const setTourSeen = useCallback((id?: string) => {
    const tid = id ?? tourId
    if (tid) writeSeen(tid)
  }, [tourId])

  const isTourSeen = useCallback((id: string) => readSeen(id), [])

  const replayTour = useCallback((id: string) => {
    const steps = registryRef.current[id]
    if (steps && steps.length > 0) {
      clearSeen(id)
      setCurrentTour(steps)
      setCurrentStepIndex(0)
      setIsTourActive(true)
      setTourId(id)
      return true
    }
    return false
  }, [])

  return (
    <TourContext.Provider
      value={{
        isTourActive,
        currentTour,
        currentStepIndex,
        tourId,
        startTour,
        endTour,
        nextStep,
        prevStep,
        goToStep,
        setTourSeen,
        isTourSeen,
        replayTour,
      }}
    >
      {children}
    </TourContext.Provider>
  )
}

export function useTour() {
  const context = useContext(TourContext)
  if (!context) {
    throw new Error('useTour must be used within a TourProvider')
  }
  return context
}
