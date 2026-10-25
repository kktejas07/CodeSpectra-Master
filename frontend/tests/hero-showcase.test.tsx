/**
 * Hero slideshow auto-advance (components/landing/hero-showcase.tsx):
 * - advances Build → Proctor → Rank → Judge on its own timer;
 * - pauses while pointer/focus is inside, resumes on leave;
 * - stays put under prefers-reduced-motion.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: Record<string, unknown>) =>
    React.createElement('a', { href: String(href), ...rest }, children as React.ReactNode),
}))

vi.mock('@/lib/i18n/client', () => ({
  useT: () => ({ t: (k: string) => k, locale: 'en' }),
}))

import { HeroShowcase } from '@/components/landing/hero-showcase'

function setReducedMotion(reduce: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduce && String(query).includes('reduce'),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

function selectedTab(): number {
  const tabs = screen.getAllByRole('tab')
  return tabs.findIndex((el) => el.getAttribute('aria-selected') === 'true')
}

beforeEach(() => {
  vi.useFakeTimers()
  setReducedMotion(false)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('hero slideshow auto-advance', () => {
  it('advances through the slides on its own timer', () => {
    render(<HeroShowcase primaryHref="/contact" secondaryHref="/auth/signup" secondaryLabel="x" />)
    expect(selectedTab()).toBe(0)
    act(() => {
      vi.advanceTimersByTime(6500)
    })
    expect(selectedTab()).toBe(1)
    act(() => {
      vi.advanceTimersByTime(6500)
    })
    expect(selectedTab()).toBe(2)
  })

  it('pauses while hovered and resumes on leave', () => {
    render(<HeroShowcase primaryHref="/contact" secondaryHref="/auth/signup" secondaryLabel="x" />)
    fireEvent.mouseEnter(screen.getByRole('region'))
    act(() => {
      vi.advanceTimersByTime(6500 * 3)
    })
    expect(selectedTab()).toBe(0)
    fireEvent.mouseLeave(screen.getByRole('region'))
    act(() => {
      vi.advanceTimersByTime(6500)
    })
    expect(selectedTab()).toBe(1)
  })

  it('stays put under prefers-reduced-motion', () => {
    setReducedMotion(true)
    render(<HeroShowcase primaryHref="/contact" secondaryHref="/auth/signup" secondaryLabel="x" />)
    act(() => {
      vi.advanceTimersByTime(6500 * 3)
    })
    expect(selectedTab()).toBe(0)
  })
})
