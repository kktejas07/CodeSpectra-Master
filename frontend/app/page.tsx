'use client'

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ArrowRight, Code2, Library, GitBranch, GraduationCap, Braces } from 'lucide-react'
import { Github, Chrome, Slack } from '@/components/ui/brand-icons'
import { AnimatedDotCanvas } from '@/components/animated-dot-canvas'
import { Globe3D } from '@/components/globe-3d'
import { PlatformWorkspaceIllustration } from '@/components/landing/platform-workspace-illustration'
import { CapabilitiesFlow } from '@/components/landing/capabilities-flow'
import { ProcessShowcase, type ProcessStep } from '@/components/landing/process-showcase'
import { PipelineFlow } from '@/components/landing/pipeline-flow'
import { useHasUserSession } from '@/hooks/use-has-user-session'
import { PublicPageWrapper, DASHBOARD_HREF } from '@/app/public-layout'
import { FloatingCodeParticles } from '@/components/landing/floating-code-particles'
import { NewsletterSubscribe } from '@/components/landing/newsletter-subscribe'
import { TiltCard } from '@/components/ui/tilt-card'
import { useScrollReveal } from '@/hooks/use-scroll-reveal'
import {
  IsometricModelGraphic,
  IsometricClusterGraphic,
  IsometricComputeGraphic,
  PostgresStackIllustration,
  ComputeChipIllustration,
} from '@/components/landing/prisma-vectors'
import { TechStackSection } from '@/components/landing/tech-stack-section'

