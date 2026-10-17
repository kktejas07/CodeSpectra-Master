'use client'

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { Code2, ArrowRight, LogIn } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { PublicPageWrapper } from '@/app/public-layout'
import { PageHero } from '@/components/landing/page-hero'
import { Panel } from '@/components/app/page-kit'
import { DeviceShowcase, SoftGlow } from '@/components/visuals'
import { useAssessmentViewModel } from './use-assessment-viewmodel'
import { usePageGuard } from '@/lib/use-page-guard'
import { useAuth } from '@/lib/auth-context'
import { SkeletonList, SkeletonText } from '@/components/ui/skeleton-boneyard'

export default function AssessmentPage() {
  const gate = usePageGuard('user')
  const { user: authUser } = useAuth()
  const { openFaq, toggleFaq, ecosystem, steps, faq } = useAssessmentViewModel()

  if (!gate.ready) {
    return (
      <div className="min-h-screen space-y-8 p-6">
        <SkeletonText lines={2} />
        <SkeletonList count={3} />
      </div>
    )
  }

  if (!gate.allowed) {
    return (
      <div className="relative isolate min-h-screen flex items-center justify-center bg-background px-4">
        <SoftGlow />
        <Card className="max-w-sm w-full rounded-3xl p-8 text-center border-border/70">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 mx-auto mb-4">
            <Code2 className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-xl font-semibold text-foreground mb-2">Sign in required</h1>
          <p className="text-sm text-muted-foreground mb-6">
            Please sign in to access the assessment platform.
          </p>
          <div className="flex flex-col gap-2">
            <Button className="w-full gap-2" asChild>
              <Link href={`/auth/login?redirect=${encodeURIComponent('/assessment')}`}><LogIn className="h-4 w-4" /> Sign in</Link>
            </Button>
            <Button variant="outline" className="w-full" asChild>
              <Link href="/auth/signup">Create account</Link>
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <PublicPageWrapper>
      <div className="bg-background text-foreground" data-testid="assessment-page">
        <PageHero
          title={<>Hire with <span className="text-primary">proctored, AI‑graded</span> assessments</>}
          lead="Combine fresh talent with data-driven insight and verified technical work. Live AI proctoring, ready-to-use coding environments and skill analytics in one place."
          actions={
            <>
              <Button size="lg" data-testid="hero-get-started" asChild>
                <Link href={authUser?.uid ? '/dashboard' : '/auth/signup'}>
                  {authUser?.uid ? 'Go to dashboard' : 'Get started'} <ArrowRight className="h-4 w-4 ml-1" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" data-testid="hero-try-ide" asChild>
                <Link href="/dashboard/problems">Try the IDE</Link>
              </Button>
            </>
          }
          art={<DeviceShowcase variant="proctor" compact />}
        />

        {/* Ecosystem */}
        <section className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="mb-10 max-w-2xl">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Everything an assessment needs</h2>
            <p className="mt-2 text-muted-foreground">
              From AI proctoring to detailed analytics, in one platform.
            </p>
          </div>
          <div className="cs-stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
            {ecosystem.map((f) => (
              <Panel key={f.title} interactive className="p-5" data-testid={f.testid}>
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                  <f.icon className="h-5 w-5" aria-hidden />
                </div>
                <h3 className="text-base font-semibold text-foreground">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
              </Panel>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="border-t border-border/60 bg-muted/30">
          <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
            <h2 className="mb-10 text-center text-2xl font-bold tracking-tight sm:text-3xl">How it works</h2>
            <div className="cs-stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
              {steps.map((s) => (
                <Panel key={s.n} className="p-5" data-testid={`step-${s.n}`}>
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-bold tabular-nums text-primary-foreground">{s.n}</span>
                  <h3 className="mt-3 text-base font-semibold text-foreground">{s.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{s.desc}</p>
                </Panel>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="border-t border-border/60">
          <div className="mx-auto max-w-3xl px-4 py-16 lg:py-20">
            <div className="mb-8 text-center">
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Frequently asked questions</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                What to know about assessments and plans.
              </p>
            </div>
            <div className="space-y-2">
              {faq.map((q, i) => (
                <div key={q.q} className="overflow-hidden rounded-2xl border border-border/70 bg-card">
                  <button
                    type="button"
                    onClick={() => toggleFaq(i)}
                    aria-expanded={openFaq === i}
                    aria-controls={`assessment-faq-${i}`}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    data-testid={`faq-toggle-${i}`}
                  >
                    <span>{q.q}</span>
                    <span
                      aria-hidden
                      className={cn(
                        'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border text-xs transition-transform duration-200 motion-reduce:transition-none',
                        openFaq === i ? 'rotate-45 border-primary bg-primary text-primary-foreground' : '',
                      )}
                    >
                      +
                    </span>
                  </button>
                  {openFaq === i && (
                    <div id={`assessment-faq-${i}`} className="px-4 pb-4 text-sm text-muted-foreground">{q.a}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-[1200px] px-4 pb-16 sm:px-6 lg:px-8">
          <div className="relative isolate overflow-hidden rounded-3xl bg-primary px-6 py-12 text-center text-primary-foreground sm:px-10">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Ready to run your first assessment?</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm text-primary-foreground/85">
              Sign up for free — no card required.
            </p>
            <div className="mt-6 flex justify-center">
              <Button size="lg" variant="secondary" className="bg-white text-primary hover:bg-white/90" data-testid="footer-cta" asChild>
                <Link href={authUser?.uid ? '/dashboard' : '/auth/signup'}>
                  Get started free <ArrowRight className="h-4 w-4 ml-1" />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </div>
    </PublicPageWrapper>
  )
}
