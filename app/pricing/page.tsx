'use client'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Check } from 'lucide-react'

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
        'GitHub, Slack, SonarQube',
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
    <div className="space-y-12 py-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">Simple, Transparent Pricing</h1>
        <p className="text-xl text-muted-foreground">Choose the perfect plan for your organization</p>
      </div>

      <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
        {plans.map((plan) => (
          <Card
            key={plan.name}
            className={`relative p-6 flex flex-col ${plan.highlighted ? 'border-2 border-primary' : ''}`}
          >
            {plan.highlighted && (
              <Badge className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-primary">
                Most Popular
              </Badge>
            )}
            <h2 className="text-2xl font-bold mb-2">{plan.name}</h2>
            <p className="text-muted-foreground text-sm mb-6">{plan.description}</p>

            <div className="mb-6">
              <span className="text-4xl font-bold">${plan.price}</span>
              <span className="text-muted-foreground">/month</span>
            </div>

            <Button
              className="w-full mb-6"
              variant={plan.highlighted ? 'default' : 'outline'}
              onClick={() => window.location.href = `/signup?plan=${plan.name.toLowerCase()}`}
            >
              Get Started
            </Button>

            <div className="space-y-3 flex-1">
              {plan.features.map((feature) => (
                <div key={feature} className="flex gap-2">
                  <Check className="w-5 h-5 text-green-600 flex-shrink-0" />
                  <span className="text-sm">{feature}</span>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>

      <div className="max-w-4xl mx-auto mt-12 space-y-6">
        <h2 className="text-2xl font-bold text-center">Frequently Asked Questions</h2>
        <div className="space-y-4">
          {[
            { q: 'Can I change plans anytime?', a: 'Yes, you can upgrade or downgrade at any time. Changes take effect at the next billing cycle.' },
            { q: 'Is there a free trial?', a: 'Yes, all plans come with a 14-day free trial. No credit card required.' },
            { q: 'What payment methods do you accept?', a: 'We accept all major credit cards via Stripe, and also support bank transfers for enterprise customers.' },
            { q: 'Do you offer discounts for annual billing?', a: 'Yes, annual plans get 20% discount. Contact sales for enterprise discounts.' }
          ].map((faq, i) => (
            <Card key={i} className="p-4">
              <h3 className="font-semibold mb-2">{faq.q}</h3>
              <p className="text-sm text-muted-foreground">{faq.a}</p>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
