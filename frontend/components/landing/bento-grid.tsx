'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useRef } from 'react'
import { Cog, ClipboardCheck, Download, FileStack, GitCompare, Layers, ScanFace, Trophy, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ThemeIllustration } from '@/components/landing/theme-illustration'
import { useT } from '@/lib/i18n/client'

/**
 * Landing "bento" grid (UI/UX Pro Max: Bento Box Grid).
 * - 4 → 2 → 1 columns, varied spans (2×2, 2×1, 1×1), 24px radius, soft shadow
 * - Reveal: cards fade/scale in, staggered outward from the grid centre
 * - Hover: 1.02 lift + cursor-tracked spotlight; all motion off under reduced motion
 *
 * Visual slots: `photo` (a PNG in /public/images/landing) when present,
 * otherwise the theme-aware animated SVG. Slots keep a fixed aspect ratio so
 * swapping art never shifts layout.
 */

type Visual = { photo?: string; svg?: string; alt: string; w?: number; h?: number }

// Magnific renders go here once added to /public/images/landing/ (see README note in PR).
const PHOTOS: Partial<Record<'code' | 'cad' | 'proctor' | 'podium' | 'team', string>> = {}

function BentoVisual({ v, className }: { v: Visual; className?: string }) {
  if (v.photo) {
    // Local renders in /public/images/landing → optimised (AVIF/WebP, srcset) by next/image.
    return (
      <Image src={v.photo} alt={v.alt} width={v.w ?? 800} height={v.h ?? 600} sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" className={cn('h-full w-full object-contain', className)} />
    )
  }
  return v.svg ? <ThemeIllustration name={v.svg} alt={v.alt} width={v.w ?? 480} height={v.h ?? 360} className={className} /> : null
}

export function BentoCard({
  className,
  children,
  href,
  label,
}: {
  className?: string
  children: React.ReactNode
  href?: string
  label?: string
}) {
  const ref = useRef<HTMLElement>(null)
  const onMove = (e: React.PointerEvent) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    el.style.setProperty('--sx', `${e.clientX - r.left}px`)
    el.style.setProperty('--sy', `${e.clientY - r.top}px`)
  }
  const body = (
    <>
      {/* cursor spotlight */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: 'radial-gradient(420px circle at var(--sx, 50%) var(--sy, 50%), rgba(47,91,231,0.10), transparent 60%)' }}
      />
      <div className="relative flex h-full flex-col">{children}</div>
    </>
  )
  const cls = cn(
    'cs-bento group relative overflow-hidden rounded-3xl border border-cs-grid bg-cs-sheet p-6 shadow-[0_1px_2px_rgba(15,23,41,0.04),0_8px_24px_-12px_rgba(15,23,41,0.10)] transition-[transform,box-shadow,border-color] duration-300 ease-out hover:-translate-y-0.5 hover:scale-[1.02] hover:border-cs-accent/40 hover:shadow-[0_18px_40px_-18px_rgba(47,91,231,0.35)] motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:hover:translate-y-0 sm:p-7',
    className,
  )
  if (href)
    return (
      <Link ref={ref as React.Ref<HTMLAnchorElement>} href={href} aria-label={label} onPointerMove={onMove} className={cls}>
        {body}
      </Link>
    )
  return (
    <article ref={ref as React.Ref<HTMLElement>} onPointerMove={onMove} className={cls}>
      {body}
    </article>
  )
}

export function BentoIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-5 flex h-10 w-10 items-center justify-center rounded-xl border border-cs-accent/25 bg-cs-accent/10 text-cs-accent-text">
      {children}
    </span>
  )
}

export function BentoTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xl font-bold tracking-tight text-cs-ink">{children}</h3>
}

export function BentoBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn('mt-2 max-w-[46ch] text-[15px] leading-relaxed text-cs-ink-soft', className)}>{children}</p>
}

// Tech names stay in English in every language; the rest come from the `public` catalog.
const ROLES = ['Java', 'Python', 'JavaScript', 'SQL', 'public.bentoRoleQa', 'public.bentoRoleCad', 'public.bentoRoleDrawing', 'public.bentoRoleAptitude', 'public.bentoRoleWritten']

/** Grid wrapper that runs the centre-out stagger reveal for every BentoCard inside it. */
export function BentoShell({ className, children }: { className?: string; children: React.ReactNode }) {
  const gridRef = useRef<HTMLDivElement>(null)
  // Reveal: stagger outward from the centre of the grid, once, when it scrolls into view.
  useEffect(() => {
    const grid = gridRef.current
    if (!grid) return
    const cards = Array.from(grid.querySelectorAll<HTMLElement>('.cs-bento'))
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      cards.forEach((c) => c.classList.add('is-in'))
      return
    }
    // only hide cards once JS is running, so content is never invisible without it
    grid.classList.add('reveal-ready')
    const g = grid.getBoundingClientRect()
    const cx = g.left + g.width / 2
    const cy = g.top + g.height / 2
    cards.forEach((c) => {
      const r = c.getBoundingClientRect()
      const d = Math.hypot(r.left + r.width / 2 - cx, r.top + r.height / 2 - cy)
      c.style.setProperty('--d', `${Math.round(d / 6)}ms`)
    })
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          cards.forEach((c) => c.classList.add('is-in'))
          io.disconnect()
        }
      },
      { threshold: 0.15 },
    )
    io.observe(grid)
    return () => io.disconnect()
  }, [])

  return (
    <div ref={gridRef} className={cn('cs-bento-grid grid auto-rows-[minmax(200px,auto)] grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5', className)}>
      {children}
    </div>
  )
}

