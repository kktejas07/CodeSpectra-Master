import { cn } from '@/lib/utils'

/**
 * Bento grid: 1 column on phones, 2 on tablets, 4 or 6 on desktop.
 * Cards choose their own footprint with `span` (desktop columns), `smSpan`
 * (tablet columns) and `rows` (desktop rows) — see BentoCard.
 * Server component, no client JS.
 */
export function BentoGrid({
  cols = 4,
  dense = true,
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & {
  cols?: 4 | 6
  /** Back-fill holes left by tall/wide cards (grid-auto-flow: dense). */
  dense?: boolean
}) {
  return (
    <div
      {...rest}
      className={cn(
        'grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4',
        cols === 6 ? 'lg:grid-cols-6' : 'lg:grid-cols-4',
        dense && 'grid-flow-row-dense',
        className,
      )}
    >
      {children}
    </div>
  )
}

export type BentoSpan = 1 | 2 | 3 | 4 | 5 | 6

const LG: Record<BentoSpan, string> = {
  1: 'lg:col-span-1',
  2: 'lg:col-span-2',
  3: 'lg:col-span-3',
  4: 'lg:col-span-4',
  5: 'lg:col-span-5',
  6: 'lg:col-span-6',
}
const SM: Record<1 | 2, string> = { 1: 'sm:col-span-1', 2: 'sm:col-span-2' }
const ROWS: Record<1 | 2 | 3, string> = { 1: '', 2: 'lg:row-span-2', 3: 'lg:row-span-3' }

/** Footprint props shared by every card. */
export interface BentoLayout {
  /** Desktop columns (of 4 or 6). Default 1. */
  span?: BentoSpan
  /** Tablet columns (of 2). Default: 2 when span ≥ 3, else 1. */
  smSpan?: 1 | 2
  /** Desktop rows. Default 1. */
  rows?: 1 | 2 | 3
}

export function spanClass({ span = 1, smSpan, rows = 1 }: BentoLayout): string {
  const sm = smSpan ?? (span >= 3 ? 2 : 1)
  return cn(SM[sm], LG[span], ROWS[rows])
}
