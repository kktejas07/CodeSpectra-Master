'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Code2, CodeXml, ArrowRight, Menu, X, Github } from 'lucide-react'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { useHasSupabaseSession } from '@/hooks/use-has-supabase-session'
import { NavThemeSwitch } from '@/components/nav-theme-switch'
import { FooterAnimatedBackdrop } from '@/components/landing/footer-animated-backdrop'

export const DASHBOARD_HREF = '/dashboard'

export function PublicPageWrapper({
  children,
}: {
  children: React.ReactNode
}) {
  const hasSession = useHasSupabaseSession()
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
      {/* Navigation */}
      <nav className={cn(
        'fixed left-0 right-0 top-0 z-50 transition-all duration-500 ease-out',
        isScrolled
          ? 'bg-background/80 shadow-sm'
          : 'bg-transparent pt-3 md:pt-4'
      )}>
        <div className={cn(
          'mx-auto transition-all duration-500 px-3 sm:px-4',
          isScrolled
            ? 'max-w-full'
            : 'max-w-7xl md:max-w-4xl lg:max-w-5xl xl:max-w-6xl md:px-4'
        )}>
          <div className={cn(
            'relative flex items-center justify-between gap-2 transition-all duration-500 sm:gap-3 md:grid md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center md:justify-normal md:gap-x-2 md:gap-y-0 lg:gap-x-4 min-h-[52px] border-b border-border/50 py-2.5 shadow-sm backdrop-blur-xl supports-backdrop-filter:bg-background/88',
            isScrolled
              ? 'bg-background/95 md:bg-background/95'
              : 'bg-background/92 md:bg-background/80 md:rounded-full md:border md:border-border/55 md:shadow-[0_8px_30px_-8px_rgba(0,0,0,0.12)] md:backdrop-blur-xl dark:md:border-border/50 dark:md:shadow-[0_8px_32px_-8px_rgba(0,0,0,0.45)] md:border-b-0 md:px-4 md:py-2.5 lg:px-6 xl:px-7'
          )}>
            {/* Logo */}
            <Link href="/" className="group relative z-10 flex min-w-0 shrink-0 items-center gap-2 transition-all duration-500 md:justify-self-start">
              <div className="flex items-center justify-center rounded-lg bg-primary shadow-primary/25 transition-all duration-500 h-7 w-7 shadow-sm md:h-8 md:w-8">
                <CodeXml className="text-primary-foreground transition-all duration-500 h-3.5 w-3.5 md:h-4 md:w-4" />
              </div>
              <span className="font-semibold tracking-tight text-foreground transition-all duration-500 text-base md:text-lg">
                CodeSpectra
                <sup className="ml-0.5 mt-0.5 font-mono text-[10px] font-medium text-muted-foreground transition-all duration-500">TM</sup>
              </span>
            </Link>

            {/* Desktop Menu */}
            <nav className="hidden min-w-0 items-center justify-center justify-self-stretch md:flex" aria-label="Primary">
              <div className="flex max-w-full flex-wrap items-center justify-center gap-x-4 gap-y-1 sm:gap-x-5 md:gap-x-4 lg:gap-x-6 xl:gap-x-8">
                <Link href="#capabilities" className="group relative shrink-0 whitespace-nowrap text-sm transition-colors duration-300 text-foreground/70 hover:text-foreground">
                  Features
                  <span className="absolute -bottom-1 left-0 h-px w-0 bg-foreground transition-all duration-300 group-hover:w-full" aria-hidden />
                </Link>
                <Link href="#how-it-works" className="group relative shrink-0 whitespace-nowrap text-sm transition-colors duration-300 text-foreground/70 hover:text-foreground">
                  How it works
                  <span className="absolute -bottom-1 left-0 h-px w-0 bg-foreground transition-all duration-300 group-hover:w-full" aria-hidden />
                </Link>
                <Link href="#integrations" className="group relative shrink-0 whitespace-nowrap text-sm transition-colors duration-300 text-foreground/70 hover:text-foreground">
                  Integrations
                  <span className="absolute -bottom-1 left-0 h-px w-0 bg-foreground transition-all duration-300 group-hover:w-full" aria-hidden />
                </Link>
                <Link href="/pricing" className="group relative shrink-0 whitespace-nowrap text-sm transition-colors duration-300 text-foreground/70 hover:text-foreground">
                  Pricing
                  <span className="absolute -bottom-1 left-0 h-px w-0 bg-foreground transition-all duration-300 group-hover:w-full" aria-hidden />
                </Link>
              </div>
            </nav>

            {/* Right side: theme switch + auth + mobile menu */}
            <div className="relative z-10 flex shrink-0 items-center justify-end gap-2 md:justify-self-end md:gap-2 lg:gap-3">
              <NavThemeSwitch compact />

              <div className="hidden items-center gap-2 md:flex lg:gap-3">
                {hasSession ? (
                  <Button size="sm" asChild className="gap-1.5">
                    <Link href={DASHBOARD_HREF}>
                      Go to dashboard
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </Button>
                ) : (
                  <>
                    <Link href="/auth/login" className="shrink-0 transition-all duration-500 hover:text-foreground text-xs text-foreground/70">
                      Sign in
                    </Link>
                    <Button size="sm" asChild className="shrink-0 gap-1.5 rounded-full bg-primary px-3 text-xs font-medium shadow-sm transition-all duration-500 hover:bg-primary/90 sm:px-4 md:shadow-md">
                      <Link href="/auth/signup">
                        Get started
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
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
            <div className="md:hidden pt-2 pb-4 space-y-1">
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
                challenges, take courses and exams, train for interviews, earn certificates, and explore opportunities.
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
                <a href="https://github.com/kktejas07/CodeSpectra-Master" target="_blank" rel="noopener noreferrer" className="text-muted-foreground transition-colors duration-200 hover:text-foreground" aria-label="CodeSpectra on GitHub">
                  <Github className="h-5 w-5" />
                </a>
                <Link href="/docs" className="text-muted-foreground transition-colors duration-200 hover:text-foreground" aria-label="Documentation">
                  <Code2 className="h-5 w-5" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
