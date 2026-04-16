'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Code2, ArrowRight, Menu, X } from 'lucide-react'
import { useState } from 'react'

export function PublicPageWrapper({
  children,
}: {
  children: React.ReactNode
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex flex-col">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 border-b border-border/50 bg-background/95 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2 group">
              <div className="w-10 h-10 bg-gradient-to-br from-primary to-primary/60 rounded-lg flex items-center justify-center shadow-lg group-hover:shadow-xl transition-shadow">
                <Code2 className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">CodeSpectra</span>
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
              <Button variant="outline" size="sm" asChild className="rounded-lg">
                <Link href="/auth/login">Sign In</Link>
              </Button>
              <Button size="sm" asChild className="rounded-lg gap-2 group">
                <Link href="/auth/signup">
                  Get Started
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Link>
              </Button>
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 hover:bg-muted rounded-lg transition-colors"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>

          {/* Mobile Menu */}
          {mobileMenuOpen && (
            <div className="md:hidden pb-4 space-y-3 border-t border-border/50">
              <Link href="/" className="block text-sm text-muted-foreground hover:text-foreground transition-colors px-2 py-2">Home</Link>
              <Link href="/docs" className="block text-sm text-muted-foreground hover:text-foreground transition-colors px-2 py-2">Docs</Link>
              <Link href="/support" className="block text-sm text-muted-foreground hover:text-foreground transition-colors px-2 py-2">Support</Link>
              <Link href="/pricing" className="block text-sm text-muted-foreground hover:text-foreground transition-colors px-2 py-2">Pricing</Link>
              <div className="flex gap-2 pt-3">
                <Button variant="outline" size="sm" asChild className="flex-1 rounded-lg">
                  <Link href="/auth/login">Sign In</Link>
                </Button>
                <Button size="sm" asChild className="flex-1 rounded-lg">
                  <Link href="/auth/signup">Get Started</Link>
                </Button>
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* Content */}
      <main className="flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          {children}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/50 bg-background/50 backdrop-blur-sm py-8 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Code2 className="w-5 h-5 text-primary" />
              <span className="text-sm text-muted-foreground">© 2026 CodeSpectra. All rights reserved.</span>
            </div>
            <div className="flex gap-6">
              <Link href="/privacy" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Privacy</Link>
              <Link href="/terms" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Terms</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
