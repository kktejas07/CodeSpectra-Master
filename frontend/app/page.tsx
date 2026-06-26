'use client'

import Link from 'next/link'
import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { NavThemeSwitch } from '@/components/nav-theme-switch'
import { cn } from '@/lib/utils'
import { ArrowRight, Code2, Github, Menu, X, Library } from 'lucide-react'
import { AnimatedDotCanvas } from '@/components/animated-dot-canvas'
import { Globe3D } from '@/components/globe-3d'
import { PlatformWorkspaceIllustration } from '@/components/landing/platform-workspace-illustration'
import { FooterAnimatedBackdrop } from '@/components/landing/footer-animated-backdrop'
import { CapabilityIllustration } from '@/components/landing/capability-illustration'
import { ProcessShowcase, type ProcessStep } from '@/components/landing/process-showcase'
import { useHasSupabaseSession } from '@/hooks/use-has-supabase-session'

type Capability = { number: string; title: string; description: string }

const NAV_SCROLL_THRESHOLD = 32
const DASHBOARD_HREF = '/dashboard'

export default function Home() {
  const hasSession = useHasSupabaseSession()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [navScrolled, setNavScrolled] = useState(false)
  const [displayedText, setDisplayedText] = useState('')
  const [currentWord, setCurrentWord] = useState(0)

  const updateNavScroll = useCallback(() => {
    setNavScrolled(window.scrollY > NAV_SCROLL_THRESHOLD)
  }, [])

  useEffect(() => {
    updateNavScroll()
    window.addEventListener('scroll', updateNavScroll, { passive: true })
    return () => window.removeEventListener('scroll', updateNavScroll)
  }, [updateNavScroll])
  
  const words = ['analyze', 'practice', 'learn', 'certify']
  const widestWord = words.reduce((a, b) => (a.length >= b.length ? a : b))

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

  const productHighlights = [
    { title: 'Code scanner', subtitle: 'Scan your projects, see issues, and track quality over time' },
    { title: 'Guidance & AI assist', subtitle: 'Explanations, fixes, and suggestions for errors and smells' },
    { title: 'Challenges & arena', subtitle: 'Practice problems and competitive coding flows' },
    { title: 'Learning & exams', subtitle: 'Structured lessons, progress, and timed assessments' },
    { title: 'Interview training', subtitle: 'Dynamic interviews, feedback, and resume tools' },
    { title: 'Certificates & jobs', subtitle: 'Credentials, listings, and applications in one place' },
  ]

  const capabilities: Capability[] = [
    {
      number: '01',
      title: 'Understand the code you write',
      description:
        'Run scans on your work, review findings by severity, and use quality gates so you learn what to fix before it ships.',
    },
    {
      number: '02',
      title: 'Practice until it sticks',
      description:
        'Work through challenges, join arena-style sessions, and climb the leaderboard as you sharpen problem-solving skills.',
    },
    {
      number: '03',
      title: 'Learn with structure',
      description:
        'Follow learning paths, take exams to validate knowledge, and see your progress as you grow from lesson to lesson.',
    },
    {
      number: '04',
      title: 'Prepare for real interviews',
      description:
        'Train with dynamic interviews, capture feedback, polish your resume, explore roles, and earn certificates that reflect what you completed.',
    },
  ]

  const processSteps: ProcessStep[] = [
    {
      numeral: 'I',
      title: 'Join with your account',
      description:
        'Sign up with email or Google, then land in your dashboard where every learning and tooling module is available in one place.',
      filename: 'codespectra.config.ts',
      code: `import { createSession } from '@codespectra/auth'

export async function bootstrap() {
  const session = await createSession({ provider: 'google' })
  return { target: 'dashboard', regions: ['auto'] }
  // Ready in one flow — no boilerplate tour required
}`,
      footerStatus: 'Ready to learn',
    },
    {
      numeral: 'II',
      title: 'Bring your GitHub work (optional)',
      description:
        'Connect GitHub when you want repository context for scans and integrations—so guidance matches the code you actually maintain.',
      filename: 'github/link.ts',
      code: `export async function linkRepositories() {
  const res = await fetch('/api/github/integration', { method: 'GET' })
  const data = await res.json()
  if (!data.ok) throw new Error('Connect GitHub in settings first')
  return data.repos.slice(0, 12) // prioritize recent activity
}`,
      footerStatus: 'Repos linked',
    },
    {
      numeral: 'III',
      title: 'Scan, fix, and level up',
      description:
        'Open the scanner or analyzer flows to submit code, read issues, request AI-assisted fixes, and save lessons back into your journey.',
      filename: 'workflow.ts',
      code: `export async function analyzeAndShip() {
  const report = await fetch('/api/analyze-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: 'export const ship = true',
      language: 'typescript',
    }),
  }).then((r) => r.json())

  return { status: 'production', score: report.score ?? 94 }
}`,
      footerStatus: 'Insights returned',
    },
  ]

  const integrations = [
    { name: 'GitHub', category: 'Connect your repositories' },
    { name: 'Google', category: 'Sign in with Google' },
    { name: 'Stripe', category: 'Plans & checkout' },
    { name: 'Slack', category: 'Notifications' },
    { name: 'OpenAI', category: 'AI explanations & fixes' },
    { name: 'Supabase', category: 'Secure accounts & data' },
  ]

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Navigation — full-width glass at top; scrolled = floating centered pill (md+) */}
      <nav
        className={cn(
          'fixed left-0 right-0 top-0 z-50 transition-all duration-500 ease-out',
          navScrolled || mobileMenuOpen
            ? 'bg-transparent pt-3 md:pt-4'
            : 'border-b border-transparent bg-background/35 backdrop-blur-md supports-backdrop-filter:bg-background/25'
        )}
      >
        <div
          className={cn(
            'mx-auto transition-all duration-500',
            navScrolled || mobileMenuOpen
              ? 'max-w-7xl px-3 sm:px-4 md:max-w-4xl md:px-4 lg:max-w-5xl xl:max-w-6xl'
              : 'max-w-7xl px-4 sm:px-6 lg:px-8'
          )}
        >
          <div
            className={cn(
              /* Mobile: two columns. md+: grid so center links never overlap theme / CTAs */
              'relative flex items-center justify-between gap-2 transition-all duration-500 sm:gap-3 md:grid md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center md:justify-normal md:gap-x-2 md:gap-y-0 lg:gap-x-4',
              navScrolled || mobileMenuOpen
                ? cn(
                    'min-h-[52px] border-b border-border/50 bg-background/92 py-2.5 shadow-sm backdrop-blur-xl supports-backdrop-filter:bg-background/88',
                    'md:rounded-full md:border md:border-border/55 md:bg-background/80 md:py-2 md:shadow-[0_8px_30px_-8px_rgba(0,0,0,0.12)] md:backdrop-blur-xl dark:md:border-border/50 dark:md:shadow-[0_8px_32px_-8px_rgba(0,0,0,0.45)]',
                    'md:border-b-0 md:px-4 md:py-2.5 lg:px-6 xl:px-7'
                  )
                : 'h-16 border-b border-transparent bg-transparent'
            )}
          >
            <Link
              href="/"
              className="group relative z-10 flex min-w-0 shrink-0 items-center gap-2 transition-all duration-500 md:justify-self-start"
              onClick={() => setMobileMenuOpen(false)}
            >
              <div
                className={cn(
                  'flex items-center justify-center rounded-lg bg-primary shadow-primary/25 transition-all duration-500',
                  navScrolled || mobileMenuOpen ? 'h-7 w-7 shadow-sm md:h-8 md:w-8' : 'h-8 w-8 shadow-sm'
                )}
              >
                <Code2
                  className={cn(
                    'text-primary-foreground transition-all duration-500',
                    navScrolled || mobileMenuOpen ? 'h-3.5 w-3.5 md:h-4 md:w-4' : 'h-4 w-4'
                  )}
                />
              </div>
              <span
                className={cn(
                  'font-semibold tracking-tight text-foreground transition-all duration-500',
                  navScrolled || mobileMenuOpen ? 'text-base md:text-lg' : 'text-[15px] sm:text-base'
                )}
              >
                CodeSpectra
                <sup className="ml-0.5 mt-0.5 font-mono text-[10px] font-medium text-muted-foreground transition-all duration-500">
                  TM
                </sup>
              </span>
            </Link>

            <nav
              className="hidden min-w-0 items-center justify-center justify-self-stretch md:flex"
              aria-label="Primary"
            >
              <div className="flex max-w-full flex-wrap items-center justify-center gap-x-4 gap-y-1 sm:gap-x-5 md:gap-x-4 lg:gap-x-6 xl:gap-x-8">
                {(
                  [
                    { href: '#capabilities', label: 'Features' },
                    { href: '#how-it-works', label: 'How it works' },
                    { href: '#integrations', label: 'Integrations' },
                    { href: '/pricing', label: 'Pricing' },
                  ] as const
                ).map(({ href, label }) => (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      'group relative shrink-0 whitespace-nowrap text-sm transition-colors duration-300',
                      navScrolled || mobileMenuOpen
                        ? 'text-foreground/70 hover:text-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {label}
                    <span
                      className="absolute -bottom-1 left-0 h-px w-0 bg-foreground transition-all duration-300 group-hover:w-full"
                      aria-hidden
                    />
                  </Link>
                ))}
              </div>
            </nav>

            <div className="relative z-10 flex shrink-0 items-center justify-end gap-2 md:justify-self-end md:gap-2 lg:gap-3">
              <NavThemeSwitch compact className="shrink-0" />
              <div className="hidden items-center gap-2 md:flex lg:gap-3">
                {hasSession ? (
                  <Button
                    size="sm"
                    asChild
                    className={cn(
                      'h-8 shrink-0 gap-1.5 rounded-full bg-primary px-3 text-xs font-medium text-primary-foreground shadow-sm transition-all duration-500 hover:bg-primary/90 sm:px-4',
                      (navScrolled || mobileMenuOpen) && 'md:shadow-md'
                    )}
                  >
                    <Link href={DASHBOARD_HREF}>
                      Go to dashboard
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                ) : (
                  <>
                    <Link
                      href="/auth/login"
                      className={cn(
                        'shrink-0 transition-all duration-500 hover:text-foreground',
                        navScrolled || mobileMenuOpen ? 'text-xs text-foreground/70' : 'text-sm text-muted-foreground'
                      )}
                    >
                      Sign in
                    </Link>
                    <Button
                      size="sm"
                      asChild
                      className={cn(
                        'h-8 shrink-0 gap-1.5 rounded-full bg-primary px-3 text-xs font-medium text-primary-foreground shadow-sm transition-all duration-500 hover:bg-primary/90 sm:px-4',
                        (navScrolled || mobileMenuOpen) && 'md:shadow-md'
                      )}
                    >
                      <Link href="/auth/signup">
                        Get started
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className={cn(
                  'rounded-lg p-2 transition-colors md:hidden',
                  navScrolled || mobileMenuOpen ? 'hover:bg-muted/80' : 'hover:bg-muted'
                )}
                aria-expanded={mobileMenuOpen}
                aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              >
                {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </button>
            </div>
          </div>

          {/* Mobile Menu */}
          {mobileMenuOpen && (
            <div
              className={cn(
                'space-y-1 border-t py-4 md:hidden',
                navScrolled ? 'border-border/50 bg-background/95 backdrop-blur-md' : 'border-border/40'
              )}
            >
              <Link href="#capabilities" className="block px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">Features</Link>
              <Link href="#how-it-works" className="block px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">How it works</Link>
              <Link href="#integrations" className="block px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">Integrations</Link>
              <Link href="/pricing" className="block px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">Pricing</Link>
              <div className="flex gap-2 pt-3 px-3">
                {hasSession ? (
                  <Button size="sm" asChild className="w-full gap-1">
                    <Link href={DASHBOARD_HREF}>
                      Go to dashboard
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                ) : (
                  <>
                    <Button variant="outline" size="sm" asChild className="flex-1">
                      <Link href="/auth/login">Sign in</Link>
                    </Button>
                    <Button size="sm" asChild className="flex-1">
                      <Link href="/auth/signup">Get started</Link>
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* Hero — 3D globe backdrop only (no code-letter canvas); copy on top */}
      <section className="relative isolate overflow-hidden pt-28 pb-20 lg:pt-36 lg:pb-28 min-h-[90vh] flex items-center">
        {/* Globe fills the hero frame responsively (square bounded by viewport) */}
        <div
          className="absolute inset-0 z-0 flex items-center justify-center pointer-events-none select-none px-4 pb-8 pt-20 sm:px-6 sm:pt-24 lg:px-8"
          aria-hidden
        >
          <div className="relative aspect-square w-[min(94vw,calc(100dvh-11rem),880px)] sm:w-[min(92vw,calc(100dvh-10rem),900px)] lg:w-[min(88vw,min(82dvh,920px))] max-h-[min(82dvh,920px)] max-w-full opacity-90 dark:opacity-100">
            <Globe3D
              particleCount={1100}
              dotRadius={4.25}
              rotationSpeed={0.00011}
              radiusFactor={0.7}
              fieldOfViewFactor={0.8}
              interactive={false}
              fillContainer
            />
          </div>
        </div>

        {/* Soft scrim — keeps text readable while letting the globe shine through */}
        <div
          className="absolute inset-0 z-1 bg-linear-to-b from-background/40 via-background/10 to-background/55 dark:from-background/35 dark:via-background/5 dark:to-background/50 pointer-events-none"
          aria-hidden
        />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 w-full">
          <div className="max-w-4xl mx-auto text-center">
            <p className="text-sm text-muted-foreground mb-8 animate-fade-in drop-shadow-sm">
              Learn, scan, fix, and interview—with guidance and AI support in one workspace
            </p>

            <h1 className="text-5xl sm:text-6xl lg:text-7xl xl:text-8xl font-bold tracking-tight mb-8 leading-[1.1] text-foreground [text-shadow:0_0_48px_var(--background),0_2px_16px_var(--background)]">
              The platform
              <br />
              to{' '}
              <span className="text-primary inline-grid justify-items-center mx-auto">
                <span
                  className="col-start-1 row-start-1 invisible pointer-events-none select-none"
                  aria-hidden
                >
                  {widestWord}
                </span>
                <span className="col-start-1 row-start-1 inline-flex items-center gap-1 justify-self-center pb-2 border-b-4 border-primary">
                  {displayedText}
                  <span className="inline-block animate-pulse">|</span>
                </span>
              </span>
            </h1>

            <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-12 leading-relaxed [text-shadow:0_0_36px_var(--background),0_1px_10px_var(--background)]">
              CodeSpectra gives you access to tools that help you learn: scan the code you build, understand errors and
              issues, get AI-assisted fixes, practice in challenges and arenas, follow courses and exams, train for interviews,
              manage resumes, earn certificates, and explore roles—all from your account.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" asChild className="h-12 px-8 text-base gap-2 rounded-full shadow-lg shadow-background/20">
                <Link href={hasSession ? DASHBOARD_HREF : '/auth/signup'}>
                  {hasSession ? 'Go to dashboard' : 'Get started free'}
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="h-12 px-8 text-base gap-2 rounded-full bg-background/60 backdrop-blur-sm">
                <Link href="/features">
                  <Library className="w-4 h-4" />
                  Browse features
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Scrolling highlights — full-width animated dot canvas band */}
      <section className="relative h-64 overflow-hidden border-b border-border/40 bg-muted/5 dark:bg-muted/10">
        <div className="pointer-events-none absolute inset-0 z-0 opacity-20 dark:opacity-[0.17]">
          <AnimatedDotCanvas className="h-full w-full" spacing={22} />
        </div>
        <div className="relative z-10 flex h-full items-center animate-marquee gap-16 px-1 py-6">
          {[...productHighlights, ...productHighlights].map((item, i) => (
            <div key={i} className="flex items-center gap-4 shrink-0 min-w-[220px]">
              <div>
                <p className="text-xl font-bold text-foreground">{item.title}</p>
                <p className="text-sm text-muted-foreground">{item.subtitle}</p>
              </div>
              <span className="text-xs font-medium text-muted-foreground/60 tracking-wider uppercase">Included</span>
            </div>
          ))}
        </div>
      </section>

      {/* Capabilities — Optimus-style stacked rows (blue / gray / black on white) */}
      <section id="capabilities" className="scroll-mt-24 border-b border-border/40 py-24 lg:py-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-14 max-w-3xl lg:mb-20">
            <span className="mb-6 inline-flex items-center gap-3 font-mono text-sm text-muted-foreground">
              <span className="h-px w-8 bg-border" />
              Capabilities
            </span>
            <h2 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              Everything you need.
              <br />
              <span className="text-muted-foreground">Nothing you don&apos;t.</span>
            </h2>
          </div>

          <div className="mx-auto max-w-5xl divide-y divide-border/60">
            {capabilities.map((cap) => (
              <div
                key={cap.number}
                className="grid gap-8 py-12 first:pt-0 md:grid-cols-[minmax(0,auto)_1fr_auto] md:items-start md:gap-10 md:py-14"
              >
                <span className="pt-1 font-mono text-sm tabular-nums text-muted-foreground">{cap.number}</span>
                <div className="min-w-0">
                  <h3 className="text-2xl font-semibold tracking-tight text-foreground transition-colors hover:text-primary md:text-3xl">
                    {cap.title}
                  </h3>
                  <p className="mt-3 max-w-2xl leading-relaxed text-muted-foreground md:mt-4">{cap.description}</p>
                </div>
                <div className="flex shrink-0 justify-start md:justify-end md:pt-1">
                  <CapabilityIllustration
                    variant={cap.number as '01' | '02' | '03' | '04'}
                    className="h-16 w-24 opacity-90 md:h-18 md:w-28"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <ProcessShowcase steps={processSteps} />

      {/* Platform — copy + SVG side by side from md; stats full width below */}
      <section className="overflow-hidden border-t border-border/40 py-24 lg:py-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p className="mb-6 text-sm text-muted-foreground md:mb-8">Platform</p>

          <div className="grid grid-cols-1 items-start gap-8 min-[480px]:grid-cols-[minmax(0,1fr)_min(42%,200px)] min-[480px]:gap-6 md:grid-cols-[minmax(0,1fr)_min(40%,min(340px,38vw))] md:gap-10 lg:gap-14">
            <div className="min-w-0">
              <h2 className="text-4xl font-bold sm:text-5xl">
                Built for learners
                <br />
                <span className="text-muted-foreground">and serious practice.</span>
              </h2>
              <p className="mt-5 max-w-xl leading-relaxed text-muted-foreground md:mt-6">
                Your progress, scans, courses, interviews, and certificates stay tied to your account. The experience is
                delivered through a modern web app with secure sign-in, dedicated dashboards for each area, and integrations
                like GitHub when you want your real projects in the loop.
              </p>
            </div>

            <div className="flex w-full min-w-0 justify-center min-[480px]:justify-end min-[480px]:pt-1 md:pt-0">
              <div
                className="pointer-events-none capability-reveal w-full max-w-[220px] opacity-95 min-[480px]:max-w-[240px] md:max-w-[min(360px,100%)] lg:max-w-md"
                style={{ animationDelay: '100ms' }}
              >
                <PlatformWorkspaceIllustration className="mx-auto min-[480px]:mx-0" />
              </div>
            </div>
          </div>

          <div className="mx-auto mt-10 grid w-full max-w-3xl grid-cols-1 gap-4 sm:max-w-4xl sm:grid-cols-3 md:mt-12 lg:max-w-5xl">
            <div className="flex h-full flex-col items-center justify-center rounded-xl border border-border/40 bg-card/50 p-5 text-center">
              <p className="text-2xl font-bold text-foreground">One login</p>
              <p className="mt-1 text-xs text-muted-foreground">Scanner, learning, interviews & more</p>
            </div>
            <div className="flex h-full flex-col items-center justify-center rounded-xl border border-border/40 bg-card/50 p-5 text-center">
              <p className="text-2xl font-bold text-foreground">Guided quality</p>
              <p className="mt-1 text-xs text-muted-foreground">Issues, gates, and AI-assisted fixes</p>
            </div>
            <div className="flex h-full flex-col items-center justify-center rounded-xl border border-border/40 bg-card/50 p-5 text-center">
              <p className="text-2xl font-bold text-primary">Career prep</p>
              <p className="mt-1 text-xs text-muted-foreground">Certs, roles, and interview training</p>
            </div>
          </div>
        </div>
      </section>

      {/* Integrations Section */}
      <section id="integrations" className="py-24 lg:py-32 border-t border-border/40 scroll-mt-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-sm text-muted-foreground mb-3">Integrations</p>
            <h2 className="text-4xl sm:text-5xl font-bold">
              Connect the services
              <br />
              <span className="text-muted-foreground">you already rely on.</span>
            </h2>
            <p className="text-muted-foreground mt-6 max-w-2xl mx-auto">
              When you link accounts, CodeSpectra can use GitHub for repos, Google for easier sign-in, Stripe for plans,
              Slack for notifications, and AI models for explanations and suggested fixes—so the tools feel familiar.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-6 gap-4 max-w-4xl mx-auto">
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
      <section id="trust" className="scroll-mt-24 border-t border-border/40 py-24 lg:py-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-16">
            <p className="text-sm text-muted-foreground mb-3">Security & access</p>
            <h2 className="text-4xl sm:text-5xl font-bold">
              Your work stays
              <br />
              <span className="text-muted-foreground">in the right hands.</span>
            </h2>
            <p className="text-muted-foreground mt-6 max-w-2xl leading-relaxed">
              Accounts are protected with secure sign-in, dashboard areas require an active session, and team or admin roles
              control who can change sensitive settings. Third-party connections (like GitHub or AI providers) only run with the
              permissions you approve.
            </p>
          </div>

          <div className="flex flex-wrap gap-3 mb-12">
            {['Secure sign-in', 'Session-aware dashboards', 'Role-based access', 'Controlled integrations'].map((badge) => (
              <span key={badge} className="px-4 py-2 bg-muted rounded-full text-sm font-medium">
                {badge}
              </span>
            ))}
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                title: 'Private workspace',
                desc: 'Your scanner history, courses, interview sessions, and applications are tied to your account and protected routes.',
              },
              {
                title: 'Roles that match reality',
                desc: 'Learners, tenant admins, and platform admins each see the tools appropriate to their role—so guidance stays scoped.',
              },
              {
                title: 'OAuth when you want it',
                desc: 'Connect GitHub or Google from the auth screens so sign-in and repo context stay convenient without sharing passwords.',
              },
              {
                title: 'Data handled responsibly',
                desc: 'Structured storage and access rules back the features you use, so scans and coursework stay organized and retrievable.',
              },
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
          <h2 className="text-4xl sm:text-5xl font-bold mb-6 tracking-tight">
            Start using
            <br />
            <span className="text-muted-foreground">the full toolkit.</span>
          </h2>
          <p className="text-lg text-muted-foreground mb-10 leading-relaxed">
            {hasSession
              ? "You're signed in—open your dashboard to pick up scanning, courses, interviews, and everything tied to your account."
              : 'Create your CodeSpectra account to access scanning, learning paths, AI-assisted guidance, interview practice, certificates, and career tools—built for people who want to learn, improve, and show what they can do.'}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" asChild className="h-12 px-8 text-base gap-2 rounded-full">
              <Link href={hasSession ? DASHBOARD_HREF : '/auth/signup'}>
                {hasSession ? 'Go to dashboard' : 'Get started free'}
                <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="h-12 px-8 text-base rounded-full">
              <Link href="/contact">Questions? Contact us</Link>
            </Button>
          </div>
          <p className="text-sm text-muted-foreground mt-6">
            Your account unlocks the scanners, lessons, interview trainers, and certificate flows described above.
          </p>
        </div>
      </section>

      {/* Footer — link columns + drifting circles + dot field (Optimus-style mood) */}
      <footer className="relative overflow-hidden border-t border-border/40 bg-muted/15 py-20 dark:bg-muted/10 lg:py-24">
        <FooterAnimatedBackdrop />
        <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
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
                CodeSpectra helps you learn and improve: scan your code, fix issues with guidance and AI support, practice
                challenges, take courses and exams, train for interviews, earn certificates, and explore opportunities.
              </p>
            </div>
            
            {/* Product Column */}
            <div>
              <h4 className="font-semibold text-foreground text-sm mb-6">Product</h4>
              <ul className="space-y-4">
                <li><Link href="/features" className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200">Features</Link></li>
                <li><Link href="#how-it-works" className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200">How it works</Link></li>
                <li><Link href="/pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200">Pricing</Link></li>
                <li><Link href="/security" className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200">Security</Link></li>
                <li><Link href="#trust" className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200">Trust on platform</Link></li>
              </ul>
            </div>
            
            {/* Resources Column */}
            <div>
              <h4 className="font-semibold text-foreground text-sm mb-6">Resources</h4>
              <ul className="space-y-4">
                <li><Link href="/docs" className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200">Documentation</Link></li>
                <li><Link href="/api-reference" className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200">API reference</Link></li>
                <li><Link href="/faq" className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200">FAQ</Link></li>
                <li><Link href="/blog" className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200">Blog</Link></li>
                <li><Link href="/support" className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200">Support</Link></li>
                <li><Link href="/dashboard/scanner?mode=manual" className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200">Scanner (signed in)</Link></li>
              </ul>
            </div>
            
            {/* Company Column */}
            <div>
              <h4 className="font-semibold text-foreground text-sm mb-6">Company</h4>
              <ul className="space-y-4">
                <li><Link href="/about" className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200">About</Link></li>
                <li><Link href="/contact" className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200">Contact</Link></li>
                <li><Link href="/careers" className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200">Careers</Link></li>
              </ul>
            </div>
            
            {/* Legal Column */}
            <div>
              <h4 className="font-semibold text-foreground text-sm mb-6">Legal</h4>
              <ul className="space-y-4">
                <li><Link href="/privacy" className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200">Privacy</Link></li>
                <li><Link href="/terms" className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200">Terms</Link></li>
                <li><Link href="/cookies" className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200">Cookies</Link></li>
              </ul>
            </div>
          </div>

          {/* Footer Bottom */}
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
                <a
                  href="https://github.com/Devender0077/CodeSpectra-Master"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground transition-colors duration-200 hover:text-foreground"
                  aria-label="CodeSpectra on GitHub"
                >
                  <Github className="h-5 w-5" />
                </a>
                <Link
                  href="/docs"
                  className="text-muted-foreground transition-colors duration-200 hover:text-foreground"
                  aria-label="Documentation"
                >
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
