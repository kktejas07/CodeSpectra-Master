import Link from 'next/link'
import { cn } from '@/lib/utils'
import { BentoAction, BentoBody, BentoCard, BentoIcon, BentoNumber, BentoText, BentoTitle, BentoWell, type BentoTone } from './card'
import { Sparkline } from './charts'
import { SkeletonBar } from './states'
import type { BentoLayout } from './grid'

/**
 * Ready-made card variants built from the parts in ./card. All server-safe;
 * client pages pass already-translated strings. Only real numbers go in —
 * callers show a skeleton (`loading`) or an empty message, never a guess.
 */

type Base = BentoLayout & { tone?: BentoTone; href?: string; label?: string; className?: string }

/* ── Stat: label, big number, delta pill, sparkline ─────────────────────── */
export function BentoStat({
  title,
  value,
  unit,
  delta,
  hint,
  series,
  seriesLabel,
  icon,
  action,
  loading,
  loadingLabel,
  empty,
  ...base
}: Base & {
  title: string
  value?: React.ReactNode
  unit?: React.ReactNode
  delta?: { text: string; tone?: 'up' | 'down' | 'flat' }
  hint?: React.ReactNode
  series?: number[]
  seriesLabel?: string
  icon?: React.ReactNode
  action?: string
  loading?: boolean
  loadingLabel?: string
  /** Shown instead of the number when there's nothing to count yet. */
  empty?: React.ReactNode
}) {
  return (
    <BentoCard {...base} aria-busy={loading || undefined}>
      <BentoBody className="pt-3">
        <div className="flex items-center gap-2.5">
          {icon && <BentoIcon>{icon}</BentoIcon>}
          <BentoTitle as="h3" className="text-[15px] font-medium text-muted-foreground group-data-[tone=brand]/bento:text-primary-foreground/85">
            {title}
          </BentoTitle>
          {delta && !loading && (
            <span
              className={cn(
                'ml-auto shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
                delta.tone === 'up' && 'bg-green-500/12 text-green-700 dark:text-green-400',
                delta.tone === 'down' && 'bg-red-500/10 text-red-700 dark:text-red-400',
                (!delta.tone || delta.tone === 'flat') && 'bg-muted text-muted-foreground',
              )}
            >
              {delta.text}
            </span>
          )}
        </div>
        {loading ? (
          <div className="mt-4 space-y-2">
            {loadingLabel && <span className="sr-only">{loadingLabel}</span>}
            <SkeletonBar className="h-11 w-24" />
            <SkeletonBar className="h-3 w-2/3" />
          </div>
        ) : empty && (value === undefined || value === null) ? (
          <div className="mt-3">{empty}</div>
        ) : (
          <>
            <BentoNumber value={value} unit={unit} className="mt-4" />
            {hint && <p className="mt-1.5 text-sm text-muted-foreground group-data-[tone=brand]/bento:text-primary-foreground/80">{hint}</p>}
          </>
        )}
        {!loading && series && series.length > 1 && <Sparkline data={series} label={seriesLabel} className="mt-auto pt-4 group-data-[tone=brand]/bento:text-primary-foreground" />}
        {action && <BentoAction>{action}</BentoAction>}
      </BentoBody>
    </BentoCard>
  )
}

/* ── Feature: visual in a well, icon + headline + short text, tags ─────── */
export function BentoFeature({
  title,
  text,
  icon,
  visual,
  wellClassName,
  tags,
  action,
  heading = 'h3',
  visualFirst = true,
  children,
  ...base
}: Base & {
  title: string
  text?: React.ReactNode
  icon?: React.ReactNode
  visual?: React.ReactNode
  wellClassName?: string
  tags?: string[]
  action?: string
  heading?: 'h2' | 'h3'
  /** Well above the text (default) or below it. */
  visualFirst?: boolean
  children?: React.ReactNode
}) {
  const well = visual ? <BentoWell className={cn('h-40 sm:h-44', wellClassName)}>{visual}</BentoWell> : null
  return (
    <BentoCard {...base}>
      {visualFirst && well}
      <BentoBody>
        <div className="flex items-start gap-3">
          {icon && <BentoIcon>{icon}</BentoIcon>}
          <div className="min-w-0">
            <BentoTitle as={heading}>{title}</BentoTitle>
            {text && <BentoText>{text}</BentoText>}
          </div>
        </div>
        {tags && tags.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <li key={t} className="rounded-full border border-border/80 bg-background/70 px-2.5 py-1 text-xs font-medium text-foreground group-data-[tone=brand]/bento:border-white/25 group-data-[tone=brand]/bento:bg-white/10 group-data-[tone=brand]/bento:text-primary-foreground">
                {t}
              </li>
            ))}
          </ul>
        )}
        {children}
        {action && <div className="mt-auto"><BentoAction>{action}</BentoAction></div>}
      </BentoBody>
      {!visualFirst && well}
    </BentoCard>
  )
}

/* ── List: titled rows (results, schedule, queue) with empty + loading ── */
export interface BentoListItem {
  key: string
  primary: React.ReactNode
  secondary?: React.ReactNode
  meta?: React.ReactNode
  href?: string
}

