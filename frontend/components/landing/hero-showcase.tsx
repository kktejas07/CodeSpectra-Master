'use client'

import Link from 'next/link'
import { useCallback, useEffect, useId, useState } from 'react'
import { Check, Pause, Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n/client'
import type { MessageKey } from '@/lib/i18n/catalog'

/**
 * White + mint hero in light, obsidian hero in dark: the headline role word
 * slides through the roles CodeSpectra assesses, beside an auto-advancing
 * slideshow of animated product screens (SVG files in
 * /public/illustrations/codespectra, `-light` / `-dark` pairs swapped with
 * the theme like ThemeIllustration).
 *
 * Auto-advance pauses on hover/focus, has a visible pause control, and is
 * off entirely for people who prefer reduced motion.
 */

// Copy lives in the `public` catalog (lib/i18n/messages/*/public.json): heroRole*, heroSlide<Id>*.
const ROLES = ['heroRoleDevelopers', 'heroRoleDesignEngineers', 'heroRoleQa', 'heroRoleGraduates'] as const

const SLIDES = [
  { id: 'build', key: 'Build' },
  { id: 'proctor', key: 'Proctor' },
  { id: 'results', key: 'Rank' },
  { id: 'hackathon', key: 'Judge' },
] as const
type SlideField = 'Tab' | 'Title' | 'Body' | 'Alt'
const slideKey = (s: (typeof SLIDES)[number], f: SlideField) => `public.heroSlide${s.key}${f}` as MessageKey

const SLIDE_MS = 6500
const ROLE_MS = 2600

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return reduced
}

