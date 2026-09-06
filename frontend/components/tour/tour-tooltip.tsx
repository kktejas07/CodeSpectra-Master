'use client'

import { useEffect, useRef } from 'react'
import { useTour } from '@/components/tour/tour-context'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'

/**
 * Driver.js-inspired tour tooltip for CodeSpectra
 * Lightweight implementation without external dependencies
 */
export function TourTooltip() {
  const { isTourActive, currentTour, currentStepIndex, endTour, nextStep, prevStep, setTourSeen, tourId, startTour } = useTour()
  const tooltipRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isTourActive || !currentTour || !tooltipRef.current) return

    const currentStep = currentTour[currentStepIndex]
    const targetElement = document.querySelector(currentStep.target)

    if (targetElement && tooltipRef.current) {
      const targetEl = targetElement as HTMLElement
      // Highlight target element
      targetEl.classList.add('tour-highlight')
      targetEl.style.boxShadow = '0 0 0 4px rgba(34, 211, 238, 0.4), 0 0 20px rgba(34, 211, 238, 0.2)'
      targetEl.style.zIndex = '1000'
      targetEl.style.position = 'relative'

      // Position tooltip near target
      const targetRect = targetEl.getBoundingClientRect()
      const tooltipRect = tooltipRef.current.getBoundingClientRect()

      let top = targetRect.bottom + 10
      let left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2)

      // Adjust if tooltip goes off screen
      if (top + tooltipRect.height > window.innerHeight) {
        top = targetRect.top - tooltipRect.height - 10
      }
      if (left < 10) {
        left = 10
      }
      if (left + tooltipRect.width > window.innerWidth - 10) {
        left = window.innerWidth - tooltipRect.width - 10
      }

      tooltipRef.current.style.position = 'fixed'
      tooltipRef.current.style.top = `${top}px`
      tooltipRef.current.style.left = `${left}px`
      tooltipRef.current.style.zIndex = '1001'

      return () => {
        targetEl.classList.remove('tour-highlight')
        targetEl.style.boxShadow = ''
        targetEl.style.zIndex = ''
        targetEl.style.position = ''
      }
    }
  }, [isTourActive, currentTour, currentStepIndex])

  if (!isTourActive || !currentTour) return null

  const currentStep = currentTour[currentStepIndex]
  const isFirstStep = currentStepIndex === 0
  const isLastStep = currentStepIndex === currentTour.length - 1

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/50 z-[999]" onClick={endTour} />

      {/* Tour tooltip */}
      <div
        ref={tooltipRef}
        className="fixed bg-card border border-border rounded-lg shadow-2xl p-5 w-80 max-w-[90vw] animate-in fade-in slide-in-from-bottom-4 duration-200"
      >
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between">
            <h3 className="font-semibold text-sm text-foreground">{currentStep.title}</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setTourSeen(tourId ?? undefined); endTour() }}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Skip tour
              </button>
              <button
                onClick={() => {
                  window.localStorage.removeItem(`has_seen_${tourId}_tour`)
                  endTour()
                  // Restart the tour by calling startTour with the current tour and tourId
                  if (currentTour && tourId) {
                    startTour(currentTour, tourId)
                  }
                }}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Restart tour
              </button>
              <button
                onClick={endTour}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Close tour"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Description */}
          <p className="text-xs text-muted-foreground leading-relaxed">
            {currentStep.description}
          </p>

          {/* Progress */}
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-200"
                style={{ width: `${((currentStepIndex + 1) / currentTour.length) * 100}%` }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {currentStepIndex + 1}/{currentTour.length}
            </span>
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between pt-2 border-t border-border/60">
            <button
              onClick={prevStep}
              disabled={isFirstStep}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                isFirstStep
                  ? 'text-muted-foreground/30 cursor-not-allowed'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              )}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Back
            </button>

            {isLastStep ? (
              <button
                onClick={() => { setTourSeen(tourId ?? undefined); endTour() }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
              >
                Finish
              </button>
            ) : (
              <button
                onClick={nextStep}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
          )}
        </div>
        </div>
      </div>
    </>
  )
}

function cn(...classes: string[]) {
  return classes.filter(Boolean).join(' ')
}