export default function Home() {
  const hasSession = useHasUserSession()

  // Reset loading screen when page is restored from bfcache (browser back/forward cache)
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      // bfcache reload — let loading wrapper re-mount
    }
    window.addEventListener('pageshow', onShow)
    return () => window.removeEventListener('pageshow', onShow)
  }, [])
  const [displayedText, setDisplayedText] = useState('')
  const [currentWord, setCurrentWord] = useState(0)

  const platformRef = useScrollReveal<HTMLDivElement>()
  const integrationsRef = useScrollReveal<HTMLDivElement>({ staggerDelay: 120 })
  const trustRef = useScrollReveal<HTMLDivElement>({ staggerDelay: 150 })
  const ctaRef = useScrollReveal<HTMLDivElement>()
  
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
    { title: 'Learning & assessments', subtitle: 'Structured lessons, progress, and timed assessments' },
    { title: 'Interview training', subtitle: 'Dynamic interviews, feedback, and resume tools' },
    { title: 'Certificates & jobs', subtitle: 'Credentials, listings, and applications in one place' },
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
    { name: 'GitHub', category: 'Connect repositories & PRs', icon: Github },
    { name: 'GitLab', category: 'Connect repositories & merge requests', icon: GitBranch },
    { name: 'Google', category: 'Sign in with Google', icon: Chrome },
    { name: 'Slack', category: 'Notifications & alerts', icon: Slack },
    { name: 'VS Code', category: 'IDE extension for scans', icon: Braces },
    { name: 'JetBrains', category: 'IDE plugin for inspections', icon: GraduationCap },
  ]

  const integrationIcons: Record<string, React.ElementType> = {
    GitHub: Github,
    GitLab: GitBranch,
    Google: Chrome,
    Slack: Slack,
    'VS Code': Braces,
    JetBrains: GraduationCap,
  }

  return (
    <PublicPageWrapper>

      {/* Hero — 3D globe backdrop with code particles overlay */}
      <section className="relative isolate overflow-hidden pt-28 pb-20 lg:pt-36 lg:pb-28 min-h-[90vh] flex items-center">
        {/* Floating code particles floating in the background behind globe */}
        <FloatingCodeParticles count={22} />

        {/* Globe fills the hero frame responsively */}
        <div
          className="absolute inset-0 z-1 flex items-center justify-center pointer-events-none select-none px-4 pb-8 pt-20 sm:px-6 sm:pt-24 lg:px-8"
          aria-hidden
        >
          <div className="relative aspect-square w-[min(94vw,calc(100dvh-11rem),880px)] sm:w-[min(92vw,calc(100dvh-10rem),900px)] lg:w-[min(88vw,min(82dvh,920px))] max-h-[min(82dvh,920px)] max-w-full opacity-90 dark:opacity-100">
            <Globe3D
              particleCount={1200}
              dotRadius={4.25}
              rotationSpeed={0.00011}
              radiusFactor={0.8}
              fieldOfViewFactor={0.85}
              interactive={false}
              parallaxIntensity={6}
              fillContainer
            />
          </div>
        </div>

        {/* Soft scrim — keeps text readable while letting the globe shine through */}
        <div
          className="absolute inset-0 z-2 bg-linear-to-b from-background/40 via-background/10 to-background/55 dark:from-background/35 dark:via-background/5 dark:to-background/50 pointer-events-none"
          aria-hidden
        />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 w-full">
          <div className="max-w-4xl mx-auto text-center">
            <h1
              data-reveal
              data-revealed="true"
              className="text-5xl sm:text-6xl lg:text-7xl xl:text-8xl font-black tracking-tight mb-6 leading-[1.02] text-white [text-shadow:0_0_64px_rgba(0,197,115,0.15)]"
              style={{ transitionDelay: '120ms' }}
            >
              Agent Infrastructure
              <br />
              <span className="text-white">for TypeScript</span>
            </h1>

            <p
              data-reveal
              data-revealed="true"
              className="text-lg sm:text-xl text-slate-300 max-w-2xl mx-auto mb-10 leading-relaxed font-normal"
              style={{ transitionDelay: '240ms' }}
            >
              Build, deploy, and iterate end-to-end in one conversation, with
              ORM, Postgres, and Compute designed to work together natively.
            </p>

            <div
              data-reveal
              data-revealed="true"
              className="flex flex-col sm:flex-row gap-4 justify-center items-center"
              style={{ transitionDelay: '360ms' }}
            >
              <Link
                href={hasSession ? DASHBOARD_HREF : '/auth/signup'}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-mint-pulse hover:bg-[#3ecf8e] text-slate-950 font-bold px-8 py-3.5 text-base transition-all shadow-xl shadow-mint-pulse/20 hover:shadow-mint-pulse/40 hover:scale-[1.02]"
              >
                {hasSession ? 'Go to dashboard' : 'Try CodeSpectra'}
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>

        {/* Subtle bottom fade */}
        <div className="absolute bottom-0 left-0 right-0 h-24 bg-linear-to-t from-background to-transparent z-10 pointer-events-none" />
      </section>

      {/* One platform section (Prisma path showcase) */}
      <section className="relative border-t border-slate-800/80 bg-[#080c14] py-24 lg:py-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-4xl sm:text-5xl font-black text-white tracking-tight mb-4">
              One platform for the full TypeScript path.
            </h2>
            <p className="text-base sm:text-lg text-slate-300 leading-relaxed">
              Start with <strong className="text-white underline decoration-teal-500 underline-offset-4">Prisma ORM</strong> for type-safe database access, add <strong className="text-white underline decoration-teal-500 underline-offset-4">Prisma Postgres</strong> for managed PostgreSQL, and deploy TypeScript apps for APIs and AI agents on <strong className="text-white underline decoration-teal-500 underline-offset-4">Prisma Compute</strong>.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
            {/* Card 1: Schema to client */}
            <div className="group relative rounded-2xl border border-slate-800 bg-[#0d131f]/90 p-6 sm:p-8 flex flex-col justify-between overflow-hidden hover:border-teal-500/50 transition-all duration-300 min-h-85">
              <div>
                <div className="flex items-center justify-between gap-2 mb-4">
                  <h3 className="text-xl font-bold text-white">Schema to client</h3>
                  <span className="inline-flex items-center gap-1 bg-teal-950/80 text-teal-400 border border-teal-800/60 px-2.5 py-0.5 rounded-md text-[11px] font-mono font-semibold uppercase">
                    &lt;/&gt; MODEL
                  </span>
                </div>
                <p className="text-sm text-slate-300 leading-relaxed mb-6">
                  Define once, generate the primitives your app uses every day.
                </p>
              </div>

              {/* Vector Graphic */}
              <IsometricModelGraphic />
            </div>

            {/* Card 2: Postgres for modern deploys */}
            <div className="group relative rounded-2xl border border-slate-800 bg-[#0d131f]/90 p-6 sm:p-8 flex flex-col justify-between overflow-hidden hover:border-teal-500/50 transition-all duration-300 min-h-85">
              <div>
                <div className="flex items-center justify-between gap-2 mb-4">
                  <h3 className="text-xl font-bold text-white">Postgres for modern deploys</h3>
                  <span className="inline-flex items-center gap-1 bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 px-2.5 py-0.5 rounded-md text-[11px] font-mono font-semibold uppercase">
                    STORE
                  </span>
                </div>
                <p className="text-sm text-slate-300 leading-relaxed mb-6">
                  Standard PostgreSQL, pooling included, ready for production.
                </p>
              </div>

              {/* Vector Graphic */}
              <IsometricClusterGraphic />
            </div>

            {/* Card 3: Compute for your app */}
            <div className="group relative rounded-2xl border border-slate-800 bg-[#0d131f]/90 p-6 sm:p-8 flex flex-col justify-between overflow-hidden hover:border-teal-500/50 transition-all duration-300 min-h-85">
              <div>
                <div className="flex items-center justify-between gap-2 mb-4">
                  <h3 className="text-xl font-bold text-white">Compute for your app</h3>
                  <span className="inline-flex items-center gap-1 bg-cyan-950/80 text-cyan-400 border border-cyan-800/60 px-2.5 py-0.5 rounded-md text-[11px] font-mono font-semibold uppercase">
                    RUN
                  </span>
                </div>
                <p className="text-sm text-slate-300 leading-relaxed mb-6">
                  Deploy TypeScript apps with fewer serverless constraints.
                </p>
              </div>

              {/* Vector Graphic */}
              <IsometricComputeGraphic />
            </div>
          </div>
        </div>
      </section>

      {/* Managed Postgres & Compute Product Feature Showcase (Prisma Screenshot 1 layout) */}
      <section className="relative border-t border-slate-800/80 bg-[#050810] py-24 lg:py-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-20 lg:space-y-28">
          {/* Row 1: Prisma Postgres */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            {/* Left: 3D Cylinder Disk Towers */}
            <PostgresStackIllustration />

            {/* Right: Copy & Text */}
            <div>
              <span className="text-xs font-mono font-bold text-teal-400 tracking-widest uppercase mb-3 block">
                PRISMA POSTGRES
              </span>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight mb-5 leading-tight">
                Managed Postgres for modern deployments.
              </h2>
              <p className="text-slate-300 text-base sm:text-lg leading-relaxed">
                Prisma Postgres gives you standard PostgreSQL with built-in pooling and support for modern deployment environments. Use it on its own, or pair it with Prisma ORM and Prisma Compute for a more integrated experience.
              </p>
            </div>
          </div>

          {/* Row 2: Prisma Compute */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            {/* Left: Copy & Text */}
            <div>
              <span className="text-xs font-mono font-bold text-cyan-400 tracking-widest uppercase mb-3 block">
                PRISMA COMPUTE
              </span>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight mb-5 leading-tight">
                Run TypeScript the way it actually works.
              </h2>
              <p className="text-slate-300 text-base sm:text-lg leading-relaxed">
                Prisma Compute deploys TypeScript apps as long-lived processes near your database. A good fit for APIs and AI agents, with fewer serverless constraints and no extra infrastructure to stitch together.
              </p>
            </div>

            {/* Right: Microchip Processor Vector Card */}
            <ComputeChipIllustration />
          </div>
        </div>
      </section>

      {/* Tech Stack Icons Section */}
      <TechStackSection />

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

      <CapabilitiesFlow />

      <ProcessShowcase steps={processSteps} />

      {/* Platform — copy + SVG side by side from md; stats full width below */}
      <section className="overflow-hidden border-t border-slate-800/80 py-16 sm:py-20 lg:py-24">
        <div ref={platformRef as React.RefObject<HTMLDivElement>} className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p data-reveal className="mb-4 text-xs font-mono font-bold text-teal-400 uppercase tracking-widest">Platform</p>

          <div className="grid grid-cols-1 items-start gap-8 min-[480px]:grid-cols-[minmax(0,1fr)_min(42%,200px)] min-[480px]:gap-6 md:grid-cols-[minmax(0,1fr)_min(40%,min(340px,38vw))] md:gap-10 lg:gap-14">
            <div data-reveal className="min-w-0">
              <h2 className="text-4xl font-black text-white sm:text-5xl tracking-tight">
                Built for learners
                <br />
                <span className="text-slate-300 font-normal">and serious practice.</span>
              </h2>
              <p className="mt-4 max-w-xl leading-relaxed text-slate-300">
                Your progress, scans, courses, interviews, and certificates stay tied to your account. The experience is
                delivered through a modern web app with secure sign-in, dedicated dashboards for each area, and integrations
                like GitHub when you want your real projects in the loop.
              </p>
            </div>

            <div data-reveal className="flex w-full min-w-0 justify-center min-[480px]:justify-end min-[480px]:pt-1 md:pt-0">
              <div className="capability-reveal w-full max-w-[220px] opacity-95 min-[480px]:max-w-[240px] md:max-w-[min(360px,100%)] lg:max-w-md">
                <PlatformWorkspaceIllustration className="mx-auto min-[480px]:mx-0" />
              </div>
            </div>
          </div>

          <div className="mx-auto mt-8 grid w-full max-w-3xl grid-cols-1 gap-4 sm:max-w-4xl sm:grid-cols-3 lg:max-w-5xl">
            {['One login', 'Guided quality', 'Career prep'].map((title, i) => (
              <div
                key={title}
                data-reveal
                className="flex h-full flex-col items-center justify-center rounded-xl border border-slate-800 bg-[#090d16]/80 p-4 text-center transition-all duration-300 hover:border-teal-500/40 hover:bg-[#0b101c]"
              >
                <p className={`text-xl font-bold ${i === 2 ? 'text-teal-400' : 'text-white'}`}>{title}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {i === 0 && 'Scanner, learning, interviews & more'}
                  {i === 1 && 'Issues, gates, and AI-assisted fixes'}
                  {i === 2 && 'Certs, roles, and interview training'}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <PipelineFlow />

      {/* Integrations Section */}
      <section id="integrations" className="py-16 sm:py-20 lg:py-24 border-t border-slate-800/80 bg-[#050810] scroll-mt-24">
        <div ref={integrationsRef as React.RefObject<HTMLDivElement>} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div data-reveal className="text-center mb-10 max-w-3xl mx-auto">
            <span className="text-xs font-mono font-bold text-teal-400 tracking-widest uppercase mb-3 block">INTEGRATIONS</span>
            <h2 className="text-4xl sm:text-5xl font-black text-white tracking-tight">
              Connect the services
              <br />
              <span className="text-slate-300 font-normal">you already rely on.</span>
            </h2>
            <p className="text-slate-300 mt-4 max-w-2xl mx-auto text-sm sm:text-base leading-relaxed">
              Connect your code repositories from GitHub or GitLab, sign in with Google, get notifications in Slack,
              and use your favorite IDE with CodeSpectra.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-6 gap-4 max-w-5xl mx-auto">
            {integrations.map((integration) => {
              const Icon = integrationIcons[integration.name] || Code2
              const IconEl = Icon as React.ComponentType<{ className?: string }>
              return (
                <TiltCard key={integration.name} maxTilt={6} glare={false}>
                  <div
                    data-reveal
                    className="integration-card group relative h-full flex flex-col items-center justify-between p-4 border border-slate-800 bg-[#090d16]/90 rounded-xl text-center cursor-default transition-all duration-300 hover:border-teal-500/50 hover:bg-[#0d1424]"
                  >
                    <div className="w-11 h-11 bg-slate-900 border border-slate-800 rounded-xl mx-auto mb-3 flex items-center justify-center transition-transform duration-300 group-hover:scale-110 group-hover:border-teal-500/40 shrink-0">
                      <IconEl className="w-5 h-5 text-slate-300 transition-colors duration-300 group-hover:text-teal-300" />
                    </div>
                    <div className="flex flex-col items-center gap-0.5 flex-1">
                      <p className="text-xs font-bold text-white transition-colors duration-300 group-hover:text-teal-300">{integration.name}</p>
                      <p className="text-[11px] text-slate-400">{integration.category}</p>
                    </div>
                  </div>
                </TiltCard>
              )
            })}
          </div>
        </div>
      </section>

      {/* Security Section */}
      <section id="trust" className="scroll-mt-24 border-t border-slate-800/80 py-16 sm:py-20 lg:py-24 bg-[#060912]">
        <div ref={trustRef as React.RefObject<HTMLDivElement>} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div data-reveal className="mb-10 max-w-3xl">
            <span className="text-xs font-mono font-bold text-teal-400 tracking-widest uppercase mb-3 block">SECURITY & ACCESS</span>
            <h2 className="text-4xl sm:text-5xl font-black text-white tracking-tight">
              Your work stays
              <br />
              <span className="text-slate-300 font-normal">in the right hands.</span>
            </h2>
            <p className="text-slate-300 mt-4 max-w-2xl leading-relaxed text-sm sm:text-base">
              Accounts are protected with secure sign-in, dashboard areas require an active session, and team or admin roles
              control who can change sensitive settings. Third-party connections (like GitHub or AI providers) only run with the
              permissions you approve.
            </p>
          </div>

          <div data-reveal className="flex flex-wrap gap-2.5 mb-8">
            {['Secure sign-in', 'Session-aware dashboards', 'Role-based access', 'Controlled integrations'].map((badge) => (
              <span key={badge} className="px-3.5 py-1.5 bg-[#090d16] border border-slate-800 text-slate-300 rounded-full text-xs font-medium transition-all duration-300 hover:border-teal-500/50 hover:text-white">
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
              <div
                key={item.title}
                data-reveal
                className="group p-6 border border-border/40 rounded-xl transition-all duration-300 hover:border-primary/30 hover:bg-primary/[0.02] hover:shadow-lg hover:-translate-y-0.5"
              >
                <h3 className="font-semibold mb-2 transition-colors duration-300 group-hover:text-primary">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section (Prisma gradient spotlight & grid mesh style) */}
      <section className="relative py-10 sm:py-12 lg:py-14 border-t border-slate-800/80 bg-[#050811] overflow-hidden">
        {/* Background Grid Mesh */}
        <div
          className="pointer-events-none absolute inset-0 opacity-45"
          style={{
            backgroundImage: `linear-gradient(rgba(0, 197, 115, 0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 197, 115, 0.15) 1px, transparent 1px)`,
            backgroundSize: '48px 48px',
          }}
        />

        {/* Ambient Teal Radial Spotlight Glow */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[320px] w-[640px] rounded-full bg-gradient-radial from-mint-pulse/25 via-[#0d3830]/15 to-transparent blur-3xl" />

        <div ref={ctaRef as React.RefObject<HTMLDivElement>} className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          {/* Simple Tech Icons Row */}
          <div data-reveal className="flex items-center justify-center gap-4 mb-4">
            <span className="p-2 rounded-xl bg-slate-900/80 border border-slate-800 text-teal-400">
              <Code2 className="w-4 h-4" />
            </span>
            <span className="p-2 rounded-xl bg-slate-900/80 border border-slate-800 text-cyan-400">
              <Braces className="w-4 h-4" />
            </span>
            <span className="p-2 rounded-xl bg-slate-900/80 border border-slate-800 text-emerald-400">
              <Github className="w-4 h-4" />
            </span>
            <span className="p-2 rounded-xl bg-slate-900/80 border border-slate-800 text-amber-400">
              <Slack className="w-4 h-4" />
            </span>
          </div>

          <h2 data-reveal className="text-3xl sm:text-5xl lg:text-6xl font-black mb-3 tracking-tight text-white leading-[1.1]">
            Start with CodeSpectra.
            <br />
            <span className="text-white">Expand when you need more.</span>
          </h2>

          <p data-reveal className="text-sm sm:text-base text-slate-300 mb-6 max-w-2xl mx-auto leading-relaxed">
            Begin with CodeSpectra Scanner, add CodeSpectra AI when you need managed infrastructure, and deploy your app on CodeSpectra Compute.
          </p>

          <div data-reveal className="flex flex-col sm:flex-row gap-3 justify-center items-center mb-2">
            <Link
              href={hasSession ? DASHBOARD_HREF : '/auth/signup'}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-mint-pulse hover:bg-[#3ecf8e] text-slate-950 font-bold px-8 py-3.5 text-sm sm:text-base transition-all shadow-2xl shadow-mint-pulse/30 hover:shadow-mint-pulse/50 hover:scale-105"
            >
              {hasSession ? 'Try it out in the Console' : 'Try it out in the Console'}
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <p data-reveal className="text-xs text-slate-400 font-medium mb-6">
            Free to get started, no credit card needed.
          </p>

          {/* Newsletter signup module wrapped to full webpage container size */}
          <div data-reveal className="mx-auto max-w-5xl w-full rounded-2xl border border-slate-800/80 bg-[#090e18]/90 p-5 sm:p-6 text-left backdrop-blur-md shadow-2xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="md:max-w-md">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-base font-bold text-white">Get product updates</h3>
                  <span className="text-[10px] font-mono text-teal-400 bg-teal-950/80 border border-teal-800/60 px-2.5 py-0.5 rounded-full uppercase">
                    NO SPAM
                  </span>
                </div>
                <p className="text-xs text-slate-300">
                  New challenges, assessments, hackathons and features — straight to your inbox.
                </p>
              </div>

              <div className="md:flex-1 md:max-w-lg">
                <NewsletterSubscribe source="landing-page" compact={true} />
              </div>
            </div>
          </div>
        </div>
      </section>

    </PublicPageWrapper>
  )
}
