'use client'

import { cn } from '@/lib/utils'

type DotPatternProps = {
  className?: string
}

/**
 * Visible drifting dot grid for footer / large surfaces.
 * Uses theme variables so dots stay visible in light and dark (not only currentColor).
 */
export function DotPattern({ className }: DotPatternProps) {
  const dotStyle = {
    backgroundImage:
      'radial-gradient(circle at center, hsl(var(--foreground) / 0.14) 1.25px, transparent 1.35px)',
    backgroundSize: '28px 28px',
  } as const

  const dotStyleFine = {
    backgroundImage:
      'radial-gradient(circle at center, hsl(var(--foreground) / 0.1) 1px, transparent 1.15px)',
    backgroundSize: '18px 18px',
  } as const

  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-0 z-0 overflow-hidden select-none',
        className
      )}
      aria-hidden
    >
      {/* Base grid — stays visible */}
      <div
        className="absolute inset-0 opacity-[0.85] dark:opacity-[0.75]"
        style={{
          ...dotStyle,
        }}
      />
      {/* Drifting layer */}
      <div
        className={cn('absolute -inset-full opacity-90 will-change-transform animate-dot-drift')}
        style={dotStyle}
      />
      <div
        className={cn('absolute -inset-full opacity-70 will-change-transform animate-dot-drift-reverse')}
        style={dotStyleFine}
      />
    </div>
  )
}
