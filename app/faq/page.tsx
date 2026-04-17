'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { ChevronDown } from 'lucide-react'

export default function FAQPage() {
  const [openIndex, setOpenIndex] = useState(0)

  const faqs = [
    {
      category: 'Getting Started',
      items: [
        {
          q: 'How do I get started with CodeSpectra?',
          a: 'Sign up for a free account, connect your repository, and start your first code scan in minutes. No credit card required.',
        },
        {
          q: 'What languages does CodeSpectra support?',
          a: 'We support 40+ programming languages including JavaScript, Python, Java, C++, Go, Rust, TypeScript, PHP, and many more.',
        },
        {
          q: 'How often should I run code scans?',
          a: 'We recommend running scans on every commit or at least once daily for best results.',
        },
      ],
    },
    {
      category: 'Integrations',
      items: [
        {
          q: 'Can I integrate CodeSpectra with my GitHub repository?',
          a: 'Yes! GitHub integration is available for all plans. Simply authorize and select your repositories.',
        },
        {
          q: 'Do you support GitLab and Bitbucket?',
          a: 'Yes, we support GitHub, GitLab, Bitbucket, and Gitea. Integration setup is quick and easy.',
        },
        {
          q: 'Can I integrate with Slack?',
          a: 'Yes, get real-time notifications about your code scans and issues directly in Slack.',
        },
      ],
    },
    {
      category: 'Billing & Pricing',
      items: [
        {
          q: 'Can I cancel my subscription anytime?',
          a: 'Yes, you can cancel anytime with no lock-in contracts. Your access continues until the end of your billing period.',
        },
        {
          q: 'Do you offer discounts for nonprofits?',
          a: 'Yes! Nonprofits and open-source projects get 50% off all plans. Contact our sales team.',
        },
        {
          q: 'What is your refund policy?',
          a: 'We offer a 30-day money-back guarantee if you\'re not satisfied.',
        },
      ],
    },
    {
      category: 'Security & Privacy',
      items: [
        {
          q: 'Is my code secure with CodeSpectra?',
          a: 'Yes, we use bank-level encryption and never store your source code. We only analyze and report findings.',
        },
        {
          q: 'Do you comply with GDPR?',
          a: 'Yes, CodeSpectra is fully GDPR compliant and SOC 2 certified.',
        },
        {
          q: 'Can I export my data?',
          a: 'Yes, you can export all your reports and data anytime in multiple formats.',
        },
      ],
    },
  ]

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="pt-20 pb-16 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto text-center">
        <h1 className="text-4xl sm:text-5xl font-bold text-foreground mb-4">
          Frequently Asked Questions
        </h1>
        <p className="text-lg text-muted-foreground">
          Find answers to common questions about CodeSpectra.
        </p>
      </div>

      {/* FAQs */}
      <div className="px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto pb-20">
        {faqs.map((section, sectionIdx) => (
          <div key={sectionIdx} className="mb-12">
            <h2 className="text-2xl font-bold text-foreground mb-6">{section.category}</h2>
            <div className="space-y-4">
              {section.items.map((item, itemIdx) => (
                <Card
                  key={itemIdx}
                  className="p-6 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() =>
                    setOpenIndex(
                      openIndex === `${sectionIdx}-${itemIdx}` ? null : `${sectionIdx}-${itemIdx}`
                    )
                  }
                >
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-foreground pr-4">{item.q}</h3>
                    <ChevronDown
                      className={`w-5 h-5 text-muted-foreground flex-shrink-0 transition-transform ${
                        openIndex === `${sectionIdx}-${itemIdx}` ? 'rotate-180' : ''
                      }`}
                    />
                  </div>
                  {openIndex === `${sectionIdx}-${itemIdx}` && (
                    <p className="text-muted-foreground mt-4">{item.a}</p>
                  )}
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Contact */}
      <div className="bg-muted/30 py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl font-bold text-foreground mb-4">Still have questions?</h2>
          <p className="text-muted-foreground mb-6">
            Can&apos;t find the answer you&apos;re looking for? Contact our support team.
          </p>
          <a
            href="mailto:support@codespectra.dev"
            className="text-primary hover:underline font-semibold"
          >
            support@codespectra.dev
          </a>
        </div>
      </div>
    </div>
  )
}
