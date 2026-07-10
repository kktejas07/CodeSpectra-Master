'use client'

import { useEffect, useState } from 'react'

const LOAD_DURATION = 1800

export function LoadingScreen({ onDone }: { onDone: () => void }) {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    let raf = 0
    const start = performance.now()

    const tick = (now: number) => {
      const pct = Math.min((now - start) / LOAD_DURATION, 1)
      setProgress(pct)
      if (pct >= 1) {
        onDone()
        return
      }
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [onDone])

  const pct = Math.round(progress * 100)

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-zinc-950">
      {/* Subtle grid texture */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      {/* Radial accent */}
      <div className="pointer-events-none absolute -top-40 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-emerald-500/10 blur-3xl" />

      <div className="relative z-10 flex flex-col items-center gap-12">
        {/* Brand */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-3">
            <div className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-40" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500 shadow-[0_0_16px_rgba(52,211,153,0.4)]" />
            </div>
            <span className="bg-linear-to-r from-zinc-100 via-zinc-200 to-zinc-400 bg-clip-text text-2xl font-bold tracking-tight text-transparent sm:text-3xl">
              CodeSpectra
            </span>
          </div>
          <span className="font-mono text-[10px] tracking-[0.25em] text-zinc-600 sm:text-xs">
            MASTER CODE THROUGH AI
          </span>
        </div>

        {/* Progress */}
        <div className="flex w-56 flex-col items-center gap-2 sm:w-64">
          <div className="h-[2px] w-full overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full bg-linear-to-r from-zinc-500 via-emerald-400 to-emerald-300 transition-[width] duration-100 ease-linear"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="font-mono text-[11px] tabular-nums tracking-widest text-zinc-600">
            {pct < 100 ? `LOADING ${'·'.repeat(((pct / 20) | 0) + 1).padEnd(5, '·')} ${pct}%` : 'READY'}
          </span>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 px-6 py-5">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <span className="font-mono text-[9px] tracking-widest text-zinc-800 sm:text-[10px]">
            INITIALIZING
          </span>
          <span className="font-mono text-[9px] tracking-widest text-zinc-800 sm:text-[10px]">
            v2.0
          </span>
        </div>
      </div>
    </div>
  )
}
