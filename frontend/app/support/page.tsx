'use client'

import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { MessageSquare, AlertCircle, Clock, Search, ChevronDown, Mail, Phone, Building } from 'lucide-react'
import { useState } from 'react'
import { PublicPageWrapper } from '@/app/public-layout'

export default function SupportPortalPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  const faqs = [
    {
      category: 'Billing',
      questions: [
        {
          q: 'How do I upgrade my plan?',
          a: 'You can upgrade your plan at any time from the Billing settings. The change will take effect immediately with prorated pricing.',
        },
        {
          q: 'Can I cancel my subscription anytime?',
          a: "Yes, you can cancel anytime. Your access will continue until the end of the current billing period.",
        },
        {
          q: 'Do you offer refunds?',
          a: "We offer refunds within 30 days of purchase if you're not satisfied.",
        },
      ],
    },
    {
      category: 'Technical',
      questions: [
        {
          q: 'What are the system requirements?',
          a: 'CodeSpectra works on all modern browsers. We support Chrome, Firefox, Safari, and Edge.',
        },
        {
          q: 'Is my data secure?',
          a: 'Yes, all data is encrypted in transit and at rest. We comply with GDPR and SOC 2 standards.',
        },
        {
          q: 'How often is data backed up?',
          a: 'We perform automated backups every hour. Your data is distributed across multiple geographic regions.',
        },
      ],
    },
    {
      category: 'Features',
      questions: [
        {
          q: 'Can I use CodeSpectra for personal projects?',
          a: 'Yes, our Starter plan is perfect for individuals and personal projects.',
        },
        {
          q: 'How many team members can I invite?',
          a: 'It depends on your plan. Starter: 5, Professional: 50, Enterprise: Unlimited',
        },
      ],
    },
  ]

  const allQuestions = faqs.flatMap((section) =>
    section.questions.map((q, i) => ({
      ...q,
      category: section.category,
      id: `${section.category}-${i}`,
    }))
  )

  const filteredQuestions = searchQuery
    ? allQuestions.filter(
        (q) =>
          q.q.toLowerCase().includes(searchQuery.toLowerCase()) ||
          q.a.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : allQuestions

  return (
    <PublicPageWrapper>
      <div className="space-y-16">
        {/* Header */}
        <div className="text-center">
          <p className="text-sm text-muted-foreground mb-3">Support</p>
          <h1 className="text-5xl sm:text-6xl font-bold mb-4">
            How can we
            <br />
            <span className="text-muted-foreground">help you?</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Get help and find answers to common questions. Our team is here 24/7.
          </p>
        </div>

        {/* Support Cards */}
        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {[
            {
              icon: MessageSquare,
              title: 'Create a ticket',
              desc: 'Get help from our support team',
              href: '/dashboard/support',
              cta: 'Submit ticket',
            },
            {
              icon: AlertCircle,
              title: 'System status',
              desc: 'Security posture and operational notes',
              href: '/security',
              cta: 'Read security',
            },
            {
              icon: Clock,
              title: 'Response times',
              desc: 'Typical turnaround for priority issues',
              href: '/terms',
              cta: 'View terms',
            },
          ].map((item, i) => {
            const Icon = item.icon
            return (
              <div
                key={i}
                className="p-6 border border-border/40 rounded-xl hover:border-primary/40 hover:bg-primary/5 transition-all duration-300"
              >
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-muted-foreground" />
                </div>
                <h3 className="font-semibold mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground mb-4">{item.desc}</p>
                <Button variant="outline" size="sm" asChild className="w-full">
                  <Link href={item.href}>{item.cta}</Link>
                </Button>
              </div>
            )
          })}
        </div>

        {/* FAQs */}
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-8">
            <p className="text-sm text-muted-foreground mb-3">FAQ</p>
            <h2 className="text-4xl font-bold mb-6">
              Frequently asked
              <br />
              <span className="text-muted-foreground">questions</span>
            </h2>
          </div>

          <div className="mb-8">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search FAQs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3 border border-border/40 rounded-xl bg-background hover:border-primary/40 transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          {filteredQuestions.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground border border-border/40 rounded-xl">
              No FAQs matching your search
            </div>
          ) : (
            <div className="space-y-3">
              {filteredQuestions.map((faq, i) => (
                <div
                  key={faq.id}
                  className="border border-border/40 rounded-xl overflow-hidden"
                >
                  <button
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-md">
                        {faq.category}
                      </span>
                      <span className="font-medium">{faq.q}</span>
                    </div>
                    <ChevronDown
                      className={`w-5 h-5 text-muted-foreground transition-transform ${
                        openFaq === i ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {openFaq === i && (
                    <div className="px-4 pb-4">
                      <p className="text-sm text-muted-foreground leading-relaxed pl-[calc(0.5rem+4ch+0.75rem)]">
                        {faq.a}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Contact Section */}
        <div className="border-t border-border/40 pt-16">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">Other ways to reach us</h2>
            <p className="text-muted-foreground">Choose the best option for your needs</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {[
              { icon: Mail, title: 'Email', value: 'support@codespectra.dev' },
              { icon: Phone, title: 'Phone', value: '+1 (555) 123-4567' },
              { icon: Building, title: 'Office', value: 'San Francisco, CA' },
            ].map((item) => {
              const Icon = item.icon
              return (
                <div key={item.title} className="text-center p-6 border border-border/40 rounded-xl">
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center mx-auto mb-4">
                    <Icon className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <h3 className="font-semibold mb-1">{item.title}</h3>
                  <p className="text-sm text-muted-foreground">{item.value}</p>
                </div>
              )
            })}
          </div>
        </div>

        {/* CTA */}
        <div className="text-center p-8 border border-primary/20 rounded-xl bg-primary/5 max-w-3xl mx-auto">
          <h3 className="text-2xl font-bold mb-2">Still need help?</h3>
          <p className="text-muted-foreground mb-6">
            Our support team is available 24/7 to assist you with any questions or issues.
          </p>
          <Button size="lg" asChild>
            <Link href="/dashboard/support">Contact Support Team</Link>
          </Button>
        </div>
      </div>
    </PublicPageWrapper>
  )
}
