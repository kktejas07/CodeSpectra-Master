import { cn } from '@/lib/utils'

/** Shared header for public pages: condensed display title, lead text, optional actions and art. */
export function PageHero({
  title,
  lead,
  actions,
  art,
  className,
}: {
  title: React.ReactNode
  lead?: React.ReactNode
  actions?: React.ReactNode
  art?: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn('relative isolate overflow-hidden border-b border-cs-grid', className)}>
      <div
        aria-hidden
        className="absolute inset-0 -z-10 opacity-60 [mask-image:radial-gradient(60%_70%_at_75%_30%,#000_25%,transparent_75%)]"
        style={{ backgroundImage: 'radial-gradient(rgba(47,91,231,0.28) 1px, transparent 1px)', backgroundSize: '22px 22px' }}
      />
      <div aria-hidden className="absolute -top-32 right-[-10%] -z-10 h-[420px] w-[520px] rounded-full bg-[#2f5be7]/10 blur-3xl" />
      <div className={cn('mx-auto grid max-w-[1200px] items-center gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:px-8', art && 'lg:grid-cols-[1.25fr_0.75fr]')}>
        <div>
          <h1 className="cs-display max-w-[18ch] text-5xl sm:text-6xl lg:text-7xl">{title}</h1>
          {lead && <p className="mt-6 max-w-[58ch] text-lg leading-relaxed text-cs-ink-soft">{lead}</p>}
          {actions && <div className="mt-8 flex flex-col gap-3 sm:flex-row">{actions}</div>}
        </div>
        {art && <div className="hidden lg:block">{art}</div>}
      </div>
    </section>
  )
}

export const btnPrimary =
  'inline-flex h-12 items-center justify-center gap-2 rounded-full bg-cs-accent px-7 text-[15px] font-semibold text-cs-accent-ink shadow-lg shadow-[#2f5be7]/25 transition-[filter,box-shadow] hover:brightness-110 hover:shadow-[#2f5be7]/40'
export const btnSecondary =
  'inline-flex h-12 items-center justify-center gap-2 rounded-full border border-cs-ink/20 bg-cs-sheet px-7 text-[15px] font-semibold text-cs-ink transition-colors hover:border-cs-accent'
