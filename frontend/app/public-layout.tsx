'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Code2, ArrowRight, Menu, X, Github, Library } from 'lucide-react'
import { useState } from 'react'
import { useHasSupabaseSession } from '@/hooks/use-has-supabase-session'
import { FooterAnimatedBackdrop } from '@/components/landing/footer-animated-backdrop'

export const DASHBOARD_HREF = '/dashboard'

export function PublicPageWrapper({
  children,
}: {
  children: React.ReactNode
}) {
  const hasSession = useHasSupabaseSession()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <Code2 className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="text-lg font-semibold text-foreground">CodeSpectra</span>
            </Link>

            {/* Desktop Menu */}
            <div className="hidden md:flex items-center gap-8">
              <Link href="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Home</Link>
              <Link href="/docs" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Docs</Link>
              <Link href="/support" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Support</Link>
              <Link href="/pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Pricing</Link>
            </div>

            {/* Auth Buttons */}
            <div className="hidden md:flex items-center gap-3">
              {hasSession ? (
                <Button size="sm" asChild className="gap-1.5">
                  <Link href={DASHBOARD_HREF}>
                    Go to dashboard
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </Button>
              ) : (
                <>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href="/auth/login">Sign in</Link>
                  </Button>
                  <Button size="sm" asChild className="gap-1.5">
                    <Link href="/auth/signup">
                      Start free trial
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </Button>
                </>
              )}
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 hover:bg-muted rounded-lg transition-colors"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>

          {/* Mobile Menu */}
          {mobileMenuOpen && (
            <div className="md:hidden py-4 space-y-1 border-t border-border/40">
              <Link href="/" className="block px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">Home</Link>
              <Link href="/docs" className="block px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">Docs</Link>
              <Link href="/support" className="block px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">Support</Link>
              <Link href="/pricing" className="block px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">Pricing</Link>
              <div className="flex gap-2 pt-3 px-3">
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
                    <Button size="sm" asChild className="flex-1">
                      <Link href="/auth/signup">Start free</Link>
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* Content */}
      <main className="flex-1 pt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
          {children}
        </div>
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
