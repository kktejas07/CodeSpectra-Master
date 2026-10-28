import { cn } from '@/lib/utils'

/**
 * Visual kit — shared decorative building blocks (royal blue identity).
 * Everything here is decorative: mark it aria-hidden or give the parent a
 * <figcaption>. All motion uses cs-bob / cs-ping-soft, which switch off for
 * prefers-reduced-motion (see globals.css).
 */

/** Royal-blue gradient stage with dot grid, glow blobs, rings and a faint </> glyph. */
export function GradientStage({
  className,
  rings = true,
  glyph = true,
  children,
}: {
  className?: string
  rings?: boolean
  glyph?: boolean
  children?: React.ReactNode
}) {
  return (
    <div className={cn('relative isolate rounded-[2.5rem] bg-linear-to-br from-[#2f5be7] via-[#3f6bff] to-[#1b2f8f]', className)}>
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-[inherit]">
        <div
          className="absolute inset-0 opacity-30"
          style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.35) 1px, transparent 1px)', backgroundSize: '18px 18px' }}
        />
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#8fb0ff]/40 blur-3xl" />
        <div className="absolute -bottom-28 -left-16 h-72 w-72 rounded-full bg-[#0d1b5c]/60 blur-3xl" />
        {rings && (
          <svg className="absolute left-1/2 top-1/2 h-[140%] w-[140%] -translate-x-1/2 -translate-y-1/2 text-white/15" viewBox="0 0 400 400" fill="none">
            <circle cx="200" cy="200" r="120" stroke="currentColor" />
            <circle cx="200" cy="200" r="170" stroke="currentColor" strokeDasharray="4 8" />
          </svg>
        )}
        {glyph && <span className="absolute left-8 top-8 font-mono text-5xl font-bold text-white/10">{'</>'}</span>}
      </div>
      {children}
    </div>
  )
}

/** Soft tinted backdrop for app surfaces (works in light and dark). */
export function SoftGlow({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn('pointer-events-none absolute inset-0 -z-10 overflow-hidden', className)}>
      <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-primary/15 blur-3xl" />
      <div className="absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
      <div
        className="absolute inset-0 opacity-40 [mask-image:radial-gradient(70%_70%_at_80%_20%,#000_20%,transparent_75%)] dark:opacity-25"
        style={{ backgroundImage: 'radial-gradient(hsl(var(--primary) / 0.35) 1px, transparent 1px)', backgroundSize: '20px 20px' }}
      />
    </div>
  )
}
