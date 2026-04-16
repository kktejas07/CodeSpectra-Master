'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ArrowRight, Code2, Zap, Shield, Cpu, GitBranch, Star, CheckCircle2, TrendingUp, Github, Menu, X } from 'lucide-react'

export default function Home() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
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
              <Link href="#capabilities" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Capabilities</Link>
              <Link href="#process" className="text-sm text-muted-foreground hover:text-foreground transition-colors">How It Works</Link>
              <Link href="#pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Pricing</Link>
              <Link href="#testimonials" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Testimonials</Link>
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
              <Link href="#capabilities" className="block text-sm text-muted-foreground hover:text-foreground transition-colors px-2 py-2">Capabilities</Link>
              <Link href="#process" className="block text-sm text-muted-foreground hover:text-foreground transition-colors px-2 py-2">How It Works</Link>
              <Link href="#pricing" className="block text-sm text-muted-foreground hover:text-foreground transition-colors px-2 py-2">Pricing</Link>
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

      {/* Hero Section */}
      <section className="py-20 sm:py-28 lg:py-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center space-y-8">
            {/* Announcement Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/20 rounded-full text-sm text-primary font-medium hover:bg-primary/20 transition-colors cursor-pointer">
              <Zap className="w-4 h-4" />
              <span>Now with AI-powered code fixes</span>
              <ArrowRight className="w-3 h-3" />
            </div>

            {/* Main Headline */}
            <div className="space-y-4">
              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-foreground leading-tight">
                Analyze Code
                <br />
                <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">With Intelligence</span>
              </h1>
              <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                Master your craft with real-time code analysis, competitive challenges, and AI-powered learning. All in one intuitive platform.
              </p>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
              <Button size="lg" asChild className="rounded-lg gap-2 group shadow-lg hover:shadow-xl text-base">
                <Link href="/auth/signup">
                  Start Free Trial
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="rounded-lg gap-2 text-base border-border/50 hover:border-border">
                <Link href="#capabilities">
                  Learn More
                </Link>
              </Button>
            </div>

            {/* Trust Badges */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-8 pt-8 border-t border-border/30">
              <div className="text-center sm:text-left">
                <p className="text-sm text-muted-foreground font-medium">Trusted by developers</p>
                <div className="flex items-center gap-2 mt-2">
                  {[...Array(5)].map((_, i) => (
                    <span key={i} className="text-yellow-500">★</span>
                  ))}
                  <span className="text-sm text-muted-foreground">4.9/5 (2,340+ reviews)</span>
                </div>
              </div>
              <div className="hidden sm:block w-px h-8 bg-border/30"></div>
              <div className="text-center sm:text-left">
                <p className="text-2xl font-bold text-foreground">10K+</p>
                <p className="text-sm text-muted-foreground">Active developers</p>
              </div>
              <div className="hidden sm:block w-px h-8 bg-border/30"></div>
              <div className="text-center sm:text-left">
                <p className="text-2xl font-bold text-foreground">1M+</p>
                <p className="text-sm text-muted-foreground">Solutions analyzed</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Capabilities Section */}
      <section id="capabilities" className="py-20 lg:py-28 border-t border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-4xl sm:text-5xl font-bold text-foreground mb-4">Powerful Features</h2>
            <p className="text-lg text-muted-foreground">Everything you need to maintain code quality at scale</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                icon: Shield,
                title: 'Security Scanning',
                description: 'Detect vulnerabilities and security hotspots in your code automatically',
              },
              {
                icon: Zap,
                title: 'AI-Powered Fixes',
                description: 'Get intelligent suggestions for fixing bugs and code smells with one click',
              },
              {
                icon: TrendingUp,
                title: 'Quality Metrics',
                description: 'Track code quality trends and maintain consistent standards across projects',
              },
              {
                icon: Cpu,
                title: 'Performance Analysis',
                description: 'Identify performance bottlenecks and get optimization recommendations',
              },
              {
                icon: Github,
                title: 'GitHub Integration',
                description: 'Seamlessly integrate with your GitHub workflow and CI/CD pipeline',
              },
              {
                icon: CheckCircle2,
                title: 'Quality Gates',
                description: 'Set custom quality thresholds and block merges that don\'t meet standards',
              },
            ].map((feature, i) => {
              const Icon = feature.icon
              return (
                <div key={i} className="p-6 border border-border/50 rounded-lg hover:border-primary/50 hover:shadow-lg transition-all duration-300 group">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                    <Icon className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">{feature.title}</h3>
                  <p className="text-muted-foreground text-sm">{feature.description}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Process Section */}
      <section id="process" className="py-20 lg:py-28 bg-gradient-to-br from-primary/10 via-transparent to-primary/5 border-t border-primary/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-4xl sm:text-5xl font-bold text-foreground mb-4">Three Simple Steps</h2>
            <p className="text-lg text-muted-foreground">Start improving your code in minutes</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { 
                number: '01', 
                title: 'Connect Your Code', 
                description: 'Link your GitHub repository or paste code directly. Integration takes less than 2 minutes.',
                icon: <GitBranch className="w-6 h-6" />
              },
              { 
                number: '02', 
                title: 'Get Instant Analysis', 
                description: 'Real-time feedback on code quality, security, and performance with actionable insights.',
                icon: <Zap className="w-6 h-6" />
              },
              { 
                number: '03', 
                title: 'Improve & Track', 
                description: 'Apply AI suggestions, compete with peers, and monitor your progress over time.',
                icon: <TrendingUp className="w-6 h-6" />
              }
            ].map((step, i) => (
              <div key={i} className="relative">
                <div className="p-6 rounded-lg border border-border/50 hover:border-primary/50 hover:shadow-lg transition-all duration-300 h-full">
                  <div className="flex items-start gap-4 mb-4">
                    <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 text-primary">
                      {step.icon}
                    </div>
                    <div>
                      <div className="text-sm font-bold text-muted-foreground">{step.number}</div>
                    </div>
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">{step.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{step.description}</p>
                </div>
                {i < 2 && <div className="hidden md:block absolute top-1/2 -right-4 w-8 h-1 bg-gradient-to-r from-primary/20 to-transparent"></div>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 lg:py-28">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-8">
          <h2 className="text-4xl sm:text-5xl font-bold text-foreground">Ready to improve your code quality?</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">Join thousands of developers who are already using CodeSpectra to analyze and improve their code.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" asChild className="rounded-lg gap-2 group shadow-lg hover:shadow-xl text-base">
              <Link href="/auth/signup">
                Start Free Trial
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="rounded-lg text-base border-border/50 hover:border-border">
              <Link href="/auth/login">Sign In</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 bg-background/50 backdrop-blur-sm py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
            <div>
              <h4 className="font-semibold text-foreground mb-4">Product</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link href="#" className="hover:text-foreground transition-colors">Features</Link></li>
                <li><Link href="#" className="hover:text-foreground transition-colors">Pricing</Link></li>
                <li><Link href="#" className="hover:text-foreground transition-colors">Security</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-foreground mb-4">Resources</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link href="#" className="hover:text-foreground transition-colors">Documentation</Link></li>
                <li><Link href="#" className="hover:text-foreground transition-colors">API Reference</Link></li>
                <li><Link href="#" className="hover:text-foreground transition-colors">Blog</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-foreground mb-4">Company</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link href="#" className="hover:text-foreground transition-colors">About</Link></li>
                <li><Link href="#" className="hover:text-foreground transition-colors">Contact</Link></li>
                <li><Link href="#" className="hover:text-foreground transition-colors">Careers</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-foreground mb-4">Legal</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link href="#" className="hover:text-foreground transition-colors">Privacy</Link></li>
                <li><Link href="#" className="hover:text-foreground transition-colors">Terms</Link></li>
                <li><Link href="#" className="hover:text-foreground transition-colors">Cookies</Link></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-border/30 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Code2 className="w-5 h-5 text-primary" />
              <span className="text-sm text-muted-foreground">© 2026 CodeSpectra. All rights reserved.</span>
            </div>
            <div className="flex gap-6">
              <Link href="#" className="text-muted-foreground hover:text-foreground transition-colors">
                <Github className="w-5 h-5" />
              </Link>
              <Link href="#" className="text-muted-foreground hover:text-foreground transition-colors">
                <Zap className="w-5 h-5" />
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
