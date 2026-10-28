'use client'

import { useEffect, useRef, useState } from 'react'

const LOAD_DURATION = 400

/**
 * Hard-load splash. Theme background, </> tile logo, royal-blue progress bar.
 * The rAF-driven bar is functional progress; the decorative pulse ring uses
 * cs-ping-soft, which globals.css turns off for prefers-reduced-motion.
 */
export function LoadingScreen({ onDone }: { onDone: () => void }) {
  const [progress, setProgress] = useState(0)
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  useEffect(() => {
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const pct = Math.min((now - start) / LOAD_DURATION, 1)
      setProgress(pct)
      if (pct >= 1) {
        onDoneRef.current()
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const pct = Math.round(progress * 100)

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background text-foreground"
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-3xl" />
      </div>

      <div className="relative flex flex-col items-center gap-6 px-6">
        <div className="relative flex items-center gap-3">
          <span className="relative flex h-11 w-11 items-center justify-center">
            <span aria-hidden className="cs-ping-soft absolute inset-0 rounded-xl bg-[#2f5be7]/25" />
            <span className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-[#2f5be7]/45 bg-[#2f5be7]/12 dark:border-[#5b84ff]/45 dark:bg-[#2f5be7]/20">
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5 text-[#2f5be7] dark:text-[#8aa8ff]"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M8 7L3 12L8 17" />
                <path d="M16 7L21 12L16 17" />
                <path d="M14 4.5L10 19.5" />
              </svg>
            </span>
          </span>
          <span className="text-xl font-bold tracking-tight">CodeSpectra</span>
        </div>

        <div className="w-56">
          <div
            className="h-1 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label="Loading CodeSpectra"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
          >
            <div
              className="h-full rounded-full bg-linear-to-r from-[#2f5be7] to-[#5b84ff]"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-3 text-center text-sm text-muted-foreground">Loading…</p>
        </div>
      </div>
    </div>
  )
}
