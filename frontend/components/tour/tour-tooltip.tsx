'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTour } from '@/components/tour/tour-context'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'

const MAX_TARGET_RETRIES = 12
const TARGET_RETRY_MS = 250

/**
 * Driver.js-inspired tour tooltip for CodeSpectra.
 * Lightweight implementation without external dependencies.
 *
 * Robustness rules (why tours used to look "not working at all"):
 * - tour targets often render AFTER the tour starts (async data), so the
 *   tooltip retries the querySelector for ~3s instead of giving up on tick 0.
 * - a step whose target never appears is SKIPPED, not stranded — the tour
 *   jumps to the next findable step, or shows a centered fallback card when
 *   nothing on the page matches (never a dead overlay).
 * - the target is scrolled into view and the tooltip repositions on
 *   scroll/resize; Esc closes, arrow keys navigate.
 */
export function TourTooltip() {
  const {
    isTourActive,
    currentTour,
    currentStepIndex,
    endTour,
    nextStep,
    prevStep,
    goToStep,
    setTourSeen,
    tourId,
  } = useTour()
  const tooltipRef = useRef<HTMLDivElement>(null)
  const highlightedRef = useRef<HTMLElement | null>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const [detached, setDetached] = useState(false)

  const clearHighlight = useCallback(() => {
    const el = highlightedRef.current
    if (el) {
      el.classList.remove('tour-highlight')
      el.style.boxShadow = el.dataset.tourOrigShadow ?? ''
      el.style.zIndex = el.dataset.tourOrigZ ?? ''
      el.style.position = el.dataset.tourOrigPos ?? ''
      delete el.dataset.tourOrigShadow
      delete el.dataset.tourOrigZ
      delete el.dataset.tourOrigPos
      highlightedRef.current = null
    }
  }, [])

  // Restore highlight when the tour ends or the component unmounts.
  useEffect(() => {
    if (!isTourActive) clearHighlight()
  }, [isTourActive, clearHighlight])
  useEffect(() => () => clearHighlight(), [clearHighlight])

  const placeNear = useCallback((target: HTMLElement) => {
    const tip = tooltipRef.current
    if (!tip) return
    const r = target.getBoundingClientRect()
    const tw = tip.offsetWidth || 320
    const th = tip.offsetHeight || 220
    let top = r.bottom + 12
    let left = r.left + r.width / 2 - tw / 2
    if (top + th > window.innerHeight - 12) {
      top = Math.max(12, r.top - th - 12)
    }
    if (left < 12) left = 12
    if (left + tw > window.innerWidth - 12) {
      left = Math.max(12, window.innerWidth - tw - 12)
    }
    setPos({ top, left })
  }, [])

  useEffect(() => {
    if (!isTourActive || !currentTour) return
    const step = currentTour[currentStepIndex]
    if (!step) {
      endTour()
      return
    }
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let tries = 0
    let detachResize: (() => void) | null = null

    const highlight = (el: HTMLElement) => {
      if (highlightedRef.current === el) return
      clearHighlight()
      el.dataset.tourOrigShadow = el.style.boxShadow
      el.dataset.tourOrigZ = el.style.zIndex
      el.dataset.tourOrigPos = el.style.position
      highlightedRef.current = el
      el.classList.add('tour-highlight')
      el.style.boxShadow =
        '0 0 0 4px rgba(34, 211, 238, 0.4), 0 0 20px rgba(34, 211, 238, 0.2)'
      if (window.getComputedStyle(el).position === 'static') {
        el.style.position = 'relative'
      }
      el.style.zIndex = '1000'
    }

    const tryFind = () => {
      if (cancelled) return
      const el = document.querySelector(step.target) as HTMLElement | null
      if (el) {
        setDetached(false)
        highlight(el)
        try {
          el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' })
        } catch {
          /* older browsers — tooltip still positions below */
        }
        // Place after scroll settles + tooltip has laid out.
        timer = setTimeout(() => {
          if (!cancelled) placeNear(el)
        }, 350)
        const onReposition = () => placeNear(el)
        window.addEventListener('scroll', onReposition, true)
        window.addEventListener('resize', onReposition)
        detachResize = () => {
          window.removeEventListener('scroll', onReposition, true)
          window.removeEventListener('resize', onReposition)
        }
        return
      }
      tries += 1
      if (tries < MAX_TARGET_RETRIES) {
        timer = setTimeout(tryFind, TARGET_RETRY_MS)
        return
      }
      // Target never appeared — jump to the next step that exists on this
      // page, or fall back to a centered card so the user isn't stranded.
      const nextIdx = currentTour.findIndex(
        (s, i) => i > currentStepIndex && document.querySelector(s.target),
      )
      if (nextIdx > -1) {
        goToStep(nextIdx)
      } else {
        setDetached(true)
        setPos(null)
      }
    }

    // Fresh step: drop the old highlight + position, then hunt the target.
    clearHighlight()
    setPos(null)
    setDetached(false)
    tryFind()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      if (detachResize) detachResize()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTourActive, currentTour, currentStepIndex])

  // Keyboard: Esc finishes, arrows navigate.
  useEffect(() => {
    if (!isTourActive || !currentTour) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setTourSeen(tourId ?? undefined)
        endTour()
      } else if (e.key === 'ArrowRight') {
        nextStep()
      } else if (e.key === 'ArrowLeft') {
        prevStep()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isTourActive, currentTour, endTour, nextStep, prevStep, setTourSeen, tourId])

  if (!isTourActive || !currentTour) return null

  const currentStep = currentTour[currentStepIndex]
  if (!currentStep) return null
  const isFirstStep = currentStepIndex === 0
  const isLastStep = currentStepIndex === currentTour.length - 1

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/50 z-[999]" onClick={endTour} />

      {/* Tour tooltip */}
      <div
        ref={tooltipRef}
        style={
          pos && !detached
            ? { position: 'fixed', top: pos.top, left: pos.left, zIndex: 1001 }
            : detached
              ? {
                  position: 'fixed',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  zIndex: 1001,
                }
              : { position: 'fixed', top: -9999, left: -9999, zIndex: 1001 }
        }
        className="bg-card border border-border rounded-lg shadow-2xl p-5 w-80 max-w-[90vw] animate-in fade-in slide-in-from-bottom-4 duration-200"
        role="dialog"
        aria-label={currentStep.title}
      >
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-sm text-foreground">{currentStep.title}</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setTourSeen(tourId ?? undefined)
                  endTour()
                }}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Skip tour
              </button>
              <button
                onClick={() => goToStep(0)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Restart
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
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent',
              )}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Back
            </button>

            {isLastStep ? (
              <button
                onClick={() => {
                  setTourSeen(tourId ?? undefined)
                  endTour()
                }}
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
