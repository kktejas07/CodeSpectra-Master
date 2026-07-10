'use client'

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ArrowRight, Code2, Library } from 'lucide-react'
import { AnimatedDotCanvas } from '@/components/animated-dot-canvas'
import { Globe3D } from '@/components/globe-3d'
import { PlatformWorkspaceIllustration } from '@/components/landing/platform-workspace-illustration'
import { CapabilitiesFlow } from '@/components/landing/capabilities-flow'
import { ProcessShowcase, type ProcessStep } from '@/components/landing/process-showcase'
import { PipelineFlow } from '@/components/landing/pipeline-flow'
import { useHasUserSession } from '@/hooks/use-has-user-session'
import { PublicPageWrapper, DASHBOARD_HREF } from '@/app/public-layout'
import { LoadingScreen } from '@/components/loading-screen'
import { FloatingCodeParticles } from '@/components/landing/floating-code-particles'
import { TiltCard } from '@/components/ui/tilt-card'
import { useScrollReveal } from '@/hooks/use-scroll-reveal'

export default function Home() {
  const hasSession = useHasUserSession()
  const [loadingDone, setLoadingDone] = useState(false)
  const handleLoadingDone = useCallback(() => setLoadingDone(true), [])
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
    { title: 'Learning & exams', subtitle: 'Structured lessons, progress, and timed assessments' },
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
    { name: 'GitHub', category: 'Connect your repositories' },
    { name: 'Google', category: 'Sign in with Google' },
    { name: 'Razorpay', category: 'Plans & checkout' },
    { name: 'Slack', category: 'Notifications' },
    { name: 'OpenAI', category: 'AI explanations & fixes' },
    { name: 'MongoDB', category: 'Secure data storage' },
  ]

  return (
    <>
      {!loadingDone && <LoadingScreen onDone={handleLoadingDone} />}

      <div className={loadingDone ? '' : 'hidden'}>

    <PublicPageWrapper>

      {/* Hero — 3D globe backdrop with code particles overlay */}
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
              parallaxIntensity={6}
              fillContainer
            />
          </div>
        </div>

        {/* Floating code particles */}
        <FloatingCodeParticles count={22} />

        {/* Soft scrim — keeps text readable while letting the globe shine through */}
        <div
          className="absolute inset-0 z-1 bg-linear-to-b from-background/40 via-background/10 to-background/55 dark:from-background/35 dark:via-background/5 dark:to-background/50 pointer-events-none"
          aria-hidden
        />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 w-full">
          <div className="max-w-4xl mx-auto text-center">
            <p data-reveal data-revealed="true" className="text-sm text-muted-foreground mb-8 animate-fade-in drop-shadow-sm">
              Learn, scan, fix, and interview—with guidance and AI support in one workspace
            </p>

            <h1
              data-reveal
              data-revealed="true"
              className="text-5xl sm:text-6xl lg:text-7xl xl:text-8xl font-bold tracking-tight mb-8 leading-[1.1] text-foreground [text-shadow:0_0_48px_var(--background),0_2px_16px_var(--background)]"
              style={{ transitionDelay: '120ms' }}
            >
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

            <p
              data-reveal
              data-revealed="true"
              className="text-lg text-muted-foreground max-w-2xl mx-auto mb-12 leading-relaxed [text-shadow:0_0_36px_var(--background),0_1px_10px_var(--background)]"
              style={{ transitionDelay: '240ms' }}
            >
              CodeSpectra gives you access to tools that help you learn: scan the code you build, understand errors and
              issues, get AI-assisted fixes, practice in challenges and arenas, follow courses and exams, train for interviews,
              manage resumes, earn certificates, and explore roles—all from your account.
            </p>

            <div
              data-reveal
              data-revealed="true"
              className="flex flex-col sm:flex-row gap-4 justify-center"
              style={{ transitionDelay: '360ms' }}
            >
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

        {/* Subtle bottom fade */}
        <div className="absolute bottom-0 left-0 right-0 h-24 bg-linear-to-t from-background to-transparent z-10 pointer-events-none" />
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

      <CapabilitiesFlow />

      <ProcessShowcase steps={processSteps} />

      {/* Platform — copy + SVG side by side from md; stats full width below */}
      <section className="overflow-hidden border-t border-border/40 py-24 lg:py-32">
        <div ref={platformRef as React.RefObject<HTMLDivElement>} className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p data-reveal className="mb-6 text-sm text-muted-foreground md:mb-8">Platform</p>

          <div className="grid grid-cols-1 items-start gap-8 min-[480px]:grid-cols-[minmax(0,1fr)_min(42%,200px)] min-[480px]:gap-6 md:grid-cols-[minmax(0,1fr)_min(40%,min(340px,38vw))] md:gap-10 lg:gap-14">
            <div data-reveal className="min-w-0">
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

            <div data-reveal className="flex w-full min-w-0 justify-center min-[480px]:justify-end min-[480px]:pt-1 md:pt-0">
              <div className="capability-reveal w-full max-w-[220px] opacity-95 min-[480px]:max-w-[240px] md:max-w-[min(360px,100%)] lg:max-w-md">
                <PlatformWorkspaceIllustration className="mx-auto min-[480px]:mx-0" />
              </div>
            </div>
          </div>

          <div className="mx-auto mt-10 grid w-full max-w-3xl grid-cols-1 gap-4 sm:max-w-4xl sm:grid-cols-3 md:mt-12 lg:max-w-5xl">
            {['One login', 'Guided quality', 'Career prep'].map((title, i) => (
              <div
                key={title}
                data-reveal
                className="flex h-full flex-col items-center justify-center rounded-xl border border-border/40 bg-card/50 p-5 text-center transition-all duration-300 hover:border-primary/30 hover:bg-primary/[0.02] hover:shadow-lg"
              >
                <p className={`text-2xl font-bold ${i === 2 ? 'text-primary' : 'text-foreground'}`}>{title}</p>
                <p className="mt-1 text-xs text-muted-foreground">
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
      <section id="integrations" className="py-24 lg:py-32 border-t border-border/40 scroll-mt-24">
        <div ref={integrationsRef as React.RefObject<HTMLDivElement>} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div data-reveal className="text-center mb-16">
            <p className="text-sm text-muted-foreground mb-3">Integrations</p>
            <h2 className="text-4xl sm:text-5xl font-bold">
              Connect the services
              <br />
              <span className="text-muted-foreground">you already rely on.</span>
            </h2>
            <p className="text-muted-foreground mt-6 max-w-2xl mx-auto">
              When you link accounts, CodeSpectra can use GitHub for repos, Google for easier sign-in, Razorpay for plans,
              Slack for notifications, and AI models for explanations and suggested fixes—so the tools feel familiar.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-6 gap-4 max-w-4xl mx-auto">
            {integrations.map((integration) => (
              <TiltCard key={integration.name} maxTilt={6} glare={false}>
                <div
                  data-reveal
                  className="integration-card group relative p-4 border border-border/40 rounded-xl text-center cursor-default transition-all duration-300 hover:border-primary/40 hover:bg-primary/5"
                >
                  <div className="w-10 h-10 bg-muted rounded-lg mx-auto mb-3 flex items-center justify-center transition-transform duration-300 group-hover:scale-110 group-hover:bg-primary/10">
                    <Code2 className="w-5 h-5 text-muted-foreground transition-colors duration-300 group-hover:text-primary" />
                  </div>
                  <p className="text-sm font-medium transition-colors duration-300 group-hover:text-primary">{integration.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">{integration.category}</p>
                </div>
              </TiltCard>
            ))}
          </div>
        </div>
      </section>

      {/* Security Section */}
      <section id="trust" className="scroll-mt-24 border-t border-border/40 py-24 lg:py-32">
        <div ref={trustRef as React.RefObject<HTMLDivElement>} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div data-reveal className="mb-16">
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

          <div data-reveal className="flex flex-wrap gap-3 mb-12">
            {['Secure sign-in', 'Session-aware dashboards', 'Role-based access', 'Controlled integrations'].map((badge) => (
              <span key={badge} className="px-4 py-2 bg-muted rounded-full text-sm font-medium transition-all duration-300 hover:bg-primary/10 hover:text-primary">
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

      {/* CTA Section */}
      <section className="py-24 lg:py-32 border-t border-border/40 relative overflow-hidden">
        {/* Subtle radial glow */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-80 w-80 rounded-full bg-primary/5 blur-3xl" />
        <div ref={ctaRef as React.RefObject<HTMLDivElement>} className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <h2 data-reveal className="text-4xl sm:text-5xl font-bold mb-6 tracking-tight">
            Start using
            <br />
            <span className="text-muted-foreground">the full toolkit.</span>
          </h2>
          <p data-reveal className="text-lg text-muted-foreground mb-10 leading-relaxed">
            {hasSession
              ? "You're signed in—open your dashboard to pick up scanning, courses, interviews, and everything tied to your account."
              : 'Create your CodeSpectra account to access scanning, learning paths, AI-assisted guidance, interview practice, certificates, and career tools—built for people who want to learn, improve, and show what they can do.'}
          </p>
          <div data-reveal className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" asChild className="h-12 px-8 text-base gap-2 rounded-full shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all duration-300">
              <Link href={hasSession ? DASHBOARD_HREF : '/auth/signup'}>
                {hasSession ? 'Go to dashboard' : 'Get started free'}
                <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="h-12 px-8 text-base rounded-full">
              <Link href="/contact">Questions? Contact us</Link>
            </Button>
          </div>
          <p data-reveal className="text-sm text-muted-foreground mt-6">
            Your account unlocks the scanners, lessons, interview trainers, and certificate flows described above.
          </p>
        </div>
      </section>

    </PublicPageWrapper>

      </div>
    </>
  )
}
