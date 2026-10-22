import { cn } from '@/lib/utils'

/**
 * Tiny, dependency-free charts for bento cards (pure SVG / CSS, server-safe).
 * They inherit `currentColor`, so `text-primary` (or white on a brand card)
 * sets the colour in both themes. Give them an `label` to expose a summary to
 * screen readers; without one they are decorative.
 */

function a11y(label?: string) {
  return label ? { role: 'img' as const, 'aria-label': label } : { 'aria-hidden': true as const }
}

/** Line + soft area. Needs ≥ 2 points; flat series draw a mid line. */
export function Sparkline({ data, label, className, area = true }: { data: number[]; label?: string; className?: string; area?: boolean }) {
  const pts = data.filter((n) => Number.isFinite(n))
  // Nothing to show: too few points, or an all-zero series (a flat line at 0 reads as data).
  if (pts.length < 2 || pts.every((n) => n === 0)) return null
  const W = 120
  const H = 36
  const pad = 3
  const min = Math.min(...pts)
  const max = Math.max(...pts)
  const span = max - min || 1
  const xy = pts.map((v, i) => [(i / (pts.length - 1)) * W, max === min ? H / 2 : pad + (1 - (v - min) / span) * (H - pad * 2)] as const)
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const last = xy[xy.length - 1]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={cn('h-10 w-full overflow-visible text-primary', className)} {...a11y(label)}>
      {area && <path d={`${line} L${W},${H} L0,${H} Z`} fill="currentColor" opacity={0.12} />}
      <path d={line} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={last[0]} cy={last[1]} r={2.5} fill="currentColor" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/** Vertical columns; the last (current) one is solid, the rest tinted. */
export function MiniBars({ data, label, className, highlightLast = true }: { data: number[]; label?: string; className?: string; highlightLast?: boolean }) {
  if (!data.length || data.every((n) => n === 0)) return null
  const max = Math.max(...data, 1)
  return (
    <div className={cn('flex h-14 items-end gap-1 text-primary', className)} {...a11y(label)}>
      {data.map((v, i) => (
        <span
          key={i}
          className={cn('min-w-0 flex-1 rounded-[3px] bg-current', highlightLast && i === data.length - 1 ? 'opacity-100' : 'opacity-30')}
          style={{ height: `${Math.max(6, (v / max) * 100)}%` }}
        />
      ))}
    </div>
  )
}

/** Labelled horizontal bars (department / stage / category breakdowns). */
export function BarRows({
  rows,
  max,
  format = (n) => String(n),
  className,
}: {
  rows: Array<{ label: string; value: number; hint?: string }>
  max?: number
  format?: (n: number) => string
  className?: string
}) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value))
  return (
    <ul className={cn('space-y-2.5', className)}>
      {rows.map((r) => (
        <li key={r.label} className="min-w-0">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-foreground">{r.label}</span>
            <span className="shrink-0 tabular-nums font-medium text-foreground">{format(r.value)}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (r.value / top) * 100)}%` }} />
          </div>
          {r.hint && <p className="mt-0.5 text-xs text-muted-foreground">{r.hint}</p>}
        </li>
      ))}
    </ul>
  )
}

/** Ring meter 0–100 with the value in the middle. */
export function Meter({ value, label, size = 88, className, children }: { value: number; label?: string; size?: number; className?: string; children?: React.ReactNode }) {
  const v = Math.max(0, Math.min(100, value))
  const r = 15.9155 // circumference 100
  return (
    <div className={cn('relative shrink-0 text-primary', className)} style={{ width: size, height: size }} {...a11y(label)}>
      <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
        <circle cx="18" cy="18" r={r} fill="none" stroke="currentColor" strokeOpacity={0.15} strokeWidth={3.2} />
        <circle cx="18" cy="18" r={r} fill="none" stroke="currentColor" strokeWidth={3.2} strokeLinecap="round" strokeDasharray={`${v} ${100 - v}`} />
      </svg>
      {children != null && <div className="absolute inset-0 grid place-items-center text-foreground">{children}</div>}
    </div>
  )
}