export function BentoList({
  title,
  icon,
  items,
  loading,
  loadingLabel,
  empty,
  more,
  ...base
}: Omit<Base, 'href'> & {
  title: string
  icon?: React.ReactNode
  items: BentoListItem[]
  loading?: boolean
  loadingLabel?: string
  empty?: React.ReactNode
  /** "See all" link in the header. */
  more?: { label: string; href: string }
}) {
  return (
    <BentoCard {...base} aria-busy={loading || undefined}>
      <BentoBody className="pt-3">
        <div className="flex items-center gap-2.5">
          {icon && <BentoIcon>{icon}</BentoIcon>}
          <BentoTitle>{title}</BentoTitle>
          {more && (
            <Link href={more.href} className="ml-auto shrink-0 rounded-md text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {more.label}
            </Link>
          )}
        </div>
        {loading ? (
          <div className="mt-4 space-y-3">
            {loadingLabel && <span className="sr-only">{loadingLabel}</span>}
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-1.5">
                <SkeletonBar className="h-3.5 w-3/4" />
                <SkeletonBar className="h-3 w-1/3" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="mt-3">{empty}</div>
        ) : (
          <ul className="mt-2 divide-y divide-border/70">
            {items.map((it) => {
              const row = (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{it.primary}</span>
                    {it.secondary && <span className="block truncate text-xs text-muted-foreground">{it.secondary}</span>}
                  </span>
                  {it.meta != null && <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{it.meta}</span>}
                </>
              )
              return (
                <li key={it.key}>
                  {it.href ? (
                    <Link href={it.href} className="-mx-2 flex min-h-11 items-center gap-3 rounded-xl px-2 py-2 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      {row}
                    </Link>
                  ) : (
                    <div className="flex min-h-11 items-center gap-3 py-2">{row}</div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </BentoBody>
    </BentoCard>
  )
}

/* ── Chart: title, headline figure, any chart from ./charts ──────────── */
export function BentoChart({
  title,
  icon,
  figure,
  caption,
  chart,
  loading,
  loadingLabel,
  empty,
  more,
  ...base
}: Omit<Base, 'href'> & {
  title: string
  icon?: React.ReactNode
  figure?: React.ReactNode
  caption?: React.ReactNode
  chart: React.ReactNode
  loading?: boolean
  loadingLabel?: string
  empty?: React.ReactNode
  more?: { label: string; href: string }
}) {
  return (
    <BentoCard {...base} aria-busy={loading || undefined}>
      <BentoBody className="pt-3">
        <div className="flex items-center gap-2.5">
          {icon && <BentoIcon>{icon}</BentoIcon>}
          <BentoTitle>{title}</BentoTitle>
          {more && (
            <Link href={more.href} className="ml-auto shrink-0 rounded-md text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {more.label}
            </Link>
          )}
        </div>
        {loading ? (
          <div className="mt-4 space-y-2">
            {loadingLabel && <span className="sr-only">{loadingLabel}</span>}
            <SkeletonBar className="h-24 w-full rounded-xl" />
          </div>
        ) : empty ? (
          <div className="mt-3">{empty}</div>
        ) : (
          <>
            {figure != null && <BentoNumber value={figure} className="mt-3" />}
            {caption && <p className="mt-1 text-sm text-muted-foreground">{caption}</p>}
            <div className="mt-4 min-w-0 flex-1">{chart}</div>
          </>
        )}
      </BentoBody>
    </BentoCard>
  )
}

/* ── CTA: brand surface, headline, one or two actions ─────────────────── */
export function BentoCta({
  title,
  text,
  primary,
  secondary,
  heading = 'h3',
  ...base
}: Omit<Base, 'href' | 'tone'> & {
  title: string
  text?: React.ReactNode
  primary: { label: string; href: string }
  secondary?: { label: string; href: string }
  heading?: 'h2' | 'h3'
}) {
  return (
    <BentoCard {...base} tone="brand">
      <BentoBody className="justify-between gap-4 pt-4">
        <div>
          <BentoTitle as={heading} className="text-2xl leading-tight">
            {title}
          </BentoTitle>
          {text && <BentoText className="text-[15px]">{text}</BentoText>}
        </div>
        <div className="flex flex-wrap gap-2">
          <BentoAction href={primary.href} className="mt-0">
            {primary.label}
          </BentoAction>
          {secondary && (
            <Link
              href={secondary.href}
              className="inline-flex min-h-9 items-center rounded-full px-3 text-sm font-medium text-primary-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground"
            >
              {secondary.label}
            </Link>
          )}
        </div>
      </BentoBody>
    </BentoCard>
  )
}

/* ── Proof: real platform numbers only (counts from code / the database) ─ */
export function BentoProof({
  title,
  items,
  note,
  ...base
}: Omit<Base, 'href'> & { title: string; items: Array<{ value: React.ReactNode; label: string }>; note?: string }) {
  return (
    <BentoCard {...base}>
      <BentoBody className="pt-3">
        <BentoTitle>{title}</BentoTitle>
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5">
          {items.map((it) => (
            <div key={it.label} className="min-w-0">
              <dt className="sr-only">{it.label}</dt>
              <dd>
                <span className="bento-num block text-4xl text-foreground">{it.value}</span>
                <span aria-hidden className="mt-1 block text-sm leading-snug text-muted-foreground">
                  {it.label}
                </span>
              </dd>
            </div>
          ))}
        </dl>
        {note && <p className="mt-auto pt-4 text-xs text-muted-foreground">{note}</p>}
      </BentoBody>
    </BentoCard>
  )
}

/* ── Media: a large illustration / screenshot with a caption ─────────── */
export function BentoMedia({
  title,
  text,
  media,
  wellClassName,
  action,
  ...base
}: Base & { title: string; text?: React.ReactNode; media: React.ReactNode; wellClassName?: string; action?: string }) {
  return (
    <BentoCard {...base}>
      <BentoWell className={cn('min-h-48 flex-1', wellClassName)}>{media}</BentoWell>
      <BentoBody className="flex-none">
        <BentoTitle>{title}</BentoTitle>
        {text && <BentoText>{text}</BentoText>}
        {action && <BentoAction>{action}</BentoAction>}
      </BentoBody>
    </BentoCard>
  )
}
