'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Code2, CodeXml, ArrowRight, Menu, X } from 'lucide-react'
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

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Top Banner */}
      <div className="relative z-50 bg-linear-to-r from-[#091e17] via-[#0b2923] to-[#121a29] text-slate-200 text-xs py-2 px-4 border-b border-teal-500/20 text-center flex items-center justify-center gap-2 overflow-hidden">
        <div className="absolute inset-0 opacity-10 pointer-events-none bg-[radial-gradient(#00c573_1px,transparent_1px)] bg-size-[16px_16px]" />
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-teal-500/15 text-teal-300 font-semibold text-[10px] border border-teal-500/30 uppercase tracking-wider">
          <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
          Builder's Day
        </span>
        <span className="hidden sm:inline text-slate-300">CodeSpectra's AI Developer Conference · October 26 · San Francisco</span>
        <Link href="/events" className="inline-flex items-center gap-1 bg-slate-900/80 hover:bg-slate-800 text-teal-300 hover:text-white px-2.5 py-0.5 rounded-full text-[11px] font-medium border border-teal-500/30 transition-all hover:border-teal-400 hover:shadow-xs hover:shadow-teal-500/20 ml-1">
          Get tickets <ArrowRight className="w-3 h-3 text-teal-400" />
        </Link>
      </div>

      {/* Navigation */}
      <header className={cn(
        'fixed left-0 right-0 z-50 transition-all duration-300 ease-out',
        isScrolled ? 'top-3' : 'top-10'
      )}>
        <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8">
          <div className={cn(
            'relative flex items-center justify-between gap-3 px-4 py-2.5 transition-all duration-300 rounded-full border',
            isScrolled
              ? 'bg-[#090d14]/85 backdrop-blur-xl border-slate-700/60 shadow-xl shadow-black/40 ring-1 ring-white/5'
              : 'bg-[#090d14]/70 backdrop-blur-lg border-slate-800/80 shadow-lg shadow-black/20'
          )}>
            {/* Logo */}
            <Link href="/" className="group relative z-10 flex min-w-0 shrink-0 items-center gap-2.5 transition-transform hover:scale-[1.02]">
              <div className="relative flex items-center justify-center rounded-xl bg-linear-to-br from-teal-500/20 via-emerald-500/10 to-cyan-500/20 p-1.5 border border-teal-500/40 shadow-sm shadow-teal-500/20 group-hover:border-teal-400 transition-colors">
                <svg className="w-5 h-5" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <linearGradient id="nav-logo-grad" x1="2" y1="2" x2="30" y2="30" gradientUnits="userSpaceOnUse">
                      <stop offset="0%" stopColor="#2dd4bf" />
                      <stop offset="50%" stopColor="#00c573" />
                      <stop offset="100%" stopColor="#38bdf8" />
                    </linearGradient>
                    <filter id="nav-logo-glow" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="2" result="blur" />
                      <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                  </defs>
                  <path d="M7 10L16 4L25 10V22L16 28L7 22V10Z" stroke="url(#nav-logo-grad)" strokeWidth="2" strokeLinejoin="round" />
                  <path d="M16 4V28M7 10L25 22M7 22L25 10" stroke="url(#nav-logo-grad)" strokeWidth="1.2" strokeOpacity="0.6" />
                  <circle cx="16" cy="16" r="3" fill="#00c573" filter="url(#nav-logo-glow)" />
                </svg>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold tracking-tight text-white text-lg md:text-xl">
                  CodeSpectra
                </span>
                <span className="hidden sm:inline-block px-1.5 py-0.5 rounded text-[11px] font-mono font-bold bg-teal-500/15 text-teal-400 border border-teal-500/30">
                  AI
                </span>
              </div>
            </Link>

            {/* Desktop Menu Links */}
            <nav className="hidden md:flex items-center gap-1.5 lg:gap-3" aria-label="Primary">
              <Link
                href="/features"
                className="px-3 py-1.5 text-sm lg:text-[15px] font-semibold text-slate-300 hover:text-white rounded-full hover:bg-slate-800/60 transition-all duration-200"
              >
                Features
              </Link>
              <Link
                href="/hackathons"
                className="px-3 py-1.5 text-sm lg:text-[15px] font-semibold text-slate-300 hover:text-white rounded-full hover:bg-slate-800/60 transition-all duration-200"
              >
                Hackathons
              </Link>
              <Link
                href="/events"
                className="px-3 py-1.5 text-sm lg:text-[15px] font-semibold text-slate-300 hover:text-white rounded-full hover:bg-slate-800/60 transition-all duration-200"
              >
                Events
              </Link>
              <Link
                href="/pricing"
                className="px-3 py-1.5 text-sm lg:text-[15px] font-semibold text-slate-300 hover:text-white rounded-full hover:bg-slate-800/60 transition-all duration-200"
              >
                Pricing
              </Link>
              <Link
                href="/blog"
                className="px-3 py-1.5 text-sm lg:text-[15px] font-semibold text-slate-300 hover:text-white rounded-full hover:bg-slate-800/60 transition-all duration-200"
              >
                Blog
              </Link>
              <Link
                href="/docs"
                className="px-3 py-1.5 text-sm lg:text-[15px] font-semibold text-slate-300 hover:text-white rounded-full hover:bg-slate-800/60 transition-all duration-200"
              >
                Docs
              </Link>
            </nav>

            {/* Right Side Actions */}
            <div className="relative z-10 flex shrink-0 items-center gap-2 sm:gap-3">
              {/* Theme Switch */}
              <div className="hidden sm:block">
                <NavThemeSwitch compact />
              </div>

              {/* Auth / Dashboard CTA */}
              <div className="flex items-center gap-2">
                {hasSession ? (
                  <Button size="sm" asChild className="gap-1.5 rounded-full bg-mint-pulse hover:bg-phosphor-green text-slate-950 font-bold px-4.5 py-2 text-xs sm:text-sm shadow-md shadow-mint-pulse/25 transition-all hover:scale-105">
                    <Link href={DASHBOARD_HREF}>
                      Dashboard
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  </Button>
                ) : (
                  <>
                    <Link
                      href="/auth/login"
                      className="shrink-0 transition-colors hover:text-white text-xs sm:text-sm font-semibold text-slate-300 px-3 py-1.5 rounded-full hover:bg-slate-800/60"
                    >
                      Log in
                    </Link>
                    <Link
                      href="/auth/signup"
                      className="shrink-0 inline-flex items-center gap-1 rounded-full bg-linear-to-r from-mint-pulse to-[#2dd4bf] hover:from-phosphor-green hover:to-[#5eead4] text-slate-950 px-4.5 py-2 text-xs sm:text-sm font-bold transition-all shadow-md shadow-mint-pulse/25 hover:shadow-lg hover:shadow-mint-pulse/40 hover:scale-105"
                    >
                      Get started
                      <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
                    </Link>
                  </>
                )}
              </div>

              {/* Mobile Menu Toggle Button */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="inline-flex items-center justify-center rounded-full p-2 text-slate-300 hover:text-white hover:bg-slate-800/80 md:hidden transition-colors border border-slate-700/50"
                aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              >
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>

          {/* Mobile Drawer Menu */}
          {mobileMenuOpen && (
            <div className="md:hidden mt-2 p-4 bg-[#090d14]/95 backdrop-blur-2xl border border-slate-800 rounded-2xl shadow-2xl space-y-3 animate-in fade-in-50 slide-in-from-top-3 duration-200">
              <div className="grid grid-cols-2 gap-2 text-sm font-medium">
                <Link
                  href="/features"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-2 p-2.5 text-slate-300 hover:text-white hover:bg-slate-800/60 rounded-xl transition-colors"
                >
                  Features
                </Link>
                <Link
                  href="/hackathons"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-2 p-2.5 text-slate-300 hover:text-white hover:bg-slate-800/60 rounded-xl transition-colors"
                >
                  Hackathons
                </Link>
                <Link
                  href="/events"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-2 p-2.5 text-slate-300 hover:text-white hover:bg-slate-800/60 rounded-xl transition-colors"
                >
                  Events
                </Link>
                <Link
                  href="/pricing"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-2 p-2.5 text-slate-300 hover:text-white hover:bg-slate-800/60 rounded-xl transition-colors"
                >
                  Pricing
                </Link>
                <Link
                  href="/docs"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-2 p-2.5 text-slate-300 hover:text-white hover:bg-slate-800/60 rounded-xl transition-colors"
                >
                  Docs
                </Link>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-800/80 px-1">
                <span className="text-xs text-slate-400 font-medium">Appearance</span>
                <NavThemeSwitch />
              </div>

              <div className="pt-2">
                {hasSession ? (
                  <Button size="sm" asChild className="w-full gap-1.5 rounded-xl bg-mint-pulse hover:bg-phosphor-green text-slate-950 font-bold py-2">
                    <Link href={DASHBOARD_HREF}>
                      Go to dashboard
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" asChild className="flex-1 rounded-xl border-slate-700 bg-slate-900/60 text-slate-200 hover:bg-slate-800 hover:text-white">
                      <Link href="/auth/login">Log in</Link>
                    </Button>
                    <Button size="sm" asChild className="flex-1 rounded-xl bg-linear-to-r from-mint-pulse to-[#2dd4bf] text-slate-950 font-bold shadow-md shadow-mint-pulse/20">
                      <Link href="/auth/signup">Get started</Link>
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Content — pages handle their own width + padding */}
      <main className="flex-1 pt-16">
        {children}
      </main>

      {/* Footer */}
      <footer className="relative overflow-hidden border-t border-border/40 bg-muted/15 py-20 dark:bg-muted/10 lg:py-24">
        <FooterAnimatedBackdrop />
        <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-8 md:gap-12 mb-12">
            <div className="col-span-2 md:col-span-1">
              <Link href="/" className="group flex items-center gap-2.5 mb-6">
                <div className="flex items-center justify-center rounded-xl bg-linear-to-br from-teal-500/20 via-emerald-500/10 to-cyan-500/20 p-1.5 border border-teal-500/40 shadow-sm shadow-teal-500/20">
                  <svg className="w-5 h-5" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M7 10L16 4L25 10V22L16 28L7 22V10Z" stroke="#2dd4bf" strokeWidth="2" strokeLinejoin="round" />
                    <path d="M16 4V28M7 10L25 22M7 22L25 10" stroke="#00c573" strokeWidth="1.2" strokeOpacity="0.6" />
                    <circle cx="16" cy="16" r="3" fill="#00c573" />
                  </svg>
                </div>
                <span className="font-bold tracking-tight text-lg text-foreground">CodeSpectra</span>
              </Link>
              <p className="text-sm text-muted-foreground leading-relaxed">
                CodeSpectra helps you learn and improve: scan your code, fix issues with guidance and AI support, practice
                challenges, take courses and assessments, train for interviews, earn certificates, and explore opportunities.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-foreground text-sm mb-6">Product</h4>
              <ul className="space-y-4">
                <li><Link href="/features" className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200">Features</Link></li>
                <li><Link href="/pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200">Pricing</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-foreground text-sm mb-6">Resources</h4>
              <ul className="space-y-4">
                <li><Link href="/docs" className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200">Documentation</Link></li>
                <li><Link href="/newsletter" className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200">Newsletter</Link></li>
                <li><Link href="/blog" className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200">Blog</Link></li>
                <li><Link href="/api-reference" className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200">API reference</Link></li>
                <li><Link href="/support" className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200">Support</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-foreground text-sm mb-6">Company</h4>
              <ul className="space-y-4">
                <li><Link href="/about" className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200">About</Link></li>
                <li><Link href="/contact" className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200">Contact</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-foreground text-sm mb-6">Legal</h4>
              <ul className="space-y-4">
                <li><Link href="/privacy" className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200">Privacy</Link></li>
                <li><Link href="/terms" className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200">Terms</Link></li>
                <li><Link href="/cookies" className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200">Cookies</Link></li>
              </ul>
            </div>
            <div className="col-span-2 md:col-span-1">
              <h4 className="font-semibold text-foreground text-sm mb-6">Newsletter</h4>
              <p className="text-sm text-muted-foreground mb-4">Subscribe to our newsletter to get the latest updates.</p>
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
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary"
                />
                <Button type="submit" size="sm" className="w-full">
                  Subscribe
                </Button>
              </form>
            </div>
          </div>
          <div className="flex flex-col gap-6 border-t border-border/40 pt-10 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">© 2026 CodeSpectra. All rights reserved.</p>
            <div className="flex flex-wrap items-center gap-4 sm:justify-end">
              <Link href="/status" className="flex items-center gap-2 rounded-full border border-border/50 bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/80 transition-colors">
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-40" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                All systems operational
              </Link>
              <div className="flex items-center gap-5">
                <Link href="/docs" className="text-muted-foreground transition-colors duration-200 hover:text-foreground" aria-label="Documentation">
                  <Code2 className="h-5 w-5" />
                </Link>
              </div>
            </div>
          </div>

          {/* Giant gradient wordmark + domain — Arcade-style footer logo */}
          <FooterWordmark />
        </div>
      </footer>
    </div>
  )
}
