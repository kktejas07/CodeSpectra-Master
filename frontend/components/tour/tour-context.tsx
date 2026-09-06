'use client'

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

export interface TourStep {
  target: string
  title: string
  description: string
  position?: 'top' | 'bottom' | 'left' | 'right'
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
}

const TourContext = createContext<TourContextValue | undefined>(undefined)

export function TourProvider({ children }: { children: ReactNode }) {
  const [isTourActive, setIsTourActive] = useState(false)
  const [currentTour, setCurrentTour] = useState<TourStep[] | null>(null)
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [tourId, setTourId] = useState<string | null>(null)

  const startTour = useCallback((steps: TourStep[], id?: string) => {
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

  const goToStep = useCallback((index: number) => {
    if (currentTour && index >= 0 && index < currentTour.length) {
      setCurrentStepIndex(index)
    }
  }, [currentTour])

  const setTourSeen = useCallback((id?: string) => {
    const tid = id ?? tourId
    if (tid) {
      window.localStorage.setItem(`has_seen_${tid}_tour`, 'true')
    }
  }, [tourId])

  const isTourSeen = useCallback((id: string) => {
    return window.localStorage.getItem(`has_seen_${id}_tour`) === 'true'
  }, [])

  const restartTour = useCallback((id: string) => {
    // Clear the seen flag and restart the tour
    window.localStorage.removeItem(`has_seen_${id}_tour`)
    // Note: Actual tour restarting would be handled by the calling component
    // This function just clears the flag
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