import { cn } from '@/lib/utils'

/**
 * Royal-blue gradient banner for the top of key app screens (dashboard home,
 * section landings). Text is white on #2f5be7→#1b2f8f (contrast ≥ 5.5:1).
 * `art` sits on the right on wide screens (e.g. a few <BannerChip>s or a small vector).
 */
export function AppBanner({
  eyebrow,
  title,
  description,
  actions,
  art,
  className,
}: {
  eyebrow?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  art?: React.ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        'relative isolate overflow-hidden rounded-3xl bg-linear-to-br from-[#2f5be7] via-[#3557e0] to-[#1b2f8f] p-6 text-white shadow-[0_24px_50px_-28px_rgba(47,91,231,0.65)] sm:p-8',
        className,
      )}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="absolute inset-0 opacity-25 [mask-image:linear-gradient(90deg,transparent,#000_60%)]"
          style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.4) 1px, transparent 1px)', backgroundSize: '18px 18px' }}
        />
        <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-[#8fb0ff]/35 blur-3xl" />
        <svg className="absolute -right-10 top-1/2 h-[220%] -translate-y-1/2 text-white/10" viewBox="0 0 200 200" fill="none">
          <circle cx="100" cy="100" r="60" stroke="currentColor" />
          <circle cx="100" cy="100" r="90" stroke="currentColor" strokeDasharray="3 6" />
        </svg>
        <span className="absolute bottom-3 right-6 font-mono text-6xl font-bold text-white/[0.07]">{'</>'}</span>
      </div>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 max-w-[62ch]">
          {eyebrow && <p className="text-sm font-semibold text-white/80">{eyebrow}</p>}
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-balance sm:text-3xl">{title}</h1>
          {description && <p className="mt-2 text-[15px] leading-relaxed text-white/85">{description}</p>}
          {actions && <div className="mt-5 flex flex-wrap gap-2.5">{actions}</div>}
        </div>
        {art && <div aria-hidden className="hidden shrink-0 lg:block">{art}</div>}
      </div>
    </section>
  )
}

/** White pill chip for banner art: icon + label. */
export function BannerChip({ icon, label, sub, className, delay = '0s' }: { icon: React.ReactNode; label: string; sub?: string; className?: string; delay?: string }) {
  return (
    <div
      className={cn('cs-bob flex items-center gap-2.5 rounded-2xl bg-white/95 px-3 py-2 text-[#0f1729] shadow-[0_14px_30px_-16px_rgba(5,12,40,0.6)]', className)}
      style={{ ['--d' as string]: delay }}
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#eef2ff] text-[#2f5be7] [&_svg]:h-4 [&_svg]:w-4">{icon}</span>
      <div>
        <p className="text-[12px] font-bold">{label}</p>
        {sub && <p className="text-[11px] text-[#5b6478]">{sub}</p>}
      </div>
    </div>
  )
}

/** Buttons for use on the banner. */
export const bannerBtnPrimary =
  'inline-flex h-10 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-[#1e40af] shadow-sm transition-[filter] hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white'
export const bannerBtnSecondary =
  'inline-flex h-10 items-center gap-2 rounded-full border border-white/40 px-5 text-sm font-semibold text-white transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white'