export function BentoGrid() {
  const { t, td } = useT()
  const roles = ROLES.map((r) => (r.startsWith('public.') ? td(r, r) : r))
  return (
    <BentoShell className="auto-rows-[minmax(220px,auto)]">
      {/* A — 2×2: any role */}
      <BentoCard className="sm:col-span-2 lg:row-span-2">
        <BentoIcon><Layers className="h-5 w-5" aria-hidden /></BentoIcon>
        <BentoTitle>{t('public.bentoAnyRoleTitle')}</BentoTitle>
        <BentoBody>{t('public.bentoAnyRoleBody')}</BentoBody>
        {/* sliding role chips */}
        <div className="relative mt-6 overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)]">
          <div className="cs-marquee flex w-max gap-2">
            {[...roles, ...roles].map((r, i) => (
              <span key={i} aria-hidden={i >= roles.length} className="whitespace-nowrap rounded-full border border-cs-grid bg-cs-paper px-3.5 py-1.5 text-sm font-medium text-cs-ink">
                {r}
              </span>
            ))}
          </div>
        </div>
        <div className="mt-auto pt-6">
          <div className="aspect-[4/3] max-h-[300px] w-full overflow-hidden rounded-2xl bg-linear-to-br from-cs-accent/8 to-transparent">
            <BentoVisual v={{ photo: PHOTOS.code, svg: 'binary-brackets', alt: t('public.bentoAltCode'), w: 360, h: 240 }} className="mx-auto h-full" />
          </div>
        </div>
      </BentoCard>

      {/* B — 2×1: proctoring */}
      <BentoCard className="sm:col-span-2">
        <div className="grid h-full gap-6 sm:grid-cols-[1.1fr_1fr] sm:items-center">
          <div>
            <BentoIcon><ScanFace className="h-5 w-5" aria-hidden /></BentoIcon>
            <BentoTitle>{t('public.bentoProctorTitle')}</BentoTitle>
            <BentoBody>{t('public.bentoProctorBody')}</BentoBody>
            <ul className="mt-4 flex flex-wrap gap-1.5" aria-label={t('public.bentoChecksLabel')}>
              {[t('public.bentoCheckFullscreen'), t('public.bentoCheckTabs'), t('public.bentoCheckFace'), t('public.bentoCheckPaste'), t('public.bentoCheckScreen')].map((c) => (
                <li key={c} className="rounded-md bg-cs-accent/10 px-2 py-1 text-xs font-semibold text-cs-accent-text">{c}</li>
              ))}
            </ul>
          </div>
          <div className="aspect-[4/3] w-full">
            <BentoVisual v={{ photo: PHOTOS.proctor, svg: 'integrity-shield', alt: t('public.bentoAltProctor'), w: 300, h: 220 }} className="h-full" />
          </div>
        </div>
      </BentoCard>

      {/* C — 1×1: weighted points */}
      <BentoCard>
        <BentoIcon><ClipboardCheck className="h-5 w-5" aria-hidden /></BentoIcon>
        <BentoTitle>{t('public.bentoWeightedTitle')}</BentoTitle>
        <div className="mt-auto flex items-end gap-3 pt-4" aria-label={t('public.bentoWeightedLabel')}>
          {[
            [t('public.easy'), 3, 'h-10'],
            [t('public.medium'), 4, 'h-14'],
            [t('public.hard'), 5, 'h-[4.5rem]'],
          ].map(([lab, pts, h]) => (
            <div key={lab as string} className="flex flex-1 flex-col items-center gap-1.5">
              <span className="cs-display text-3xl text-cs-ink">{pts}</span>
              <span className={cn('cs-grow-y w-full origin-bottom rounded-lg bg-linear-to-t from-cs-accent to-cs-teal', h as string)} />
              <span className="text-xs font-medium text-cs-ink-soft">{lab}</span>
            </div>
          ))}
        </div>
      </BentoCard>

      {/* D — 1×1: CAD */}
      <BentoCard>
        <BentoIcon><Cog className="h-5 w-5" aria-hidden /></BentoIcon>
        <BentoTitle>{t('public.bentoCadTitle')}</BentoTitle>
        <BentoBody className="text-sm">{t('public.bentoCadBody')}</BentoBody>
        <div className="mt-auto h-36 w-full pt-3">
          <BentoVisual v={{ photo: PHOTOS.cad, svg: 'domain-cad', alt: t('public.bentoAltCad'), w: 96, h: 96 }} className="mx-auto h-full max-h-32" />
        </div>
      </BentoCard>

      {/* E — 2×1: ranked shortlist */}
      <BentoCard className="sm:col-span-2">
        <div className="grid h-full gap-6 sm:grid-cols-[1fr_1.1fr] sm:items-center">
          <div>
            <BentoIcon><Trophy className="h-5 w-5" aria-hidden /></BentoIcon>
            <BentoTitle>{t('public.bentoShortlistTitle')}</BentoTitle>
            <BentoBody>{t('public.bentoShortlistBody')}</BentoBody>
          </div>
          <div className="space-y-2" aria-label={t('public.bentoSampleShortlist')}>
            {[
              ['Ananya Rao', 112],
              ['Kiran Patel', 108],
              ['Marcus Thompson', 104],
              ['Meera Joshi', 101],
            ].map(([n, p], i) => (
              <div key={n as string} className="flex items-center gap-3 text-sm">
                <span className="w-4 text-right font-mono text-cs-ink-soft">{i + 1}</span>
                <span className="w-32 truncate font-medium text-cs-ink">{n}</span>
                <span className="block h-2 flex-1 overflow-hidden rounded-full bg-cs-grid">
                  <span className="cs-grow-x block h-full origin-left rounded-full bg-linear-to-r from-cs-accent to-cs-teal" style={{ width: `${((p as number) / 120) * 100}%`, ['--gd' as string]: `${i * 90}ms` }} />
                </span>
                <span className="w-9 text-right font-mono font-semibold text-cs-ink">{p}</span>
              </div>
            ))}
          </div>
        </div>
      </BentoCard>

      {/* F — 1×1: plagiarism */}
      <BentoCard>
        <BentoIcon><GitCompare className="h-5 w-5" aria-hidden /></BentoIcon>
        <BentoTitle>{t('public.bentoPlagiarismTitle')}</BentoTitle>
        <BentoBody className="text-sm">{t('public.bentoPlagiarismBody')}</BentoBody>
        <div className="mt-auto flex items-center gap-2 pt-4 font-mono text-xs" aria-hidden>
          <span className="rounded-md bg-cs-paper px-2 py-1 text-cs-ink-soft">#14</span>
          <span className="h-px flex-1 bg-cs-flag/50" />
          <span className="rounded-full bg-cs-flag/12 px-2 py-1 font-semibold text-cs-flag">{t('public.bentoMatch', { pct: '92%' })}</span>
          <span className="h-px flex-1 bg-cs-flag/50" />
          <span className="rounded-md bg-cs-paper px-2 py-1 text-cs-ink-soft">#31</span>
        </div>
      </BentoCard>

      {/* G — 1×1: export */}
      <BentoCard>
        <BentoIcon><Download className="h-5 w-5" aria-hidden /></BentoIcon>
        <BentoTitle>{t('public.bentoReleaseTitle')}</BentoTitle>
        <BentoBody className="text-sm">{t('public.bentoReleaseBody')}</BentoBody>
        <div className="mt-auto flex gap-2 pt-4" aria-hidden>
          <span className="rounded-lg border border-cs-grid px-3 py-1.5 text-xs font-semibold text-cs-ink">{t('public.bentoExportCsv')}</span>
          <span className="rounded-lg bg-cs-accent px-3 py-1.5 text-xs font-semibold text-cs-accent-ink">{t('public.bentoReleaseResults')}</span>
        </div>
      </BentoCard>

      {/* H — 3×1: hackathons */}
      <BentoCard className="sm:col-span-2 lg:col-span-3" href="/hackathons" label={t('public.bentoHackathonLabel')}>
        <div className="grid h-full gap-6 md:grid-cols-[1fr_1.2fr] md:items-center">
          <div>
            <BentoIcon><Users className="h-5 w-5" aria-hidden /></BentoIcon>
            <BentoTitle>{t('public.bentoHackathonTitle')}</BentoTitle>
            <BentoBody>{t('public.bentoHackathonBody')}</BentoBody>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-cs-accent-text group-hover:underline">{t('public.bentoHackathonCta')}</span>
          </div>
          <div className="aspect-[2/1] w-full">
            <BentoVisual v={{ photo: PHOTOS.team, svg: 'hackathon-team', alt: t('public.bentoAltTeam'), w: 420, h: 210 }} className="h-full" />
          </div>
        </div>
      </BentoCard>

      {/* I — 1×1: question bank */}
      <BentoCard>
        <BentoIcon><FileStack className="h-5 w-5" aria-hidden /></BentoIcon>
        <BentoTitle>{t('public.bentoBankTitle')}</BentoTitle>
        <BentoBody className="text-sm">{t('public.bentoBankBody')}</BentoBody>
        <div className="mt-auto space-y-1.5 pt-4" aria-hidden>
          {[t('public.hard'), t('public.medium'), t('public.easy')].map((l, i) => (
            <div key={l} className="cs-slide-in flex items-center justify-between rounded-lg border border-cs-grid bg-cs-paper px-3 py-1.5 text-xs" style={{ ['--gd' as string]: `${i * 120}ms` }}>
              <span className="h-1.5 w-16 rounded-full bg-cs-ink-soft/30" />
              <span className="font-semibold text-cs-accent-text">{l}</span>
            </div>
          ))}
        </div>
      </BentoCard>
    </BentoShell>
  )
}
