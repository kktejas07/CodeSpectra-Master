'use client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { MessageSquare, AlertCircle, CheckCircle, Clock, Search } from 'lucide-react'
import { useState } from 'react'
import { PublicPageWrapper } from '@/app/public-layout'

export default function SupportPortalPage() {
  const [searchQuery, setSearchQuery] = useState('')

  const faqs = [
    {
      category: 'Billing',
      questions: [
        {
          q: 'How do I upgrade my plan?',
          a: 'You can upgrade your plan at any time from the Billing settings. The change will take effect immediately with prorated pricing.'
        },
        {
          q: 'Can I cancel my subscription anytime?',
          a: 'Yes, you can cancel anytime. Your access will continue until the end of the current billing period.'
        },
        {
          q: 'Do you offer refunds?',
          a: 'We offer refunds within 30 days of purchase if you\'re not satisfied.'
        }
      ]
    },
    {
      category: 'Technical',
      questions: [
        {
          q: 'What are the system requirements?',
          a: 'CodeSpectra works on all modern browsers. We support Chrome, Firefox, Safari, and Edge.'
        },
        {
          q: 'Is my data secure?',
          a: 'Yes, all data is encrypted in transit and at rest. We comply with GDPR and SOC 2 standards.'
        },
        {
          q: 'How often is data backed up?',
          a: 'We perform automated backups every hour. Your data is distributed across multiple geographic regions.'
        }
      ]
    },
    {
      category: 'Features',
      questions: [
        {
          q: 'Can I use CodeSpectra for personal projects?',
          a: 'Yes, our Starter plan is perfect for individuals and personal projects.'
        },
        {
          q: 'How many team members can I invite?',
          a: 'It depends on your plan. Starter: 5, Professional: 50, Enterprise: Unlimited'
        }
      ]
    }
  ]

  const filteredFaqs = faqs.map(section => ({
    ...section,
    questions: section.questions.filter(q =>
      q.q.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.a.toLowerCase().includes(searchQuery.toLowerCase())
    )
  })).filter(section => section.questions.length > 0)

  return (
    <PublicPageWrapper>
      <div className="space-y-16">
        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-6xl font-bold text-foreground">Support & help</h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">Get help and find answers to common questions</p>
        </div>

        {/* Support Cards */}
        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto w-full">
          {[
            { icon: MessageSquare, title: 'Create a ticket', desc: 'Get help from our support team', href: '/dashboard/support' },
            { icon: AlertCircle, title: 'Check status', desc: 'View system status and incidents', href: '#' },
            { icon: Clock, title: 'Response times', desc: '~2 hours for priority issues', href: '#' }
          ].map((item, i) => {
            const Icon = item.icon
            return (
              <div key={i} className="p-6 border border-border/50 rounded-lg hover:border-primary/30 hover:shadow-md transition-all duration-300">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground mb-4">{item.desc}</p>
                <Button variant={i === 2 ? 'outline' : 'outline'} size="sm" asChild disabled={i === 2} className="w-full">
                  <Link href={item.href}>{i === 2 ? 'View SLA' : 'Learn More'}</Link>
                </Button>
              </div>
            )
          })}
        </div>

        {/* FAQs */}
        <div className="max-w-3xl mx-auto w-full">
          <div className="mb-8">
            <h2 className="text-4xl font-bold mb-6 text-foreground">Frequently asked questions</h2>
            <div className="relative">
              <Search className="absolute left-3 top-3.5 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search FAQs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-border/50 rounded-lg bg-card hover:border-primary/30 transition-colors focus:border-primary focus:outline-none"
              />
            </div>
          </div>

          {filteredFaqs.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground border border-border/50 rounded-lg bg-card">
              No FAQs matching your search
            </div>
          ) : (
            filteredFaqs.map((section) => (
              <div key={section.category} className="mb-8">
                <div className="flex items-center gap-3 mb-4">
                  <Badge variant="outline" className="text-xs">{section.category}</Badge>
                </div>
                <div className="space-y-3">
                  {section.questions.map((faq, i) => (
                    <div key={i} className="p-4 border border-border/50 rounded-lg hover:bg-muted/30 transition-colors">
                      <details className="cursor-pointer group">
                        <summary className="font-semibold flex items-center gap-2 text-foreground group-open:text-primary transition-colors">
                          <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                          {faq.q}
                        </summary>
                        <p className="text-sm text-muted-foreground mt-3 ml-6 leading-relaxed">
                          {faq.a}
                        </p>
                      </details>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Help CTA */}
        <div className="p-8 border border-primary/20 rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 text-center max-w-3xl mx-auto w-full">
          <h3 className="text-2xl font-bold text-foreground mb-2">Still need help?</h3>
          <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
            Our support team is available 24/7 to assist you with any questions or issues.
          </p>
          <Button size="lg" asChild className="rounded-lg">
            <Link href="/dashboard/support">Contact Support Team</Link>
          </Button>
        </div>
      </div>
    </PublicPageWrapper>
  )
}
