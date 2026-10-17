'use client'

import Link from 'next/link'
import { Menu, X } from 'lucide-react'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useToast } from '@/lib/toast-context'
import { useHasUserSession } from '@/hooks/use-has-user-session'
import { NavThemeSwitch } from '@/components/nav-theme-switch'

export const DASHBOARD_HREF = '/dashboard'

export function PublicPageWrapper({
  children,
}: {
  children: React.ReactNode
}) {
  const hasSession = useHasUserSession()
  const addToast = useToast()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 60)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const navLinks = [
    { href: '/features', label: 'Features' },
    { href: '/hackathons', label: 'Hackathons' },
    { href: '/events', label: 'Events' },
    { href: '/pricing', label: 'Pricing' },
    { href: '/blog', label: 'Blog' },
    { href: '/docs', label: 'Docs' },
  ]

  return (
    <div className="cs-brand min-h-screen flex flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-cs-sheet focus:px-4 focus:py-2">
        Skip to content
      </a>

      {/* Navigation */}
      <header
        className={cn(
          'fixed inset-x-0 top-0 z-50 border-b transition-colors duration-200',
          isScrolled || mobileMenuOpen
            ? 'border-cs-grid bg-cs-paper/95 backdrop-blur-md'
            : 'border-transparent bg-cs-paper/0',
        )}
      >
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="Code Spectra home">
            <BrandMark />
            <span className="text-[1.2rem] font-bold tracking-tight [font-stretch:85%]">Code Spectra</span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
            {navLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="rounded-md px-3 py-2 text-[15px] font-medium text-cs-ink-soft transition-colors hover:text-cs-ink"
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <div className="hidden sm:block">
              <NavThemeSwitch compact />
            </div>
            {hasSession ? (
              <Link
                href={DASHBOARD_HREF}
                className="inline-flex h-10 items-center rounded-md bg-cs-blue px-4 text-sm font-semibold text-cs-blue-ink hover:brightness-110"
              >
                Dashboard
              </Link>
            ) : (
              <>
                <Link href="/auth/login" className="hidden rounded-md px-3 py-2 text-sm font-semibold text-cs-ink sm:inline-flex">
                  Log in
                </Link>
                <Link
                  href="/contact"
                  className="inline-flex h-10 items-center rounded-md bg-cs-blue px-4 text-sm font-semibold text-cs-blue-ink hover:brightness-110"
                >
                  Book a pilot
                </Link>
              </>
            )}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-md text-cs-ink md:hidden"
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-menu"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div id="mobile-menu" className="border-t border-cs-grid bg-cs-paper px-4 pb-6 md:hidden">
            <nav className="flex flex-col py-2" aria-label="Mobile">
              {navLinks.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="border-b border-cs-grid py-3.5 text-lg font-medium"
                >
                  {l.label}
                </Link>
              ))}
            </nav>
            <div className="flex items-center justify-between py-4">
              <span className="text-sm text-cs-ink-soft">Appearance</span>
              <NavThemeSwitch />
            </div>
            {!hasSession && (
              <Link
                href="/auth/login"
                onClick={() => setMobileMenuOpen(false)}
                className="flex h-12 items-center justify-center rounded-md border border-cs-ink/25 font-semibold"
              >
                Log in
              </Link>
            )}
          </div>
        )}
      </header>

      <main id="main" className="flex-1 pt-16">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-cs-grid bg-cs-sheet py-16 lg:py-20">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-8 md:gap-12 mb-12">
            <div className="col-span-2 md:col-span-1">
              <Link href="/" className="mb-5 flex items-center gap-2.5" aria-label="Code Spectra home">
                <BrandMark />
                <span className="text-lg font-bold tracking-tight [font-stretch:85%]">Code Spectra</span>
              </Link>
              <p className="text-sm text-cs-ink-soft leading-relaxed">
                Proctored skills assessments and hackathons that rank every candidate, for hiring teams, colleges and
                the people they assess.
              </p>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-cs-ink mb-4">Product</h4>
              <ul className="space-y-3">
                <li><Link href="/features" className="text-sm text-cs-ink-soft hover:text-cs-ink transition-colors duration-200">Features</Link></li>
                <li><Link href="/pricing" className="text-sm text-cs-ink-soft hover:text-cs-ink transition-colors duration-200">Pricing</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-cs-ink mb-4">Resources</h4>
              <ul className="space-y-3">
                <li><Link href="/docs" className="text-sm text-cs-ink-soft hover:text-cs-ink transition-colors duration-200">Documentation</Link></li>
                <li><Link href="/newsletter" className="text-sm text-cs-ink-soft hover:text-cs-ink transition-colors duration-200">Newsletter</Link></li>
                <li><Link href="/blog" className="text-sm text-cs-ink-soft hover:text-cs-ink transition-colors duration-200">Blog</Link></li>
                <li><Link href="/api-reference" className="text-sm text-cs-ink-soft hover:text-cs-ink transition-colors duration-200">API reference</Link></li>
                <li><Link href="/support" className="text-sm text-cs-ink-soft hover:text-cs-ink transition-colors duration-200">Support</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-cs-ink mb-4">Company</h4>
              <ul className="space-y-3">
                <li><Link href="/about" className="text-sm text-cs-ink-soft hover:text-cs-ink transition-colors duration-200">About</Link></li>
                <li><Link href="/contact" className="text-sm text-cs-ink-soft hover:text-cs-ink transition-colors duration-200">Contact</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-cs-ink mb-4">Legal</h4>
              <ul className="space-y-3">
                <li><Link href="/privacy" className="text-sm text-cs-ink-soft hover:text-cs-ink transition-colors duration-200">Privacy</Link></li>
                <li><Link href="/terms" className="text-sm text-cs-ink-soft hover:text-cs-ink transition-colors duration-200">Terms</Link></li>
                <li><Link href="/cookies" className="text-sm text-cs-ink-soft hover:text-cs-ink transition-colors duration-200">Cookies</Link></li>
              </ul>
            </div>
            <div className="col-span-2 md:col-span-1">
              <h4 className="text-sm font-semibold text-cs-ink mb-4">Newsletter</h4>
              <p className="text-sm text-cs-ink-soft mb-4">New hackathons, assessment features and hiring guides, about once a month.</p>
              <form 
                className="space-y-2"
                onSubmit={async (e) => {
                  e.preventDefault()
                  const form = e.currentTarget
                  const formData = new FormData(form)
                  const email = ((formData.get('email') as string) || '').trim()
                  if (!email) return
                  const btn = form.querySelector('button')
                  if (btn) btn.disabled = true
                  try {
                    const res = await csrfFetch('/api/newsletter/subscribe', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ email, source: 'footer' })
                    })
                    let errMsg = `Subscribe failed (${res.status})`
                    let already = false
                    try {
                      const data = (await res.json()) as { ok?: boolean; already_subscribed?: boolean; error?: string }
                      if (data?.already_subscribed) already = true
                      if (data?.error) errMsg = data.error
                    } catch { /* non-JSON body — keep status message */ }
                    if (!res.ok) throw new Error(errMsg)
                    addToast({ type: 'success', title: already ? 'Already subscribed!' : 'Subscribed successfully!' })
                    form.reset()
                  } catch (err) {
                    addToast({ type: 'error', title: 'Failed to subscribe.', message: err instanceof Error ? err.message : undefined })
                  } finally {
                    if (btn) btn.disabled = false
                  }
                }}
              >
                <input
                  type="email"
                  name="email"
                  required
                  placeholder="Enter your email"
                  aria-label="Email address"
                  className="h-10 w-full rounded-md border border-cs-grid bg-cs-paper px-3 text-sm text-cs-ink placeholder:text-cs-ink-soft"
                />
                <button type="submit" className="h-10 w-full rounded-md bg-cs-ink text-sm font-semibold text-cs-paper disabled:opacity-60">
                  Subscribe
                </button>
              </form>
            </div>
          </div>
          <div className="flex flex-col gap-6 border-t border-cs-grid pt-8 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-cs-ink-soft">© 2026 Code Spectra. All rights reserved.</p>
            <Link href="/status" className="text-xs text-cs-ink-soft hover:text-cs-ink">
              System status
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}

/** Brand mark: a spectrum of five bars of rising height, the top three highlighted — a ranked shortlist. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" className={cn('h-7 w-7', className)} aria-hidden>
      <rect width="28" height="28" rx="6" fill="var(--cs-ink)" />
      {[5, 9, 13, 17, 21].map((x, i) => (
        <rect key={x} x={x} y={21 - (i + 1) * 3} width="2.6" height={(i + 1) * 3} rx="0.8" fill={i >= 2 ? 'var(--cs-mark)' : 'var(--cs-paper)'} opacity={i >= 2 ? 1 : 0.55} />
      ))}
    </svg>
  )
}
