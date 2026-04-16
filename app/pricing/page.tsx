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
      <div className="space-y-12">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="text-center mb-16">
            <h1 className="text-5xl sm:text-6xl font-bold text-foreground mb-4">Simple, Transparent Pricing</h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">Choose the perfect plan for your organization. All plans include a 14-day free trial.</p>
          </div>

          {/* Pricing Cards */}
          <div className="grid md:grid-cols-3 gap-8 mb-16">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`relative rounded-lg border transition-all duration-300 hover:shadow-lg p-8 flex flex-col ${plan.highlighted ? 'border-primary bg-gradient-to-br from-primary/5 to-primary/10 ring-2 ring-primary/20' : 'border-border/50 bg-card hover:border-primary/50'}`}
              >
                {plan.highlighted && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <div className="bg-primary text-primary-foreground px-4 py-1 rounded-full text-sm font-semibold">
                      Most Popular
                    </div>
                  </div>
                )}
                <h2 className="text-2xl font-bold mb-2 text-foreground">{plan.name}</h2>
                <p className="text-muted-foreground text-sm mb-6">{plan.description}</p>

                <div className="mb-8">
                  <span className="text-4xl font-bold text-foreground">${plan.price}</span>
                  <span className="text-muted-foreground">/month</span>
                </div>

                <button
                  onClick={() => window.location.href = `/auth/signup?plan=${plan.name.toLowerCase()}`}
                  className={`w-full py-3 px-4 rounded-lg font-semibold mb-8 transition-all duration-200 ${
                    plan.highlighted
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg hover:shadow-xl'
                      : 'bg-muted text-foreground hover:bg-muted/80 border border-border/50'
                  }`}
                >
                  Get Started
                </button>

                <div className="space-y-4 flex-1">
                  {plan.features.map((feature) => (
                    <div key={feature} className="flex gap-3 items-start">
                      <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Check className="w-3 h-3 text-green-600" />
                      </div>
                      <span className="text-sm text-foreground/80">{feature}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* FAQ Section */}
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-12 text-foreground">Frequently Asked Questions</h2>
            <div className="grid md:grid-cols-2 gap-8">
              {[
                { q: 'Can I change plans anytime?', a: 'Yes, you can upgrade or downgrade at any time. Changes take effect at the next billing cycle.' },
                { q: 'Is there a free trial?', a: 'Yes, all plans come with a 14-day free trial. No credit card required.' },
                { q: 'What payment methods do you accept?', a: 'We accept all major credit cards via Stripe, and also support bank transfers for enterprise customers.' },
                { q: 'Do you offer discounts for annual billing?', a: 'Yes, annual plans get 20% discount. Contact sales for enterprise discounts.' }
              ].map((faq, i) => (
                <div key={i} className="p-6 rounded-lg border border-border/50 bg-card hover:border-primary/50 transition-all duration-300">
                  <h3 className="font-semibold mb-3 text-foreground text-lg">{faq.q}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{faq.a}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </PublicPageWrapper>
  )
}
