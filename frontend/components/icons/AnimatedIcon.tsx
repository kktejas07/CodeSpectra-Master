'use client'

/**
 * Animated Material icon ("Animated icons by Sadjad", see /credits and
 * LICENSE-THIRD-PARTY.md). Only the icons in animated-icon-manifest.ts exist.
 *
 * - Before the player loads, without JS and under prefers-reduced-motion it
 *   shows the still frame (an SVG used as a CSS mask over currentColor), at
 *   the same box size — no layout shift.
 * - The player (lottie-web *light*: SVG renderer, no expressions → no eval,
 *   so the strict CSP holds) and the icon JSON are fetched only when the icon
 *   scrolls into view (on idle) or is hovered/focused, via dynamic import —
 *   lottie never lands in the root/shared client chunk
 *   (tests/animated-icon.test.tsx guards this).
 * - Plays on hover/focus of the nearest interactive ancestor, when `trigger`
 *   changes, when `name` changes (state swaps like menu → close) and once on
 *   load with `autoplay`.
 * - Decorative (aria-hidden) unless `label` is given.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { ANIMATED_ICONS, type AnimatedIconName } from './animated-icon-manifest'
import styles from './animated-icon.module.css'

export type { AnimatedIconName }

type LottiePlayer = typeof import('lottie-web/build/player/lottie_light').default
type LottieAnim = ReturnType<LottiePlayer['loadAnimation']>

export type AnimatedIconProps = {
  name: AnimatedIconName
  /** Box size in px (default 16 = h-4 w-4). */
  size?: number
  className?: string
  /** Accessible name; omit for decorative icons next to visible text. */
  label?: string
  /** Any value: the icon plays whenever it changes (not on first render). */
  trigger?: unknown
  /** Play once as soon as it has loaded (e.g. a success toast check). */
  autoplay?: boolean
  /** Play on hover/focus of the closest button/link (default true). */
  hover?: boolean
}

let playerPromise: Promise<LottiePlayer> | null = null
const dataCache = new Map<string, Promise<string>>()

function loadPlayer(): Promise<LottiePlayer> {
  // ponytail: one shared lazy chunk for the whole app; cached by the browser.
  playerPromise ??= import('lottie-web/build/player/lottie_light').then((m) => m.default)
  return playerPromise
}

function loadData(url: string): Promise<string> {
  let p = dataCache.get(url)
  if (!p) {
    p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`animated icon ${r.status}`)
      return r.text()
    })
    p.catch(() => dataCache.delete(url))
    dataCache.set(url, p)
  }
  return p
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false
}

const INTERACTIVE = 'button, a, summary, label, [role="button"], [role="menuitem"], [role="switch"], [role="tab"]'

