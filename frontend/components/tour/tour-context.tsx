'use client'

/**
 * Thin React glue over the single tour engine (`@/lib/tour-driver`, driver.js).
 *
 * Kept (rather than deleted) so the 15+ tour pages don't churn: they keep
 * calling `useTour()` → `startTour(steps, tourId)` / `setTourSeen(tourId)`,
 * which now drive the shared driver.js singleton. There is no custom
 * tooltip/renderer anymore — driver.js owns all tour UI.
 */

import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react'
import { useT } from '@/lib/i18n/client'
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
  setTourLabels,
  type TourStep,
} from '@/lib/tour-driver'

export { TOUR_ID_FOR_PATHS, resolveTourId, autoPlayPageTour, type TourStep, type TourHint } from '@/lib/tour-driver'

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
  // SEO-061: tour buttons in the active language. The provider sits above the
  // per-segment I18nProvider; useT() reads the published locale there.
  const { t } = useT()
  useEffect(() => {
    setTourLabels({
      next: t('common.next'),
      back: t('common.back'),
      finish: t('common.tourFinish'),
      progress: t('common.tourProgress', { current: '{{current}}', total: '{{total}}' }),
      gotIt: t('common.tourGotIt'),
    })
  }, [t])
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
