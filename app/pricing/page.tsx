'use client'

import { Button } from '@/components/ui/button'
import { Check } from 'lucide-react'
import { PublicPageWrapper } from '@/app/public-layout'

export default function PricingPage() {
  const plans = [
    {
      name: 'Starter',
      price: 29,
      description: 'Perfect for individuals',
      features: [
        'Up to 5 team members',
        'Basic code analysis',
        'Community support',
        '1GB storage',
        'Basic exams',
        'Limited integrations'
      ],
      highlighted: false
    },
    {
      name: 'Professional',
      price: 99,
      description: 'For growing teams',
      features: [
        'Up to 50 team members',
        'Advanced code analysis',
        'Priority support',
        '100GB storage',
        'Unlimited exams',
        'GitHub, Slack, GitLab',
        'AI resume analysis',
        'Job posting (10/month)',
        'Custom branding'
      ],
      highlighted: true
    },
    {
      name: 'Enterprise',
      price: 299,
      description: 'For large organizations',
      features: [
        'Unlimited team members',
        'Premium code analysis',
        '24/7 dedicated support',
        'Unlimited storage',
        'All features included',
        'SSO & SAML',
        'API access',
        'Custom integrations',
        'SLA guarantee'
      ],
      highlighted: false
    }
  ]

  return (
    <PublicPageWrapper>
      <div className="space-y-20">
        {/* Header */}
        <div className="text-center space-y-4 max-w-3xl mx-auto">
          <h1 className="text-6xl font-bold text-foreground">Simple, transparent pricing</h1>
          <p className="text-xl text-muted-foreground">Start free and scale as you grow. No hidden fees, no surprises.</p>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative rounded-xl border transition-all duration-300 p-8 flex flex-col ${
                plan.highlighted
                  ? 'border-primary bg-gradient-to-br from-primary/10 to-primary/5 ring-2 ring-primary/30 shadow-xl'
                  : 'border-border/50 bg-card hover:border-primary/30 hover:shadow-lg'
              }`}
            >
              {plan.highlighted && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <span className="inline-block bg-primary text-primary-foreground px-4 py-1 rounded-full text-sm font-semibold">Most Popular</span>
                </div>
              )}
              
              <div className="mb-8">
                <h3 className="text-2xl font-bold text-foreground mb-2">{plan.name}</h3>
                <p className="text-muted-foreground text-sm">{plan.description}</p>
              </div>

              <div className="mb-8">
                <div className="flex items-baseline gap-1">
                  <span className="text-5xl font-bold text-foreground">${plan.price}</span>
                  <span className="text-muted-foreground text-sm">/month</span>
                </div>
              </div>

              <button
                onClick={() => window.location.href = `/auth/signup?plan=${plan.name.toLowerCase()}`}
                className={`w-full py-3 px-4 rounded-lg font-semibold mb-8 transition-all duration-200 ${
                  plan.highlighted
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-md hover:shadow-lg'
                    : 'bg-muted text-foreground hover:bg-muted/80 border border-border/50'
                }`}
              >
                Get Started
              </button>

              <div className="space-y-4 flex-1">
                {plan.features.map((feature) => (
                  <div key={feature} className="flex gap-3 items-start">
                    <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                    <span className="text-sm text-foreground/80 leading-relaxed">{feature}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* FAQ Section */}
        <div className="max-w-4xl mx-auto pt-8">
          <h2 className="text-4xl font-bold text-center text-foreground mb-16">Frequently asked questions</h2>
          <div className="grid md:grid-cols-2 gap-8">
            {[
              { q: 'Can I change plans anytime?', a: 'Yes, you can upgrade or downgrade at any time. Changes take effect immediately with prorated pricing.' },
              { q: 'Is there a free trial?', a: 'Yes, all plans come with a 14-day free trial. No credit card required to get started.' },
              { q: 'What payment methods do you accept?', a: 'We accept all major credit cards via Stripe, and also support bank transfers for enterprise customers.' },
              { q: 'Do you offer discounts for annual billing?', a: 'Yes, annual plans get 20% discount. Contact sales for volume and enterprise discounts.' }
            ].map((faq, i) => (
              <div key={i} className="p-6 rounded-lg border border-border/50 hover:border-primary/30 transition-all duration-300">
                <h3 className="font-semibold text-foreground mb-3">{faq.q}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PublicPageWrapper>
  )
}
