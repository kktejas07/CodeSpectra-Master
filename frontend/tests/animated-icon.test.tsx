/**
 * Animated icons (components/icons/AnimatedIcon.tsx):
 * - still-frame fallback, no player under prefers-reduced-motion;
 * - the Lottie player is only reachable through a dynamic import (never in
 *   the root/shared client chunk) and is the eval-free light build (CSP);
 * - only licensed icons that are listed (and attributed) ship in public/.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, waitFor } from '@testing-library/react'
import fs from 'node:fs'
import path from 'node:path'

const loadAnimation = vi.fn()
vi.mock('lottie-web/build/player/lottie_light', () => ({
  default: {
    loadAnimation: (opts: unknown) => {
      loadAnimation(opts)
      return {
        totalFrames: 30,
        addEventListener: vi.fn(),
        goToAndStop: vi.fn(),
        goToAndPlay: vi.fn(),
        destroy: vi.fn(),
      }
    },
  },
}))

import { AnimatedIcon } from '@/components/icons/AnimatedIcon'
import { ANIMATED_ICONS } from '@/components/icons/animated-icon-manifest'

const ROOT = path.resolve(__dirname, '..')

function setReducedMotion(reduce: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduce && query.includes('reduce'),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia
}

describe('AnimatedIcon', () => {
  const realFetch = globalThis.fetch
  beforeEach(() => {
    loadAnimation.mockClear()
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, text: async () => '{"v":"5","fr":30,"ip":0,"op":30,"w":128,"h":128,"layers":[]}' }) as unknown as typeof fetch
  })
  afterEach(() => {
    globalThis.fetch = realFetch
    setReducedMotion(false)
  })

  it('renders the still frame, decorative, sized, without loading the player under reduced motion', async () => {
    setReducedMotion(true)
    const { container } = render(
      <button type="button">
        <AnimatedIcon name="menu" size={20} />
      </button>,
    )
    const host = container.querySelector('[data-animated-icon="menu"]') as HTMLElement
    expect(host).toBeTruthy()
    expect(host.getAttribute('aria-hidden')).toBe('true')
    expect(host.style.width).toBe('20px')
    expect(host.style.height).toBe('20px')
    const still = host.firstElementChild as HTMLElement
    expect(still.getAttribute('style')).toContain(ANIMATED_ICONS.menu.still)
    fireEvent.pointerEnter(container.querySelector('button')!)
    fireEvent.focusIn(container.querySelector('button')!)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 250))
    })
    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(loadAnimation).not.toHaveBeenCalled()
    expect(host.hasAttribute('data-ready')).toBe(false)
  })

  it('exposes a label as an image when given one', () => {
    setReducedMotion(true)
    const { getByRole } = render(<AnimatedIcon name="check-circle" label="Saved" />)
    expect(getByRole('img', { name: 'Saved' })).toBeTruthy()
  })

  it('lazy-loads the light SVG player and swaps the still for it', async () => {
    setReducedMotion(false)
    const { container } = render(<AnimatedIcon name="bolt" />)
    const host = container.querySelector('[data-animated-icon="bolt"]') as HTMLElement
    await waitFor(() => expect(host.hasAttribute('data-ready')).toBe(true))
    expect(globalThis.fetch).toHaveBeenCalledWith(ANIMATED_ICONS.bolt.json)
    expect(loadAnimation).toHaveBeenCalledTimes(1)
    expect(loadAnimation.mock.calls[0][0]).toMatchObject({ renderer: 'svg', loop: false, autoplay: false })
  })
})

// ---- bundle / CSP guards (static) ----
function walk(dir: string, out: string[] = []): string[] {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f)
    const st = fs.statSync(p)
    if (st.isDirectory()) {
      if (f !== 'node_modules' && !f.startsWith('.')) walk(p, out)
    } else if (/\.(tsx?|mjs|jsx?)$/.test(f)) out.push(p)
  }
  return out
}

describe('animated icon bundle and CSP guards', () => {
  const sources = ['app', 'components', 'lib', 'hooks'].filter((d) => fs.existsSync(path.join(ROOT, d))).flatMap((d) => walk(path.join(ROOT, d)))

  it('nothing imports lottie statically (keeps it out of the root/shared chunk)', () => {
    const offenders = sources.filter((f) => /(?:import|export)\s[^'"]*from\s*['"]lottie-(?:web|react)[^'"]*['"]|require\(\s*['"]lottie-/.test(fs.readFileSync(f, 'utf8')))
    expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([])
  })

  it('AnimatedIcon loads only the eval-free light build, dynamically', () => {
    const src = fs.readFileSync(path.join(ROOT, 'components/icons/AnimatedIcon.tsx'), 'utf8')
    expect(src).toMatch(/import\(\s*'lottie-web\/build\/player\/lottie_light'\s*\)/)
    expect(src).not.toMatch(/lottie_svg|lottie\.js|lottie-react|build\/player\/lottie'/)
    const light = fs.readFileSync(path.join(ROOT, 'node_modules/lottie-web/build/player/lottie_light.js'), 'utf8')
    expect(light).not.toMatch(/\beval\(|new Function\(/)
  })

  it('ships only the listed (≤ 30), attributed icons', () => {
    const names = Object.keys(ANIMATED_ICONS)
    expect(names.length).toBeLessThanOrEqual(30)
    const expected = Object.values(ANIMATED_ICONS).flatMap((i) => [i.json, i.still].map((u) => u.replace('/animated-icons/', ''))).sort()
    expect(fs.readdirSync(path.join(ROOT, 'public/animated-icons')).sort()).toEqual(expected)
    const notice = fs.readFileSync(path.join(ROOT, '../LICENSE-THIRD-PARTY.md'), 'utf8')
    expect(notice).toContain('Animated icons by Sadjad')
    for (const n of names) expect(notice, n).toContain(`| ${n} |`)
    expect(fs.readFileSync(path.join(ROOT, 'app/credits/page.tsx'), 'utf8')).toContain('Animated icons by Sadjad')
  })

  it('every shipped icon is used somewhere outside the credits page', () => {
    const app = sources
      .filter((f) => !f.includes(`${path.sep}icons${path.sep}`) && !f.endsWith(path.join('credits', 'page.tsx')))
      .map((f) => fs.readFileSync(f, 'utf8'))
      .join('\n')
    for (const n of Object.keys(ANIMATED_ICONS)) expect(app.includes(`'${n}'`) || app.includes(`"${n}"`), n).toBe(true)
  })
})
