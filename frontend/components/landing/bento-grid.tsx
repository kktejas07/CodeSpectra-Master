'use client'

import Link from 'next/link'
import { useEffect, useRef } from 'react'
import { Cog, ClipboardCheck, Download, FileStack, GitCompare, Layers, ScanFace, Trophy, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ThemeIllustration } from '@/components/landing/theme-illustration'

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
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={v.photo} alt={v.alt} width={v.w ?? 800} height={v.h ?? 600} loading="lazy" decoding="async" className={cn('h-full w-full object-contain', className)} />
    )
  }
  return v.svg ? <ThemeIllustration name={v.svg} alt={v.alt} width={v.w ?? 480} height={v.h ?? 360} className={className} /> : null
}

function Card({
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

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-5 flex h-10 w-10 items-center justify-center rounded-xl border border-cs-accent/25 bg-cs-accent/10 text-cs-accent-text">
      {children}
    </span>
  )
}

function Title({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xl font-bold tracking-tight text-cs-ink">{children}</h3>
}

function Body({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn('mt-2 max-w-[46ch] text-[15px] leading-relaxed text-cs-ink-soft', className)}>{children}</p>
}

const ROLES = ['Java', 'Python', 'JavaScript', 'SQL', 'QA automation', 'Mechanical CAD', 'Drawing review', 'Aptitude', 'Written answers']

export function BentoGrid() {
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
    <div ref={gridRef} className="cs-bento-grid grid auto-rows-[minmax(220px,auto)] grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
      {/* A — 2×2: any role */}
      <Card className="sm:col-span-2 lg:row-span-2">
        <Icon><Layers className="h-5 w-5" aria-hidden /></Icon>
        <Title>Assess any role, not only developers</Title>
        <Body>
          Coding with hidden test cases, CAD design tasks, test-automation scripts, written answers and aptitude,
          in one assessment and one score.
        </Body>
        {/* sliding role chips */}
        <div className="relative mt-6 overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)]">
          <div className="cs-marquee flex w-max gap-2">
            {[...ROLES, ...ROLES].map((r, i) => (
              <span key={i} aria-hidden={i >= ROLES.length} className="whitespace-nowrap rounded-full border border-cs-grid bg-cs-paper px-3.5 py-1.5 text-sm font-medium text-cs-ink">
                {r}
              </span>
            ))}
          </div>
        </div>
        <div className="mt-auto pt-6">
          <div className="aspect-[4/3] max-h-[300px] w-full overflow-hidden rounded-2xl bg-linear-to-br from-cs-accent/8 to-transparent">
            <BentoVisual v={{ photo: PHOTOS.code, svg: 'binary-brackets', alt: 'Code brackets filled with streaming binary digits', w: 360, h: 240 }} className="mx-auto h-full" />
          </div>
        </div>
      </Card>

      {/* B — 2×1: proctoring */}
      <Card className="sm:col-span-2">
        <div className="grid h-full gap-6 sm:grid-cols-[1.1fr_1fr] sm:items-center">
          <div>
            <Icon><ScanFace className="h-5 w-5" aria-hidden /></Icon>
            <Title>Proctoring that leaves a record</Title>
            <Body>Every event is timestamped on the candidate’s report, so a reviewer decides what it means.</Body>
            <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Checks during the test">
              {['Fullscreen lock', 'Tab switches', 'Face match', 'Copy-paste', 'Second screen'].map((c) => (
                <li key={c} className="rounded-md bg-cs-accent/10 px-2 py-1 text-xs font-semibold text-cs-accent-text">{c}</li>
              ))}
            </ul>
          </div>
          <div className="aspect-[4/3] w-full">
            <BentoVisual v={{ photo: PHOTOS.proctor, svg: 'integrity-shield', alt: 'Proctoring radar logging events', w: 300, h: 220 }} className="h-full" />
          </div>
        </div>
      </Card>

      {/* C — 1×1: weighted points */}
      <Card>
        <Icon><ClipboardCheck className="h-5 w-5" aria-hidden /></Icon>
        <Title>Weighted by difficulty</Title>
        <div className="mt-auto flex items-end gap-3 pt-4" aria-label="Easy 3 points, medium 4 points, hard 5 points">
          {[
            ['Easy', 3, 'h-10'],
            ['Medium', 4, 'h-14'],
            ['Hard', 5, 'h-[4.5rem]'],
          ].map(([lab, pts, h]) => (
            <div key={lab as string} className="flex flex-1 flex-col items-center gap-1.5">
              <span className="cs-display text-3xl text-cs-ink">{pts}</span>
              <span className={cn('cs-grow-y w-full origin-bottom rounded-lg bg-linear-to-t from-cs-accent to-cs-teal', h as string)} />
              <span className="text-xs font-medium text-cs-ink-soft">{lab}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* D — 1×1: CAD */}
      <Card>
        <Icon><Cog className="h-5 w-5" aria-hidden /></Icon>
        <Title>CAD design tasks</Title>
        <Body className="text-sm">Model a valve or pump part, then review drawings.</Body>
        <div className="mt-auto h-36 w-full pt-3">
          <BentoVisual v={{ photo: PHOTOS.cad, svg: 'domain-cad', alt: 'CAD model of a valve with a turning handwheel', w: 96, h: 96 }} className="mx-auto h-full max-h-32" />
        </div>
      </Card>

      {/* E — 2×1: ranked shortlist */}
      <Card className="sm:col-span-2">
        <div className="grid h-full gap-6 sm:grid-cols-[1fr_1.1fr] sm:items-center">
          <div>
            <Icon><Trophy className="h-5 w-5" aria-hidden /></Icon>
            <Title>A ranked shortlist, not a pile of PDFs</Title>
            <Body>Everyone is scored the same way. Review the top 20 of 100 and skip the rest.</Body>
          </div>
          <div className="space-y-2" aria-label="Sample shortlist">
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
      </Card>

      {/* F — 1×1: plagiarism */}
      <Card>
        <Icon><GitCompare className="h-5 w-5" aria-hidden /></Icon>
        <Title>Plagiarism check</Title>
        <Body className="text-sm">Code answers are compared across everyone who took the test.</Body>
        <div className="mt-auto flex items-center gap-2 pt-4 font-mono text-xs" aria-hidden>
          <span className="rounded-md bg-cs-paper px-2 py-1 text-cs-ink-soft">#14</span>
          <span className="h-px flex-1 bg-cs-flag/50" />
          <span className="rounded-full bg-cs-flag/12 px-2 py-1 font-semibold text-cs-flag">92% match</span>
          <span className="h-px flex-1 bg-cs-flag/50" />
          <span className="rounded-md bg-cs-paper px-2 py-1 text-cs-ink-soft">#31</span>
        </div>
      </Card>

      {/* G — 1×1: export */}
      <Card>
        <Icon><Download className="h-5 w-5" aria-hidden /></Icon>
        <Title>Release or export</Title>
        <Body className="text-sm">Publish scores to candidates, or download the results as CSV.</Body>
        <div className="mt-auto flex gap-2 pt-4" aria-hidden>
          <span className="rounded-lg border border-cs-grid px-3 py-1.5 text-xs font-semibold text-cs-ink">Export CSV</span>
          <span className="rounded-lg bg-cs-accent px-3 py-1.5 text-xs font-semibold text-cs-accent-ink">Release results</span>
        </div>
      </Card>

      {/* H — 3×1: hackathons */}
      <Card className="sm:col-span-2 lg:col-span-3" href="/hackathons" label="Run hackathons — see upcoming hackathons">
        <div className="grid h-full gap-6 md:grid-cols-[1fr_1.2fr] md:items-center">
          <div>
            <Icon><Users className="h-5 w-5" aria-hidden /></Icon>
            <Title>Run hackathons on the same platform</Title>
            <Body>Teams of up to five join with one link and submit a repository. Judges score every entry out of 100 on one rubric.</Body>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-cs-accent-text group-hover:underline">See upcoming hackathons</span>
          </div>
          <div className="aspect-[2/1] w-full">
            <BentoVisual v={{ photo: PHOTOS.team, svg: 'hackathon-team', alt: 'A team of five submits a repository that judges score out of 100', w: 420, h: 210 }} className="h-full" />
          </div>
        </div>
      </Card>

      {/* I — 1×1: question bank */}
      <Card>
        <Icon><FileStack className="h-5 w-5" aria-hidden /></Icon>
        <Title>Editable question bank</Title>
        <Body className="text-sm">Start from a generated set, then change any question before it goes out.</Body>
        <div className="mt-auto space-y-1.5 pt-4" aria-hidden>
          {['Hard', 'Medium', 'Easy'].map((l, i) => (
            <div key={l} className="cs-slide-in flex items-center justify-between rounded-lg border border-cs-grid bg-cs-paper px-3 py-1.5 text-xs" style={{ ['--gd' as string]: `${i * 120}ms` }}>
              <span className="h-1.5 w-16 rounded-full bg-cs-ink-soft/30" />
              <span className="font-semibold text-cs-accent-text">{l}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