export function AnimatedIcon({ name, size = 16, className, label, trigger, autoplay, hover = true }: AnimatedIconProps) {
  const icon = ANIMATED_ICONS[name]
  const hostRef = useRef<HTMLSpanElement>(null)
  const stageRef = useRef<HTMLSpanElement>(null)
  const animRef = useRef<LottieAnim | null>(null)
  const loadingRef = useRef<Promise<LottieAnim | null> | null>(null)
  const playOnLoadRef = useRef(Boolean(autoplay))
  const [ready, setReady] = useState(false)

  const restFrame = useCallback((anim: LottieAnim) => (icon.rest === 'last' ? Math.max(0, anim.totalFrames - 1) : 0), [icon.rest])

  const play = useCallback(() => {
    const anim = animRef.current
    if (!anim || prefersReducedMotion()) return
    anim.goToAndPlay(0, true)
  }, [])

  const ensure = useCallback((): Promise<LottieAnim | null> => {
    if (prefersReducedMotion()) return Promise.resolve(null)
    if (animRef.current) return Promise.resolve(animRef.current)
    if (loadingRef.current) return loadingRef.current
    const json = icon.json
    loadingRef.current = Promise.all([loadPlayer(), loadData(json)])
      .then(([lottie, text]) => {
        const stage = stageRef.current
        // Unmounted or the name changed while loading.
        if (!stage || ANIMATED_ICONS[name].json !== json) return null
        stage.replaceChildren()
        const anim = lottie.loadAnimation({
          container: stage,
          renderer: 'svg',
          loop: false,
          autoplay: false,
          // lottie mutates its input: parse a fresh copy per instance.
          animationData: JSON.parse(text),
          rendererSettings: { progressiveLoad: false, preserveAspectRatio: 'xMidYMid meet' },
        })
        anim.addEventListener('complete', () => anim.goToAndStop(restFrame(anim), true))
        anim.goToAndStop(restFrame(anim), true)
        animRef.current = anim
        setReady(true)
        if (playOnLoadRef.current) {
          playOnLoadRef.current = false
          play()
        }
        return anim
      })
      .catch(() => {
        // Network/parse failure: keep the still frame, allow a later retry.
        loadingRef.current = null
        return null
      })
    return loadingRef.current
  }, [icon.json, name, play, restFrame])

  // Name swap (menu → close, download → download-done): rebuild, and play
  // the new one if this wasn't the first render.
  const firstNameRef = useRef(true)
  useEffect(() => {
    if (firstNameRef.current) {
      firstNameRef.current = false
    } else {
      playOnLoadRef.current = true
    }
    return () => {
      animRef.current?.destroy()
      animRef.current = null
      loadingRef.current = null
      setReady(false)
    }
  }, [name])

  // Load when visible (idle), or right away after a name swap.
  useEffect(() => {
    const host = hostRef.current
    if (!host || prefersReducedMotion()) return
    if (playOnLoadRef.current && !autoplay) {
      void ensure()
      return
    }
    let idle: number | undefined
    const schedule = () => {
      const w = window as Window & { requestIdleCallback?: (cb: () => void) => number }
      idle = w.requestIdleCallback ? w.requestIdleCallback(() => void ensure()) : window.setTimeout(() => void ensure(), 200)
    }
    if (typeof IntersectionObserver === 'undefined') {
      schedule()
      return () => {
        if (idle !== undefined) window.clearTimeout(idle)
      }
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect()
        schedule()
      }
    }, { rootMargin: '64px' })
    io.observe(host)
    return () => {
      io.disconnect()
      const w = window as Window & { cancelIdleCallback?: (id: number) => void }
      if (idle !== undefined) (w.cancelIdleCallback ?? window.clearTimeout)(idle)
    }
  }, [ensure, autoplay])

  // Hover / keyboard focus on the control that holds the icon.
  useEffect(() => {
    const host = hostRef.current
    if (!host || !hover) return
    const target = (host.closest(INTERACTIVE) as HTMLElement | null) ?? host.parentElement ?? host
    const onEnter = () => {
      if (prefersReducedMotion()) return
      if (animRef.current) play()
      else {
        playOnLoadRef.current = true
        void ensure()
      }
    }
    target.addEventListener('pointerenter', onEnter)
    target.addEventListener('focusin', onEnter)
    return () => {
      target.removeEventListener('pointerenter', onEnter)
      target.removeEventListener('focusin', onEnter)
    }
  }, [ensure, hover, play])

  // External trigger.
  const firstTriggerRef = useRef(true)
  useEffect(() => {
    if (firstTriggerRef.current) {
      firstTriggerRef.current = false
      return
    }
    if (animRef.current) play()
    else {
      playOnLoadRef.current = true
      void ensure()
    }
  }, [trigger, ensure, play])

  const mask = `url("${icon.still}")`
  return (
    <span
      ref={hostRef}
      className={cn(styles.root, className)}
      style={{ width: size, height: size }}
      data-ready={ready ? '' : undefined}
      data-animated-icon={name}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      <span className={styles.still} style={{ maskImage: mask, WebkitMaskImage: mask }} />
      <span ref={stageRef} className={styles.stage} />
    </span>
  )
}

export default AnimatedIcon
