'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Check, ArrowRight } from 'lucide-react'
import { PublicPageWrapper } from '@/app/public-layout'
import Link from 'next/link'

export default function PricingPage() {
  const [annual, setAnnual] = useState(false)

  const plans = [
    {
      number: '01',
      name: 'Starter',
      description: 'For individuals and small projects',
      price: annual ? 0 : 0,
      features: [
        'Up to 3 projects',
        '1GB storage',
        'Community support',
        'Basic analytics',
        'SSL certificates',
      ],
      highlighted: false,
      cta: 'Start free',
    },
    {
      number: '02',
      name: 'Pro',
      description: 'For growing teams and businesses',
      price: annual ? 20 : 24,
      features: [
        'Unlimited projects',
        '100GB storage',
        'Priority support',
        'Advanced analytics',
        'Custom domains',
        'Team collaboration',
        'API access',
      ],
      highlighted: true,
      cta: 'Start trial',
    },
    {
      number: '03',
      name: 'Enterprise',
      description: 'For large-scale operations',
      price: null,
      features: [
        'Everything in Pro',
        'Unlimited storage',
        '24/7 dedicated support',
        'Custom integrations',
        'SLA guarantee',
        'On-premise option',
        'Security audit',
        'Custom contracts',
      ],
      highlighted: false,
      cta: 'Contact sales',
    },
  ]

  return (
    <PublicPageWrapper>
      <div className="space-y-20">
        {/* Header */}
        <div className="text-center">
          <p className="text-sm text-muted-foreground mb-3">Pricing</p>
          <h1 className="text-5xl sm:text-6xl font-bold mb-4">
            Simple, transparent
            <br />
            <span className="text-muted-foreground">pricing</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Start free and scale as you grow. No hidden fees, no surprises.
          </p>
        </div>

        {/* Billing Toggle */}
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => setAnnual(false)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              !annual ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setAnnual(true)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${
              annual ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Annual
            <span className="text-xs bg-green-500/20 text-green-500 px-2 py-0.5 rounded-full">Save 17%</span>
          </button>
        </div>

        {/* Pricing Cards */}
        <div className="grid lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative p-8 rounded-xl border transition-all duration-300 flex flex-col ${
                plan.highlighted
                  ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                  : 'border-border/40 hover:border-primary/40'
              }`}
            >
              {plan.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-primary text-primary-foreground text-xs font-medium px-3 py-1 rounded-full">
                    Most Popular
                  </span>
                </div>
              )}

              <div className="mb-6">
                <span className="text-sm text-muted-foreground font-mono">{plan.number}</span>
                <h3 className="text-2xl font-bold mt-2">{plan.name}</h3>
                <p className="text-sm text-muted-foreground mt-1">{plan.description}</p>
              </div>

              <div className="mb-8">
                {plan.price !== null ? (
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold">${plan.price}</span>
                    <span className="text-muted-foreground">/month</span>
                  </div>
                ) : (
                  <span className="text-4xl font-bold">Custom</span>
                )}
              </div>

              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <span className="text-sm text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>

              <Button
                asChild
                variant={plan.highlighted ? 'default' : 'outline'}
                className="w-full gap-2"
              >
                <Link href={plan.price === null ? '/support' : `/auth/signup?plan=${plan.name.toLowerCase()}`}>
                  {plan.cta}
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </Button>
            </div>
          ))}
        </div>

        {/* FAQ Section */}
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-sm text-muted-foreground mb-3">FAQ</p>
            <h2 className="text-4xl font-bold">
              Frequently asked
              <br />
              <span className="text-muted-foreground">questions</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {[
              {
                q: 'Can I change plans anytime?',
                a: 'Yes, you can upgrade or downgrade at any time. Changes take effect immediately with prorated pricing.',
              },
              {
                q: 'Is there a free trial?',
                a: 'Yes, all paid plans come with a 14-day free trial. No credit card required to get started.',
              },
              {
                q: 'What payment methods do you accept?',
                a: 'We accept all major credit cards via Stripe, and also support bank transfers for enterprise customers.',
              },
              {
                q: 'Do you offer discounts for annual billing?',
                a: 'Yes, annual plans get 17% discount. Contact sales for volume and enterprise discounts.',
              },
            ].map((faq, i) => (
              <div
                key={i}
                className="p-6 rounded-xl border border-border/40 hover:border-primary/40 transition-colors"
              >
                <h3 className="font-semibold mb-2">{faq.q}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="text-center py-12 border-t border-border/40">
          <h2 className="text-3xl font-bold mb-4">Ready to get started?</h2>
          <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
            Join thousands of developers who are already using CodeSpectra to improve their code quality.
          </p>
          <div className="flex gap-4 justify-center">
            <Button size="lg" asChild className="gap-2">
              <Link href="/auth/signup">
                Start free trial
                <ArrowRight className="w-4 h-4" />
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
