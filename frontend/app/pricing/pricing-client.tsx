'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Check, ArrowRight, Loader2 } from 'lucide-react'
import { PublicPageWrapper } from '@/app/public-layout'
import Link from 'next/link'
import { useCurrency } from '@/lib/use-currency'
import { PageHero } from '@/components/landing/page-hero'
import { CONTACT_SALES_HREF, inAppPricingHref, planCheckoutMode, type PlanCheckoutMode } from '@/lib/billing-plan-mode'
import { getCurrencySymbol } from '@/lib/currency'
import { pricingFaqs } from '@/lib/seo/faq-content'

export type PublicPlan = {
  id: string
  name: string
  description: string
  price: number
  yearlyPrice: number
  features: string[]
  popular?: boolean
  currency?: string | null
  checkout_mode?: PlanCheckoutMode
}

/**
 * Interactive pricing (billing-period toggle, checkout links). The server page
 * passes the plans so prices are in the HTML; it only fetches when the server
 * could not load them.
 */
export function PricingClient({ initialPlans }: { initialPlans: PublicPlan[] | null }) {
  const [annual, setAnnual] = useState(false)
  const [plans, setPlans] = useState<PublicPlan[] | null>(initialPlans)
  const [loadError, setLoadError] = useState<string | null>(null)
  const { symbol: platformSymbol } = useCurrency()

  useEffect(() => {
    if (initialPlans) return
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
  }, [initialPlans])

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
      <PageHero
        title="Pricing that starts free"
        lead={
          <>
            Candidates practise for free. Hiring teams pick a plan for the assessments they run, or{' '}
            <Link href="/contact?topic=sales" className="font-semibold text-cs-accent-text underline underline-offset-4">talk to us</Link> about a campus or company licence.
          </>
        }
      />
      <div className="mx-auto max-w-[1200px] space-y-20 px-4 py-16 sm:px-6 lg:px-8">

        <div role="group" aria-label="Billing period" className="mx-auto flex w-fit items-center gap-1 rounded-full border border-cs-grid bg-cs-sheet p-1">
          <button
            type="button"
            onClick={() => setAnnual(false)}
            aria-pressed={!annual}
            className={`rounded-full px-5 py-2 text-sm font-semibold transition-colors ${
              !annual ? 'bg-cs-accent text-cs-accent-ink' : 'text-cs-ink-soft hover:text-cs-ink'
            }`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setAnnual(true)}
            aria-pressed={annual}
            className={`flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold transition-colors ${
              annual ? 'bg-cs-accent text-cs-accent-ink' : 'text-cs-ink-soft hover:text-cs-ink'
            }`}
          >
            Annual
            <span className={`rounded-full px-2 py-0.5 text-xs ${annual ? 'bg-white/20 text-current' : 'bg-green-500/15 text-green-700 dark:text-green-400'}`}>
              Save ~{annualSavingsPct}%
            </span>
          </button>
        </div>

        <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-3">
          {plans.map((plan) => {
            // Same classification checkout uses: enterprise / custom → contact sales.
            // Server mode (same resolver as checkout) first; local classification as fallback.
            const mode = plan.checkout_mode ?? planCheckoutMode({ id: plan.id, price: plan.price, yearlyPrice: plan.yearlyPrice })
            const symbol = plan.currency ? getCurrencySymbol(plan.currency) : platformSymbol
            const isCustom = mode === 'contact_sales'
            const monthlyDisplay = plan.price
            const yearlyDisplay = plan.yearlyPrice
            const perMonthIfAnnual = yearlyDisplay > 0 ? yearlyDisplay / 12 : 0

            return (
              <div
                key={plan.id}
                className={`cs-bento is-in relative flex flex-col rounded-3xl border bg-cs-sheet p-8 shadow-[0_8px_24px_-12px_rgba(15,23,41,0.10)] transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-18px_rgba(47,91,231,0.35)] motion-reduce:hover:translate-y-0 ${
                  plan.popular
                    ? 'border-cs-accent ring-1 ring-cs-accent'
                    : 'border-cs-grid hover:border-cs-accent/40'
                }`}
              >
                {plan.popular ? (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="rounded-full bg-cs-accent px-3 py-1 text-xs font-semibold text-cs-accent-ink">
                      Most popular
                    </span>
                  </div>
                ) : null}

                <div className="mb-6">
                  <h3 className="text-2xl font-bold text-cs-ink">{plan.name}</h3>
                  <p className="mt-1 text-sm text-cs-ink-soft">{plan.description}</p>
                </div>

                <div className="mb-8">
                  {isCustom ? (
                    <span className="text-4xl font-bold">Custom</span>
                  ) : !annual ? (
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-bold">{symbol}{monthlyDisplay.toFixed(2)}</span>
                      <span className="text-muted-foreground">/month</span>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-bold">{symbol}{yearlyDisplay.toFixed(2)}</span>
                        <span className="text-muted-foreground">/year</span>
                      </div>
                      {perMonthIfAnnual > 0 ? (
                        <p className="text-sm text-muted-foreground">
                          ≈ {symbol}{perMonthIfAnnual.toFixed(2)}/mo billed annually
                        </p>
                      ) : null}
                    </div>
                  )}
                </div>

                <ul className="mb-8 flex-1 space-y-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <Check className="mt-0.5 h-5 w-5 shrink-0 text-cs-accent-text" aria-hidden />
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
                        ? CONTACT_SALES_HREF
                        : mode === 'free'
                          ? '/auth/signup'
                          // Carry the plan through signup: after signup the user lands on
                          // the in-app pricing page with this plan preselected. No trial exists.
                          : `/auth/signup?${new URLSearchParams({
                              plan: plan.id,
                              ...(annual ? { interval: 'year' } : {}),
                              redirect: inAppPricingHref(plan.id, annual ? 'year' : 'month'),
                            }).toString()}`
                    }
                  >
                    {isCustom ? 'Contact sales' : mode === 'free' ? 'Start free' : 'Get started'}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            )
          })}
        </div>

        <div className="mx-auto max-w-4xl">
          <div className="mb-12 text-center">
            <h2 className="cs-heading text-4xl sm:text-5xl">Questions about pricing</h2>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {pricingFaqs(annualSavingsPct).map((faq, i) => (
              <div
                key={i}
                className="rounded-3xl border border-cs-grid bg-cs-sheet p-6 transition-colors hover:border-cs-accent/40"
              >
                <h3 className="mb-2 text-base font-semibold">{faq.q}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-cs-grid py-12 text-center">
          <h2 className="cs-heading mb-4 text-4xl">Not sure which plan fits?</h2>
          <p className="mx-auto mb-8 max-w-xl text-cs-ink-soft">
            Run a pilot on one open role first, then choose a plan from what you actually used.
          </p>
          <div className="flex justify-center gap-4">
            <Button size="lg" asChild className="gap-2">
              <Link href="/contact">
                Book a pilot
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/contact?topic=sales">Contact sales</Link>
            </Button>
          </div>
        </div>
      </div>
    </PublicPageWrapper>
  )
}
