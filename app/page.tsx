'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { ArrowRight, Code2, Zap, Shield, Cpu, GitBranch, CheckCircle2, TrendingUp, Github, Menu, X, Play, ChevronRight } from 'lucide-react'
import { CodePattern } from '@/components/code-pattern'
import { DotPattern } from '@/components/dot-pattern'
import { Globe3D } from '@/components/globe-3d'

export default function Home() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [displayedText, setDisplayedText] = useState('')
  const [currentWord, setCurrentWord] = useState(0)
  
  const words = ['create', 'build', 'scale', 'ship']

  // Text animation effect - cycles through words
  useEffect(() => {
    let charIndex = 0
    const currentFullWord = words[currentWord]
    
    const charTimer = setInterval(() => {
      if (charIndex <= currentFullWord.length) {
        setDisplayedText(currentFullWord.slice(0, charIndex))
        charIndex++
      } else {
        clearInterval(charTimer)
        // Wait 2 seconds before switching to next word
        const wordTimer = setTimeout(() => {
          setCurrentWord((prev) => (prev + 1) % words.length)
          charIndex = 0
        }, 2000)
        return () => clearTimeout(wordTimer)
      }
    }, 80)
    
    return () => clearInterval(charTimer)
  }, [currentWord])

  const stats = [
    { value: '20 days', label: 'saved on builds', company: 'NETFLIX' },
    { value: '98%', label: 'faster deployment', company: 'STRIPE' },
    { value: '300%', label: 'throughput increase', company: 'LINEAR' },
    { value: '6x', label: 'faster to ship', company: 'NOTION' },
  ]

  const capabilities = [
    {
      number: '01',
      title: 'Real-time Analysis',
      description: 'Analyze code in seconds. Our AI-powered engine detects issues, vulnerabilities, and improvements instantly as you code.',
    },
    {
      number: '02',
      title: 'AI-Native Workflows',
      description: 'Build intelligent applications with built-in AI capabilities. From inference to training, everything scales automatically.',
    },
    {
      number: '03',
      title: 'Team Collaboration',
      description: 'Work together seamlessly. Live preview, instant feedback, and version control that actually makes sense.',
    },
    {
      number: '04',
      title: 'Enterprise Security',
      description: 'Bank-grade encryption, SOC 2 compliance, and granular access controls. Your data stays yours.',
    },
  ]

  const steps = [
    {
      numeral: 'I',
      title: 'Connect your tools',
      description: 'Integrate with your existing stack in minutes. We support 200+ data sources out of the box.',
    },
    {
      numeral: 'II',
      title: 'Build your workflow',
      description: 'Design powerful automations with our visual builder or write code directly.',
    },
    {
      numeral: 'III',
      title: 'Ship to production',
      description: 'Deploy globally with zero configuration. Your app goes live in under 30 seconds.',
    },
  ]

  const integrations = [
    { name: 'GitHub', category: 'Version Control' },
    { name: 'Slack', category: 'Communication' },
    { name: 'Stripe', category: 'Payments' },
    { name: 'PostgreSQL', category: 'Database' },
    { name: 'Redis', category: 'Cache' },
    { name: 'AWS', category: 'Cloud' },
    { name: 'MongoDB', category: 'Database' },
    { name: 'Vercel', category: 'Hosting' },
    { name: 'Figma', category: 'Design' },
    { name: 'Linear', category: 'Project Management' },
    { name: 'Notion', category: 'Documentation' },
    { name: 'OpenAI', category: 'AI/ML' },
  ]

  return (
    <div className="min-h-screen bg-background text-foreground">
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
              <Link href="#capabilities" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Capabilities</Link>
              <Link href="#process" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Process</Link>
              <Link href="/pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Pricing</Link>
              <Link href="/docs" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Docs</Link>
            </div>

            {/* Auth Buttons */}
            <div className="hidden md:flex items-center gap-3">
              <Button variant="ghost" size="sm" asChild>
                <Link href="/auth/login">Sign in</Link>
              </Button>
              <Button size="sm" asChild className="gap-1.5">
                <Link href="/auth/signup">
                  Start free trial
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </Button>
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
              <Link href="#capabilities" className="block px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">Capabilities</Link>
              <Link href="#process" className="block px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">Process</Link>
              <Link href="/pricing" className="block px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">Pricing</Link>
              <div className="flex gap-2 pt-3 px-3">
                <Button variant="outline" size="sm" asChild className="flex-1">
                  <Link href="/auth/login">Sign in</Link>
                </Button>
                <Button size="sm" asChild className="flex-1">
                  <Link href="/auth/signup">Start free</Link>
                </Button>
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 lg:pt-40 lg:pb-32 overflow-hidden min-h-[90vh] flex items-center">
        {/* Code Pattern Background */}
        <div className="absolute inset-0 z-0">
          <CodePattern />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 w-full">
          <div className="max-w-4xl mx-auto text-center">
            <p className="text-sm text-muted-foreground mb-8 animate-fade-in">The platform for modern teams</p>
            
            <h1 className="text-5xl sm:text-6xl lg:text-7xl xl:text-8xl font-bold tracking-tight mb-8 leading-[1.1] text-foreground">
              The platform
              <br />
              to <span className="text-primary inline-flex items-center gap-1 min-w-[280px] sm:min-w-[350px] pb-2 border-b-4 border-primary">{displayedText}<span className="inline-block animate-pulse">|</span></span>
            </h1>
            
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-12 leading-relaxed">
              Your toolkit to stop configuring and start innovating. Securely build, deploy, and scale the best experiences.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" asChild className="h-12 px-8 text-base gap-2 rounded-full">
                <Link href="/auth/signup">
                  Start free trial
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="h-12 px-8 text-base gap-2 rounded-full">
                <Link href="#capabilities">
                  <Play className="w-4 h-4" />
                  Watch demo
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Marquee */}
      <section className="py-8 border-y border-border/40 overflow-hidden">
        <div className="flex animate-marquee gap-16">
          {[...stats, ...stats].map((stat, i) => (
            <div key={i} className="flex items-center gap-4 shrink-0">
              <div>
                <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </div>
              <span className="text-xs font-medium text-muted-foreground/60 tracking-wider">{stat.company}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Capabilities Section */}
      <section id="capabilities" className="py-24 lg:py-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-16">
            <p className="text-sm text-muted-foreground mb-3">Capabilities</p>
            <h2 className="text-4xl sm:text-5xl font-bold">
              Everything you need.
              <br />
              <span className="text-muted-foreground">Nothing you don&apos;t.</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {capabilities.map((cap) => (
              <div 
                key={cap.number} 
                className="group p-8 border border-border/40 rounded-xl hover:border-primary/40 hover:bg-primary/5 transition-all duration-300"
              >
                <span className="text-sm text-muted-foreground font-mono">{cap.number}</span>
                <h3 className="text-xl font-semibold mt-4 mb-3 group-hover:text-primary transition-colors">{cap.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{cap.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Process Section */}
      <section id="process" className="py-24 lg:py-32 border-t border-border/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-16">
            <p className="text-sm text-muted-foreground mb-3">Process</p>
            <h2 className="text-4xl sm:text-5xl font-bold">
              Three steps.
              <br />
              <span className="text-muted-foreground">Infinite possibilities.</span>
            </h2>
          </div>

          <div className="grid lg:grid-cols-2 gap-16">
            <div className="space-y-8">
              {steps.map((step, i) => (
                <div key={step.numeral} className="flex gap-6">
                  <div className="w-12 h-12 rounded-full border border-border/40 flex items-center justify-center shrink-0 text-lg font-serif text-muted-foreground">
                    {step.numeral}
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold mb-2">{step.title}</h3>
                    <p className="text-muted-foreground leading-relaxed">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Code Preview */}
            <div className="bg-card border border-border/40 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border/40">
                <span className="text-sm text-muted-foreground">workflow.ts</span>
              </div>
              <pre className="p-6 text-sm font-mono overflow-x-auto">
                <code className="text-muted-foreground">
{`import { codespectra } from '@codespectra/core'

codespectra.connect({
  source: 'your-repository',
  analyze: true,
  autoFix: true
})

// Ready to analyze`}
                </code>
              </pre>
              <div className="px-4 py-3 border-t border-border/40 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <span className="text-xs text-muted-foreground">Ready</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Infrastructure Section */}
      <section className="py-24 lg:py-32 border-t border-border/40 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Text Content */}
            <div>
              <p className="text-sm text-muted-foreground mb-3">Infrastructure</p>
              <h2 className="text-4xl sm:text-5xl font-bold">
                Global by
                <br />
                <span className="text-muted-foreground">default.</span>
              </h2>
              <p className="text-muted-foreground mt-6 max-w-xl leading-relaxed">
                Deploy once, run everywhere. Our edge network spans 17 data centers across 6 continents, delivering sub-50ms latency to 99% of the world.
              </p>

              <div className="grid grid-cols-3 gap-4 mt-10">
                <div className="text-center p-4 border border-border/40 rounded-xl bg-card/50">
                  <p className="text-3xl font-bold text-foreground">17</p>
                  <p className="text-xs text-muted-foreground mt-1">Data centers</p>
                </div>
                <div className="text-center p-4 border border-border/40 rounded-xl bg-card/50">
                  <p className="text-3xl font-bold text-foreground">99.99%</p>
                  <p className="text-xs text-muted-foreground mt-1">Uptime SLA</p>
                </div>
                <div className="text-center p-4 border border-border/40 rounded-xl bg-card/50">
                  <p className="text-3xl font-bold text-primary">&lt;50ms</p>
                  <p className="text-xs text-muted-foreground mt-1">Global latency</p>
                </div>
              </div>
            </div>

            {/* 3D Globe */}
            <div className="relative h-[400px] lg:h-[500px]">
              <div className="absolute inset-0 flex items-center justify-center">
                <Globe3D 
                  particleCount={1200}
                  globeRadius={180}
                  rotationSpeed={0.003}
                  interactive={true}
                />
              </div>
              {/* Glow effect behind globe */}
              <div className="absolute inset-0 bg-gradient-radial from-primary/10 via-transparent to-transparent pointer-events-none" />
            </div>
          </div>
        </div>
      </section>

      {/* Integrations Section */}
      <section className="py-24 lg:py-32 border-t border-border/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-sm text-muted-foreground mb-3">Integrations</p>
            <h2 className="text-4xl sm:text-5xl font-bold">
              Works with everything
              <br />
              <span className="text-muted-foreground">you already use.</span>
            </h2>
            <p className="text-muted-foreground mt-6">200+ pre-built integrations. Connect your entire stack in minutes.</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {integrations.map((integration) => (
              <div 
                key={integration.name}
                className="p-4 border border-border/40 rounded-xl text-center hover:border-primary/40 hover:bg-primary/5 transition-all duration-300"
              >
                <div className="w-10 h-10 bg-muted rounded-lg mx-auto mb-3 flex items-center justify-center">
                  <Code2 className="w-5 h-5 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium">{integration.name}</p>
                <p className="text-xs text-muted-foreground mt-1">{integration.category}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Security Section */}
      <section className="py-24 lg:py-32 border-t border-border/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-16">
            <p className="text-sm text-muted-foreground mb-3">Security</p>
            <h2 className="text-4xl sm:text-5xl font-bold">
              Trust is
              <br />
              <span className="text-muted-foreground">non-negotiable.</span>
            </h2>
            <p className="text-muted-foreground mt-6 max-w-2xl leading-relaxed">
              Enterprise-grade security isn&apos;t optional. It&apos;s built into every layer of our platform, from infrastructure to application.
            </p>
          </div>

          <div className="flex flex-wrap gap-3 mb-12">
            {['SOC 2', 'ISO 27001', 'HIPAA', 'GDPR', 'CCPA'].map((badge) => (
              <span key={badge} className="px-4 py-2 bg-muted rounded-full text-sm font-medium">{badge}</span>
            ))}
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { title: 'SOC 2 Type II', desc: 'Independently audited security controls with continuous monitoring.' },
              { title: 'End-to-end encryption', desc: 'AES-256 encryption for data at rest and TLS 1.3 in transit.' },
              { title: 'Zero-trust architecture', desc: 'Every request is authenticated and authorized. No exceptions.' },
              { title: 'GDPR & HIPAA', desc: 'Full compliance with data protection and healthcare regulations.' },
            ].map((item) => (
              <div key={item.title} className="p-6 border border-border/40 rounded-xl">
                <h3 className="font-semibold mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 lg:py-32 border-t border-border/40">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl sm:text-5xl font-bold mb-6">Ready to get started?</h2>
          <p className="text-lg text-muted-foreground mb-10 leading-relaxed">
            Join thousands of developers who are already using CodeSpectra to improve their code quality.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" asChild className="h-12 px-8 text-base gap-2">
              <Link href="/auth/signup">
                Start free trial
                <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="h-12 px-8 text-base">
              <Link href="/support">Contact sales</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 py-24 bg-background relative overflow-hidden">
        <DotPattern />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          {/* Footer Grid */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8 md:gap-12 mb-12">
            {/* Brand Column */}
            <div className="col-span-2 md:col-span-1">
              <Link href="/" className="flex items-center gap-2 mb-6">
                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                  <Code2 className="w-4 h-4 text-primary-foreground" />
                </div>
                <span className="font-semibold text-lg">CodeSpectra</span>
              </Link>
              <p className="text-sm text-muted-foreground leading-relaxed">
                The platform for modern development teams. Build, analyze, and ship with confidence.
              </p>
            </div>
            
            {/* Product Column */}
            <div>
              <h4 className="font-semibold text-foreground text-sm mb-6">Product</h4>
              <ul className="space-y-4">
                <li><Link href="#capabilities" className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200">Features</Link></li>
                <li><Link href="/pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200">Pricing</Link></li>
                <li><Link href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200">Security</Link></li>
                <li><Link href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200">Enterprise</Link></li>
              </ul>
            </div>
            
            {/* Resources Column */}
            <div>
              <h4 className="font-semibold text-foreground text-sm mb-6">Resources</h4>
              <ul className="space-y-4">
                <li><Link href="/docs" className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200">Documentation</Link></li>
                <li><Link href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200">API Reference</Link></li>
                <li><Link href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200">Blog</Link></li>
                <li><Link href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200">Changelog</Link></li>
              </ul>
            </div>
            
            {/* Company Column */}
            <div>
              <h4 className="font-semibold text-foreground text-sm mb-6">Company</h4>
              <ul className="space-y-4">
                <li><Link href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200">About</Link></li>
                <li><Link href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200">Careers</Link></li>
                <li><Link href="/support" className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200">Contact</Link></li>
              </ul>
            </div>
            
            {/* Legal Column */}
            <div>
              <h4 className="font-semibold text-foreground text-sm mb-6">Legal</h4>
              <ul className="space-y-4">
                <li><Link href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200">Privacy</Link></li>
                <li><Link href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200">Terms</Link></li>
                <li><Link href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200">Cookies</Link></li>
              </ul>
            </div>
          </div>

          {/* Footer Bottom */}
          <div className="border-t border-border/40 pt-12 flex flex-col sm:flex-row items-center justify-between gap-6">
            <p className="text-xs text-muted-foreground">
              © 2026 CodeSpectra. All rights reserved.
            </p>
            <div className="flex gap-6 items-center">
              <Link href="#" className="text-muted-foreground hover:text-foreground transition-colors duration-200">
                <Github className="w-5 h-5" />
              </Link>
              <Link href="#" className="text-muted-foreground hover:text-foreground transition-colors duration-200">
                <Code2 className="w-5 h-5" />
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