export function HeroShowcase({ primaryHref, secondaryHref, secondaryLabel }: { primaryHref: string; secondaryHref: string; secondaryLabel: string }) {
  const reduced = usePrefersReducedMotion()
  const { t: tx, locale } = useT()
  const [role, setRole] = useState(0)
  const [slide, setSlide] = useState(0)
  const [paused, setPaused] = useState(false) // user pressed pause
  const [hovering, setHovering] = useState(false) // pointer/focus inside the slideshow
  const baseId = useId()
  const running = !reduced && !paused && !hovering

  // Sliding role word
  useEffect(() => {
    if (reduced) return
    const t = setInterval(() => setRole((r) => (r + 1) % ROLES.length), ROLE_MS)
    return () => clearInterval(t)
  }, [reduced])

  // Slideshow
  useEffect(() => {
    if (!running) return
    const t = setTimeout(() => setSlide((s) => (s + 1) % SLIDES.length), SLIDE_MS)
    return () => clearTimeout(t)
  }, [running, slide])

  const go = useCallback((i: number) => setSlide((i + SLIDES.length) % SLIDES.length), [])

  const onTabKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') go(slide + 1)
    else if (e.key === 'ArrowLeft') go(slide - 1)
    else return
    e.preventDefault()
    requestAnimationFrame(() => document.getElementById(`${baseId}-tab-${(slide + (e.key === 'ArrowRight' ? 1 : -1) + SLIDES.length) % SLIDES.length}`)?.focus())
  }

  const current = SLIDES[slide]

  return (
    <section className="relative isolate overflow-hidden border-b border-cs-grid bg-white text-cs-ink dark:bg-cs-paper">
      {/* Background: dot field + two soft glows (dimmed in dark so the obsidian stays deep) */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 opacity-60 [mask-image:radial-gradient(70%_60%_at_70%_40%,#000_30%,transparent_80%)] dark:opacity-40"
        style={{ backgroundImage: 'radial-gradient(rgba(47,91,231,0.30) 1px, transparent 1px)', backgroundSize: '22px 22px' }}
      />
      <div aria-hidden className="absolute -top-40 right-[-10%] -z-10 h-[520px] w-[620px] rounded-full bg-[#2f5be7]/14 blur-3xl dark:bg-[#2f5be7]/25" />
      <div aria-hidden className="absolute bottom-[-30%] left-[-10%] -z-10 h-[420px] w-[520px] rounded-full bg-[#38bdf8]/12 blur-3xl dark:bg-[#38bdf8]/18" />

      <div className="mx-auto grid max-w-[1200px] items-center gap-12 px-4 pt-14 pb-16 sm:px-6 sm:pt-20 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14 lg:px-8 lg:pb-24">
        {/* Copy */}
        <div>
          <h1 className="cs-display text-[3rem] sm:text-7xl lg:text-[4.6rem]">
            <span className="sr-only">{tx('public.heroSr')}</span>
            {tx('public.heroPrefix') && <span aria-hidden className="block">{tx('public.heroPrefix')}</span>}
            {/* Indic scripts need room for vowel signs above and below the line. */}
            <span aria-hidden className={cn('relative block overflow-hidden', locale === 'en' ? 'h-[1.08em]' : 'h-[1.3em]')}>
              {ROLES.map((r, i) => (
                <span
                  key={r}
                  className={cn(
                    'absolute inset-x-0 top-0 block whitespace-nowrap transition-all duration-500 ease-[cubic-bezier(.2,.7,.2,1)]',
                    i === role ? 'translate-y-0 opacity-100' : i === (role - 1 + ROLES.length) % ROLES.length ? '-translate-y-full opacity-0' : 'translate-y-full opacity-0',
                  )}
                >
                  <span className="relative inline-block">
                    {tx(`public.${r}`)}
                    {/* underline draws in each time the word changes */}
                    {i === role && <span key={`u-${role}`} className="cs-underline absolute inset-x-0 bottom-[0.02em] h-[0.09em] origin-left rounded-full bg-[#2f5be7]" />}
                  </span>
                </span>
              ))}
            </span>
            <span aria-hidden className="block">{tx('public.heroSuffix')}</span>
          </h1>

          <p className="mt-7 max-w-[50ch] text-lg leading-relaxed text-cs-ink-soft">{tx('public.heroLead')}</p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link
              href={primaryHref}
              className="inline-flex h-12 items-center justify-center rounded-full bg-[#2f5be7] px-7 text-[15px] font-bold text-white shadow-lg shadow-[#2f5be7]/25 transition-[filter,box-shadow] hover:shadow-[#2f5be7]/40 hover:brightness-110"
            >
              {tx('public.bookPilot')}
            </Link>
            <Link
              href={secondaryHref}
              className="inline-flex h-12 items-center justify-center rounded-full border border-slate-300 bg-white px-7 text-[15px] font-semibold text-cs-ink transition-colors hover:border-[#2f5be7] dark:border-cs-grid dark:bg-cs-sheet"
            >
              {secondaryLabel}
            </Link>
          </div>

          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[15px] text-cs-ink-soft">
            {[tx('public.heroCheckProctored'), tx('public.heroCheckAutoScored'), tx('public.heroCheckAnyRole')].map((x) => (
              <li key={x} className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#2f5be7]/12">
                  <Check className="h-3.5 w-3.5 text-[#1e40af] dark:text-[#8aa8ff]" strokeWidth={3} aria-hidden />
                </span>
                {x}
              </li>
            ))}
          </ul>
        </div>

        {/* Product slideshow */}
        <div
          role="region"
          aria-roledescription="carousel"
          aria-label={tx('public.heroCarousel')}
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
          onFocusCapture={() => setHovering(true)}
          onBlurCapture={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setHovering(false)
          }}
        >
          <div className="relative">
            {/* floating visor mascot for depth */}
            {/* eslint-disable-next-line @next/next/no-img-element -- animated SVG */}
            <img
              src="/illustrations/codespectra/hero-visor.svg"
              alt=""
              aria-hidden
              width={240}
              height={200}
              className="cs-float pointer-events-none absolute -top-14 -left-14 z-10 hidden w-28 drop-shadow-xl sm:block"
            />

            <div className="relative aspect-[584/440] w-full">
              {SLIDES.map((s, i) => (
                <div
                  key={s.id}
                  id={`${baseId}-panel-${i}`}
                  role="tabpanel"
                  aria-roledescription="slide"
                  aria-labelledby={`${baseId}-tab-${i}`}
                  aria-hidden={i !== slide}
                  className={cn(
                    'absolute inset-0 transition-all duration-700 ease-[cubic-bezier(.2,.7,.2,1)]',
                    i === slide ? 'translate-x-0 scale-100 opacity-100' : 'pointer-events-none translate-x-6 scale-[0.98] opacity-0',
                  )}
                >
                  {/* key forces the SVG animation to restart each time the slide becomes active.
                      Light/dark pair swaps with the theme (display:none keeps the hidden one out of the a11y tree). */}
                  {/* eslint-disable-next-line @next/next/no-img-element -- animated SVGs must not go through the image optimizer */}
                  <img
                    key={i === slide ? `${s.id}-light-on-${slide}` : `${s.id}-light`}
                    src={`/illustrations/codespectra/hero-screen-${s.id}.svg`}
                    alt={tx(slideKey(s, 'Alt'))}
                    width={584}
                    height={440}
                    loading={i === 0 ? 'eager' : 'lazy'}
                    fetchPriority={i === 0 ? 'high' : 'low'}
                    decoding="async"
                    className="h-full w-full dark:hidden"
                  />
                  {/* eslint-disable-next-line @next/next/no-img-element -- animated SVGs must not go through the image optimizer */}
                  <img
                    key={i === slide ? `${s.id}-dark-on-${slide}` : `${s.id}-dark`}
                    src={`/illustrations/codespectra/hero-screen-${s.id}-dark.svg`}
                    alt={tx(slideKey(s, 'Alt'))}
                    width={584}
                    height={440}
                    loading={i === 0 ? 'eager' : 'lazy'}
                    fetchPriority={i === 0 ? 'high' : 'low'}
                    decoding="async"
                    className="hidden h-full w-full dark:block"
                  />
                </div>
              ))}
            </div>
          </div>

          <div aria-live={running ? 'off' : 'polite'} className="mt-5 min-h-[3.5rem] px-1">
            <p className="text-lg font-semibold">{tx(slideKey(current, 'Title'))}</p>
            <p className="mt-0.5 text-cs-ink-soft">{tx(slideKey(current, 'Body'))}</p>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <div role="tablist" aria-label={tx('public.heroChooseStep')} className="grid flex-1 grid-cols-4 gap-2" onKeyDown={onTabKey}>
              {SLIDES.map((s, i) => {
                const active = i === slide
                return (
                  <button
                    key={s.id}
                    id={`${baseId}-tab-${i}`}
                    role="tab"
                    type="button"
                    aria-selected={active}
                    aria-controls={`${baseId}-panel-${i}`}
                    tabIndex={active ? 0 : -1}
                    onClick={() => go(i)}
                    className="group text-left"
                  >
                    <span className="block h-1 overflow-hidden rounded-full bg-slate-200 dark:bg-cs-grid">
                      <span
                        key={active ? `p-${slide}-${running}` : 'idle'}
                        className={cn(
                          'block h-full origin-left rounded-full bg-[#2f5be7]',
                          active ? (running ? 'cs-progress' : 'scale-x-100') : 'scale-x-0',
                        )}
                        style={active && running ? { animationDuration: `${SLIDE_MS}ms` } : undefined}
                      />
                    </span>
                    <span className={cn('mt-2 block text-sm font-semibold transition-colors', active ? 'text-cs-ink' : 'text-cs-ink-soft group-hover:text-cs-ink')}>
                      {tx(slideKey(s, 'Tab'))}
                    </span>
                  </button>
                )
              })}
            </div>
            {!reduced && (
              <button
                type="button"
                onClick={() => setPaused((p) => !p)}
                aria-label={paused ? tx('public.heroPlay') : tx('public.heroPause')}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-cs-ink hover:border-[#2f5be7] dark:border-cs-grid dark:bg-cs-sheet"
              >
                {paused ? <Play className="h-4 w-4" aria-hidden /> : <Pause className="h-4 w-4" aria-hidden />}
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
