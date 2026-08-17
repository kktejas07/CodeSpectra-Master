'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Code2, CodeXml, ArrowRight, Menu, X } from 'lucide-react'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
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
      {/* Top Banner (Prisma Conference style) */}
      <div className="relative z-50 bg-gradient-to-r from-[#173030] via-[#0d2222] to-[#1d1226] text-slate-200 text-xs py-2 px-4 border-b border-teal-900/40 text-center flex items-center justify-center gap-2 overflow-hidden">
        <div className="absolute inset-0 opacity-15 pointer-events-none bg-[repeating-linear-gradient(45deg,#00c573_0,#00c573_1px,transparent_0,transparent_10px)]" />
        <span className="font-semibold text-white">Builder's Day</span>
        <span className="hidden sm:inline text-slate-300">CodeSpectra's AI developer conference · October 26 · San Francisco</span>
        <Link href="/events" className="inline-flex items-center gap-1 bg-slate-900/80 hover:bg-slate-900 text-slate-100 px-2.5 py-0.5 rounded-full text-[11px] font-medium border border-teal-500/30 transition-colors ml-1">
          Get tickets <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {/* Navigation */}
      <nav className={cn(
        'fixed left-0 right-0 top-9 z-50 transition-all duration-500 ease-out',
        isScrolled
          ? 'bg-background/90 backdrop-blur-md shadow-sm border-b border-border/40'
          : 'bg-transparent pt-2 md:pt-3'
      )}>
        <div className={cn(
          'mx-auto transition-all duration-500 px-3 sm:px-4',
          isScrolled
            ? 'max-w-full'
            : 'max-w-7xl md:max-w-4xl lg:max-w-5xl xl:max-w-6xl md:px-4'
        )}>
          <div className={cn(
            'relative flex items-center justify-between gap-2 transition-all duration-500 sm:gap-3 md:grid md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center md:justify-normal md:gap-x-2 md:gap-y-0 lg:gap-x-4 min-h-[52px] border border-slate-800/80 py-2 shadow-2xl backdrop-blur-xl bg-[#090d14]/90 rounded-2xl md:rounded-full md:px-5 lg:px-6'
          )}>
            {/* Logo */}
            <Link href="/" className="group relative z-10 flex min-w-0 shrink-0 items-center gap-2.5 transition-all duration-500 md:justify-self-start">
              <div className="flex items-center justify-center rounded-lg bg-teal-500/20 text-teal-400 border border-teal-500/40 h-7 w-7 shadow-sm md:h-8 md:w-8">
                <CodeXml className="h-4 w-4 text-teal-400" />
              </div>
              <span className="font-bold tracking-tight text-white transition-all duration-500 text-base md:text-lg">
                CodeSpectra
              </span>
            </Link>

            {/* Desktop Menu */}
            <nav className="hidden min-w-0 items-center justify-center justify-self-stretch md:flex" aria-label="Primary">
              <div className="flex max-w-full flex-wrap items-center justify-center gap-x-4 gap-y-1 sm:gap-x-5 md:gap-x-4 lg:gap-x-6 xl:gap-x-7">
                <Link href="#capabilities" className="group relative shrink-0 whitespace-nowrap text-sm font-medium transition-colors duration-300 text-slate-300 hover:text-white">
                  Products
                </Link>
                <Link href="/pricing" className="group relative shrink-0 whitespace-nowrap text-sm font-medium transition-colors duration-300 text-slate-300 hover:text-white">
                  Pricing
                </Link>
                <Link href="#how-it-works" className="group relative shrink-0 whitespace-nowrap text-sm font-medium transition-colors duration-300 text-slate-300 hover:text-white">
                  Resources
                </Link>
                <Link href="/docs" className="group relative shrink-0 whitespace-nowrap text-sm font-medium transition-colors duration-300 text-slate-300 hover:text-white">
                  Docs
                </Link>
                <Link href="/blog" className="group relative shrink-0 whitespace-nowrap text-sm font-medium transition-colors duration-300 text-slate-300 hover:text-white">
                  Blog
                </Link>
              </div>
            </nav>

            {/* Right side: GitHub star count + Discord + Login + Cyan Get Started button */}
            <div className="relative z-10 flex shrink-0 items-center justify-end gap-2.5 md:justify-self-end">
              {/* GitHub Stars Badge */}
              <a
                href="https://github.com/kktejas07/CodeSpectra-Master"
                target="_blank"
                rel="noreferrer"
                className="hidden lg:inline-flex items-center gap-1.5 bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 rounded-full px-2.5 py-1 text-xs font-mono text-slate-300 transition-colors"
              >
                <svg className="w-3.5 h-3.5 text-slate-400" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
                <span>47.6K</span>
              </a>

              {/* Discord Link */}
              <a
                href="https://discord.gg"
                target="_blank"
                rel="noreferrer"
                className="hidden lg:inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-900/80 hover:bg-slate-800 border border-slate-700/80 text-slate-300 hover:text-white transition-colors"
                title="Join Discord"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.093.252-.19.372-.287a.075.075 0 0 1 .078-.01c3.927 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .079.009c.12.098.245.195.372.288a.077.077 0 0 1-.006.128c-.598.349-1.223.648-1.873.892-.041.016-.062.066-.041.107.352.699.764 1.364 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>
              </a>

              <div className="flex items-center gap-2 md:gap-3">
                {hasSession ? (
                  <Button size="sm" asChild className="gap-1.5 rounded-full bg-[#00c573] hover:bg-[#3ecf8e] text-slate-950 font-bold px-4 text-xs">
                    <Link href={DASHBOARD_HREF}>
                      Dashboard
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </Button>
                ) : (
                  <>
                    <Link href="/auth/login" className="shrink-0 transition-all duration-300 hover:text-white text-xs font-medium text-slate-300 px-2 py-1">
                      Login
                    </Link>
                    <Link href="/auth/signup" className="shrink-0 inline-flex items-center gap-1 rounded-full bg-[#00c573] hover:bg-[#3ecf8e] text-slate-950 px-4 py-1.5 text-xs font-bold transition-all shadow-md shadow-[#00c573]/20">
                      Get started
                    </Link>
                  </>
                )}
              </div>

              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="rounded-lg p-2 transition-colors md:hidden hover:bg-muted/80"
                aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              >
                {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </button>
            </div>
          </div>

          {/* Mobile Menu */}
          {mobileMenuOpen && (
            <div className="md:hidden bg-background/95 backdrop-blur-sm border-t border-border/50 pt-2 pb-4 space-y-1">
              <Link href="#capabilities" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">Features</Link>
              <Link href="#how-it-works" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">How it works</Link>
              <Link href="#integrations" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">Integrations</Link>
              <Link href="/pricing" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">Pricing</Link>
              <div className="flex items-center gap-3 px-3 pt-3">
                <span className="text-sm text-muted-foreground">Theme</span>
                <NavThemeSwitch />
              </div>
              <div className="flex gap-2 px-3 pt-2">
                {hasSession ? (
                  <Button size="sm" asChild className="w-full gap-1">
                    <Link href={DASHBOARD_HREF}>
                      Go to dashboard
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </Button>
                ) : (
                  <>
                    <Button variant="outline" size="sm" asChild className="flex-1">
                      <Link href="/auth/login">Sign in</Link>
                    </Button>
                    <Button size="sm" asChild className="flex-1 rounded-full">
                      <Link href="/auth/signup">Get started</Link>
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* Content — pages handle their own width + padding */}
      <main className="flex-1 pt-16">
        {children}
      </main>

      {/* Footer */}
      <footer className="relative overflow-hidden border-t border-border/40 bg-muted/15 py-20 dark:bg-muted/10 lg:py-24">
        <FooterAnimatedBackdrop />
        <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8 md:gap-12 mb-12">
            <div className="col-span-2 md:col-span-1">
              <Link href="/" className="flex items-center gap-2 mb-6">
                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                  <Code2 className="w-4 h-4 text-primary-foreground" />
                </div>
                <span className="font-semibold text-lg">CodeSpectra</span>
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
          </div>
          <div className="flex flex-col gap-6 border-t border-border/40 pt-10 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">© 2026 CodeSpectra. All rights reserved.</p>
            <div className="flex flex-wrap items-center gap-4 sm:justify-end">
              <div className="flex items-center gap-2 rounded-full border border-border/50 bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-40" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                All systems operational
              </div>
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
