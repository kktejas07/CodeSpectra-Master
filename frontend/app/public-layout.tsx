'use client'

import Link from 'next/link'
import { CodeXml, Menu, X } from 'lucide-react'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useToast } from '@/lib/toast-context'
import { useHasUserSession } from '@/hooks/use-has-user-session'
import { NavThemeSwitch } from '@/components/nav-theme-switch'
import { FooterAnimatedBackdrop } from '@/components/landing/footer-animated-backdrop'
import { FooterWordmark } from '@/components/landing/footer-wordmark'

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
          // solid at all times: the hero below is white in both themes
          isScrolled || mobileMenuOpen ? 'border-cs-grid bg-cs-paper/95 backdrop-blur-md' : 'border-cs-grid/60 bg-cs-paper',
        )}
      >
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="CodeSpectra home">
            <BrandLogo />
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
                className="inline-flex h-10 items-center rounded-md bg-cs-accent px-4 text-sm font-semibold text-cs-accent-ink hover:brightness-110"
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
                  className="inline-flex h-10 items-center rounded-md bg-cs-accent px-4 text-sm font-semibold text-cs-accent-ink hover:brightness-110"
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
      <footer className="relative overflow-hidden border-t border-cs-grid bg-cs-sheet py-16 lg:py-20">
        <FooterAnimatedBackdrop />
        <div className="relative z-10 mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-8 md:gap-12 mb-12">
            <div className="col-span-2 md:col-span-1">
              <Link href="/" className="mb-5 flex items-center gap-2.5" aria-label="CodeSpectra home">
                <BrandLogo />
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
            <p className="text-xs text-cs-ink-soft">© 2026 CodeSpectra. All rights reserved.</p>
            <div className="flex flex-wrap items-center gap-4 sm:justify-end">
              <Link
                href="/status"
                className="flex items-center gap-2 rounded-full border border-cs-grid bg-cs-paper/60 px-3 py-1.5 text-xs text-cs-ink-soft transition-colors hover:text-cs-ink"
              >
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#5b84ff] opacity-40 motion-reduce:animate-none" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[#2f5be7]" />
                </span>
                All systems operational
              </Link>
              <Link href="/docs" className="text-cs-ink-soft transition-colors hover:text-cs-ink" aria-label="Documentation">
                <CodeXml className="h-5 w-5" aria-hidden />
              </Link>
            </div>
          </div>

          {/* Giant gradient wordmark (royal blue via --primary in .cs-brand) */}
          <FooterWordmark />
        </div>
      </footer>
    </div>
  )
}

/**
 * CodeSpectra logo: a rounded tile holding the </> mark, then the wordmark.
 * Same mark as /public/icon.svg (the favicon), in royal blue.
 */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-3', className)}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-[#2f5be7]/45 bg-[#2f5be7]/12 dark:border-[#5b84ff]/45 dark:bg-[#2f5be7]/20">
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] text-[#2f5be7] dark:text-[#8aa8ff]" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M8 7L3 12L8 17" />
          <path d="M16 7L21 12L16 17" />
          <path d="M14 4.5L10 19.5" />
        </svg>
      </span>
      <span className="text-[1.3rem] font-bold tracking-tight">CodeSpectra</span>
    </span>
  )
}
