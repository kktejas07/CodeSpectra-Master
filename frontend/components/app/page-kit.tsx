import { cn } from '@/lib/utils'

/**
 * CodeSpectra app page kit — shared building blocks for every dashboard,
 * admin and candidate screen. Theme tokens only (bg-card, text-foreground,
 * text-muted-foreground, border-border, primary), so light and dark both work.
 *
 * Design rules: docs/design/app-style.md
 */

/** Page title row: optional icon tile, title, one-line description, actions on the right. */
export function PageHeader({
  title,
  description,
  icon,
  actions,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  icon?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <header className={cn('mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between', className)}>
      <div className="flex min-w-0 items-start gap-4">
        {icon && (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary [&_svg]:h-5 [&_svg]:w-5">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-balance text-foreground sm:text-[1.75rem]">{title}</h1>
          {description && <p className="mt-1 max-w-[70ch] text-[15px] leading-relaxed text-muted-foreground">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

/** Titled group of content inside a page. */
export function Section({
  title,
  description,
  actions,
  className,
  children,
}: {
  title?: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <section className={cn('space-y-4', className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            {title && <h2 className="text-lg font-semibold text-foreground">{title}</h2>}
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  )
}

/** Surface card in the bento style (24px radius, soft shadow, lift on hover when interactive). */
export function Panel({
  className,
  interactive,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      {...props}
      className={cn(
        'rounded-3xl border border-border/70 bg-card p-6 text-card-foreground shadow-[0_1px_2px_rgba(15,23,41,0.04),0_8px_24px_-14px_rgba(15,23,41,0.10)] dark:shadow-none',
        interactive &&
          'transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_18px_40px_-20px_rgba(47,91,231,0.35)] motion-reduce:hover:translate-y-0',
        className,
      )}
    >
      {children}
    </div>
  )
}

/** Metric tile: label, big number, optional hint and icon. */
export function StatCard({
  label,
  value,
  hint,
  icon,
  className,
}: {
  label: React.ReactNode
  value: React.ReactNode
  hint?: React.ReactNode
  icon?: React.ReactNode
  className?: string
}) {
  return (
    <Panel className={cn('flex items-center gap-4 p-5', className)}>
      {icon && (
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary [&_svg]:h-5 [&_svg]:w-5">
          {icon}
        </span>
      )}
      <div className="min-w-0">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold tabular-nums tracking-tight text-foreground">{value}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
    </Panel>
  )
}

/**
 * Bento grid with a staggered entrance (CSS-only, see .cs-stagger in globals.css).
 * Children can span with `sm:col-span-2`, `lg:row-span-2`, etc.
 */
export function BentoGrid({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('cs-stagger grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5', className)}>{children}</div>
}
