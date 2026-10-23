import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { spanClass, type BentoLayout } from './grid'

/**
 * Bento card shell and its parts. Anatomy (outside → in):
 *   card (28px radius, 8px padding) → well (20px radius: concentric, dot-grid
 *   stage for the visual) → body (icon, title, text, tags, action pill).
 * Server-safe (no hooks). Hover only changes colour and nudges the well's
 * content; nothing moves under prefers-reduced-motion.
 */

export type BentoTone = 'plain' | 'tint' | 'brand'

export interface BentoCardProps extends BentoLayout {
  tone?: BentoTone
  /** Whole card becomes one link (one tab stop). */
  href?: string
  /** Accessible name for a linked card when its visible text isn't enough. */
  label?: string
  className?: string
  children: React.ReactNode
  /** Element for an unlinked card. */
  as?: 'article' | 'section' | 'div' | 'li'
  'aria-busy'?: boolean
}

const TONE: Record<BentoTone, string> = {
  plain: 'border-border/70 bg-card text-card-foreground shadow-[0_1px_2px_rgba(15,23,41,0.04),0_12px_32px_-20px_rgba(15,23,41,0.22)] dark:shadow-none',
  tint: 'border-primary/20 bg-primary/[0.05] text-card-foreground dark:bg-primary/[0.08]',
  brand: 'border-transparent bg-primary text-primary-foreground shadow-[0_18px_40px_-22px_rgba(47,91,231,0.65)] dark:shadow-none',
}

export function BentoCard({ tone = 'plain', href, label, className, children, as = 'article', span, smSpan, rows, ...rest }: BentoCardProps) {
  const cls = cn(
    'group/bento relative flex min-w-0 flex-col overflow-hidden rounded-[28px] border p-2 transition-colors duration-200',
    TONE[tone],
    href && tone !== 'brand' && 'hover:border-primary/45',
    href && tone === 'brand' && 'hover:brightness-110',
    href && 'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    spanClass({ span, smSpan, rows }),
    className,
  )
  if (href) {
    return (
      <Link href={href} aria-label={label} className={cls} data-tone={tone} {...rest}>
        {children}
      </Link>
    )
  }
  const Tag = as
  return (
    <Tag className={cls} data-tone={tone} {...rest}>
      {children}
    </Tag>
  )
}

/** The inset stage for a card's visual. Give it a height (e.g. `h-40`) or let content size it. */
export function BentoWell({ className, children, decorative = true }: { className?: string; children: React.ReactNode; decorative?: boolean }) {
  return (
    <div
      aria-hidden={decorative || undefined}
      className={cn(
        'bento-well relative overflow-hidden rounded-[20px] group-data-[tone=brand]/bento:bg-white/10 group-data-[tone=brand]/bento:bg-none group-data-[tone=brand]/bento:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)]',
        className,
      )}
    >
      <div className="relative h-full w-full transition-transform duration-300 ease-out motion-safe:group-hover/bento:-translate-y-1">{children}</div>
    </div>
  )
}

/** Text area under (or without) the well. `grow` pushes the action to the bottom. */
export function BentoBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('flex min-w-0 flex-1 flex-col px-3 pb-3 pt-4 sm:px-4 sm:pb-4', className)}>{children}</div>
}

export function BentoIcon({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary [&_svg]:h-[18px] [&_svg]:w-[18px]',
        'group-data-[tone=brand]/bento:bg-white/15 group-data-[tone=brand]/bento:text-primary-foreground',
        className,
      )}
    >
      {children}
    </span>
  )
}

export function BentoTitle({ children, as: Tag = 'h3', className }: { children: React.ReactNode; as?: 'h2' | 'h3' | 'h4' | 'p'; className?: string }) {
  return <Tag className={cn('text-[17px] font-semibold leading-snug tracking-tight text-balance wrap-break-word', className)}>{children}</Tag>
}

export function BentoText({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn('mt-1.5 max-w-[52ch] text-sm leading-relaxed text-muted-foreground group-data-[tone=brand]/bento:text-primary-foreground/85', className)}>{children}</p>
  )
}

/** Small label: muted by default, `accent` for status, `live` for green. */
export function BentoPill({ children, tone = 'muted', className }: { children: React.ReactNode; tone?: 'muted' | 'accent' | 'live' | 'warn'; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 truncate rounded-full px-2.5 py-1 text-xs font-medium',
        tone === 'muted' && 'border border-border/80 bg-background/70 text-foreground',
        tone === 'accent' && 'bg-primary/10 text-primary',
        tone === 'live' && 'bg-green-500/12 text-green-700 dark:text-green-400',
        tone === 'warn' && 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
        className,
      )}
    >
      {children}
    </span>
  )
}

/**
 * The pill-and-circle action. Inside a linked card render it as a plain span
 * (the card is the link); pass `href` only on an unlinked card.
 */
export function BentoAction({ children, href, className }: { children: React.ReactNode; href?: string; className?: string }) {
  const inner = (
    <>
      <span className="min-w-0 truncate">{children}</span>
      <span
        aria-hidden
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-transform duration-200 motion-safe:group-hover/bento:rotate-45 group-data-[tone=brand]/bento:bg-primary-foreground group-data-[tone=brand]/bento:text-primary"
      >
        <ArrowUpRight className="h-4 w-4" />
      </span>
    </>
  )
  const cls = cn(
    'mt-4 inline-flex max-w-full items-center gap-2 self-start rounded-full border border-border bg-background/70 py-1 pl-4 pr-1 text-sm font-medium text-foreground',
    'group-data-[tone=brand]/bento:border-white/25 group-data-[tone=brand]/bento:bg-white/10 group-data-[tone=brand]/bento:text-primary-foreground',
    className,
  )
  if (href) {
    return (
      <Link href={href} className={cn(cls, 'outline-none focus-visible:ring-2 focus-visible:ring-ring')}>
        {inner}
      </Link>
    )
  }
  return <span className={cls}>{inner}</span>
}

/** Big number with an optional unit. */
export function BentoNumber({ value, unit, className }: { value: React.ReactNode; unit?: React.ReactNode; className?: string }) {
  return (
    <p className={cn('flex items-baseline gap-1.5', className)}>
      <span className="bento-num text-5xl sm:text-[3.5rem]">{value}</span>
      {unit != null && <span className="text-sm font-medium text-muted-foreground group-data-[tone=brand]/bento:text-primary-foreground/80">{unit}</span>}
    </p>
  )
}
