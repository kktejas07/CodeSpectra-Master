'use client'

import { useRef } from 'react'

/**
 * Arcade-style footer wordmark: a giant gradient "CodeSpectra" lockup
 * with a cursor-tracking spotlight (--mx / --my) plus codespectra.ai.
 */
export function FooterWordmark() {
  const ref = useRef<HTMLDivElement>(null)

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    el.style.setProperty('--mx', `${((e.clientX - rect.left) / rect.width) * 100}%`)
    el.style.setProperty('--my', `${((e.clientY - rect.top) / rect.height) * 100}%`)
  }

  return (
    <div
      ref={ref}
      onPointerMove={onPointerMove}
      className="pointer-events-auto relative select-none pt-14 lg:pt-20"
    >
      {/* Giant gradient wordmark — base fill + cursor spotlight */}
      <p
        aria-hidden
        className="bg-clip-text text-center font-black leading-none tracking-tight text-transparent"
        style={{
          fontSize: 'clamp(3.25rem, 12.5vw, 12rem)',
          backgroundImage:
            'radial-gradient(circle at var(--mx, 50%) var(--my, 120%), hsl(var(--primary) / 0.95) 0%, transparent 42%), linear-gradient(180deg, hsl(var(--primary) / 0.75) 0%, hsl(var(--primary) / 0.32) 55%, hsl(var(--primary) / 0.06) 100%)',
          backgroundSize: '100% 100%, 100% 100%',
        }}
      >
        CodeSpectra
      </p>
    </div>
  )
}
