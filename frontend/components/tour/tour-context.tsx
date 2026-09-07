'use client'

/**
 * Thin React glue over the single tour engine (`@/lib/tour-driver`, driver.js).
 *
 * Kept (rather than deleted) so the 15+ tour pages don't churn: they keep
 * calling `useTour()` → `startTour(steps, tourId)` / `setTourSeen(tourId)`,
 * which now drive the shared driver.js singleton. There is no custom
 * tooltip/renderer anymore — driver.js owns all tour UI.
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import {
  startPageTour,
  autoPlayPageTour,
  endPageTour,
  nextTourStep,
  prevTourStep,
  goTourStep,
  replayPageTour,
  markTourSeen,
  isTourSeen as isSeen,
  getActiveTourId,
  type TourStep,
} from '@/lib/tour-driver'

export { TOUR_ID_FOR_PATHS, resolveTourId, type TourStep, type TourHint } from '@/lib/tour-driver'

interface TourContextValue {
  /** Static snapshots — driver.js owns live tour state; pages don't read these. */
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
  const value = useMemo<TourContextValue>(
    () => ({
      isTourActive: false,
      currentTour: null,
      currentStepIndex: 0,
      tourId: getActiveTourId(),
      startTour: (steps, id) => {
        if (id) autoPlayPageTour(id, steps)
      },
      endTour: () => endPageTour(),
      nextStep: () => nextTourStep(),
      prevStep: () => prevTourStep(),
      goToStep: (index) => goTourStep(index),
      setTourSeen: (id) => {
        const tid = id ?? getActiveTourId()
        if (tid) markTourSeen(tid)
      },
      isTourSeen: (id) => isSeen(id),
      replayTour: (id) => replayPageTour(id),
    }),
    [],
  )
  return <TourContext.Provider value={value}>{children}</TourContext.Provider>
}

export function useTour() {
  const context = useContext(TourContext)
  if (!context) {
    throw new Error('useTour must be used within a TourProvider')
  }
  return context
}
