'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Check, ArrowRight, Loader2 } from 'lucide-react'
import { PublicPageWrapper } from '@/app/public-layout'
import Link from 'next/link'

type PublicPlan = {
  id: string
  name: string
  description: string
  price: number
  yearlyPrice: number
  features: string[]
  popular?: boolean
}

export default function PricingPage() {
  const [annual, setAnnual] = useState(false)
  const [plans, setPlans] = useState<PublicPlan[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch('/api/pricing/plans')
        const j = await r.json()
        if (!r.ok) throw new Error(typeof j.error === 'string' ? j.error : 'Failed to load pricing')
        if (!cancelled && Array.isArray(j)) setPlans(j)
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Failed to load pricing')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const annualSavingsPct = useMemo(() => {
    if (!plans?.length) return 15
    const pro = plans.find((p) => p.id === 'pro')
    if (!pro || pro.price <= 0 || pro.yearlyPrice <= 0) return 15
    const full = pro.price * 12
    if (full <= 0) return 15
    return Math.round(((full - pro.yearlyPrice) / full) * 100)
  }, [plans])

  if (loadError && !plans) {
    return (
      <PublicPageWrapper>
        <div className="mx-auto max-w-lg py-24 text-center">
          <p className="text-destructive">{loadError}</p>
          <Button asChild className="mt-6">
            <Link href="/">Back home</Link>
          </Button>
        </div>
      </PublicPageWrapper>
    )
  }

  if (!plans) {
    return (
      <PublicPageWrapper>
        <div className="flex min-h-[40vh] items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          Loading pricing…
        </div>
      </PublicPageWrapper>
    )
  }

  return (
    <PublicPageWrapper>
      <div className="space-y-20">
        <div className="text-center">
          <p className="mb-3 text-sm text-muted-foreground">Pricing</p>
          <h1 className="mb-4 text-5xl font-bold sm:text-6xl">
            Simple, transparent
            <br />
            <span className="text-muted-foreground">pricing</span>
          </h1>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
            Start free and scale as you grow. Amounts update from your team&apos;s catalog in the admin console.
          </p>
        </div>

        <div className="flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => setAnnual(false)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              !annual ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setAnnual(true)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              annual ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Annual
            <span className="rounded-full bg-green-500/20 px-2 py-0.5 text-xs text-green-600 dark:text-green-400">
              Save ~{annualSavingsPct}%
            </span>
          </button>
        </div>

        <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-3">
          {plans.map((plan, index) => {
            const isCustom =
              plan.id === 'enterprise' && plan.price <= 0 && plan.yearlyPrice <= 0
            const monthlyDisplay = plan.price
            const yearlyDisplay = plan.yearlyPrice
            const perMonthIfAnnual = yearlyDisplay > 0 ? yearlyDisplay / 12 : 0

            return (
              <div
                key={plan.id}
                className={`relative flex flex-col rounded-xl border p-8 transition-all duration-300 ${
                  plan.popular
                    ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                    : 'border-border/40 hover:border-primary/40'
                }`}
              >
                {plan.popular ? (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
                      Most popular
                    </span>
                  </div>
                ) : null}

                <div className="mb-6">
                  <span className="font-mono text-sm text-muted-foreground">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <h3 className="mt-2 text-2xl font-bold">{plan.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
                </div>

                <div className="mb-8">
                  {isCustom ? (
                    <span className="text-4xl font-bold">Custom</span>
                  ) : !annual ? (
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-bold">${monthlyDisplay.toFixed(2)}</span>
                      <span className="text-muted-foreground">/month</span>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-bold">${yearlyDisplay.toFixed(2)}</span>
                        <span className="text-muted-foreground">/year</span>
                      </div>
                      {perMonthIfAnnual > 0 ? (
                        <p className="text-sm text-muted-foreground">
                          ≈ ${perMonthIfAnnual.toFixed(2)}/mo billed annually
                        </p>
                      ) : null}
                    </div>
                  )}
                </div>

                <ul className="mb-8 flex-1 space-y-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <Check className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                      <span className="text-sm text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  asChild
                  variant={plan.popular ? 'default' : 'outline'}
                  className="w-full gap-2"
                >
                  <Link
                    href={
                      isCustom
                        ? '/support'
                        : `/auth/signup?plan=${encodeURIComponent(plan.id)}`
                    }
                  >
                    {isCustom ? 'Contact sales' : plan.price <= 0 ? 'Start free' : 'Start trial'}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            )
          })}
        </div>

        <div className="mx-auto max-w-4xl">
          <div className="mb-12 text-center">
            <p className="mb-3 text-sm text-muted-foreground">FAQ</p>
            <h2 className="text-4xl font-bold">
              Frequently asked
              <br />
              <span className="text-muted-foreground">questions</span>
            </h2>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {[
              {
                q: 'Can I change plans anytime?',
                a: 'Yes, you can upgrade or downgrade at any time. Changes take effect on your next billing cycle unless otherwise noted.',
              },
              {
                q: 'Is there a free tier?',
                a: 'Yes. You can start on the free plan and move to paid plans when you need more capacity.',
              },
              {
                q: 'What payment methods do you accept?',
                a: 'We accept major credit cards via Stripe. Enterprise billing options may be available on request.',
              },
              {
                q: 'Do you offer discounts for annual billing?',
                a: `Yes. Annual plans are discounted versus paying monthly (typically around ${annualSavingsPct}% less than twelve monthly payments for Pro).`,
              },
            ].map((faq, i) => (
              <div
                key={i}
                className="rounded-xl border border-border/40 p-6 transition-colors hover:border-primary/40"
              >
                <h3 className="mb-2 font-semibold">{faq.q}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-border/40 py-12 text-center">
          <h2 className="mb-4 text-3xl font-bold">Ready to get started?</h2>
          <p className="mx-auto mb-8 max-w-xl text-muted-foreground">
            Join thousands of developers who are already using CodeSpectra to improve their code quality.
          </p>
          <div className="flex justify-center gap-4">
            <Button size="lg" asChild className="gap-2">
              <Link href="/auth/signup">
                Start free trial
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/support">Contact sales</Link>
            </Button>
          </div>
        </div>
      </div>
    </PublicPageWrapper>
  )
}
