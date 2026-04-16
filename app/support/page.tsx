'use client'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { MessageSquare, AlertCircle, CheckCircle, Clock, Search } from 'lucide-react'
import { useState } from 'react'

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
    <div className="space-y-12 py-12">
      <div>
        <h1 className="text-4xl font-bold mb-4">Support & Help</h1>
        <p className="text-xl text-muted-foreground">Get help and find answers to common questions</p>
      </div>

      <div className="grid md:grid-cols-3 gap-6 mb-12">
        <Card className="p-6 text-center hover:shadow-lg transition-shadow">
          <MessageSquare className="w-8 h-8 text-primary mx-auto mb-4" />
          <h3 className="font-semibold mb-2">Create a Ticket</h3>
          <p className="text-sm text-muted-foreground mb-4">Get help from our support team</p>
          <Link href="/dashboard/support">
            <Button variant="outline" className="w-full">Open Ticket</Button>
          </Link>
        </Card>

        <Card className="p-6 text-center hover:shadow-lg transition-shadow">
          <AlertCircle className="w-8 h-8 text-primary mx-auto mb-4" />
          <h3 className="font-semibold mb-2">Check Status</h3>
          <p className="text-sm text-muted-foreground mb-4">View system status and incidents</p>
          <a href="#" className="inline-block w-full">
            <Button variant="outline" className="w-full">System Status</Button>
          </a>
        </Card>

        <Card className="p-6 text-center hover:shadow-lg transition-shadow">
          <Clock className="w-8 h-8 text-primary mx-auto mb-4" />
          <h3 className="font-semibold mb-2">Response Times</h3>
          <p className="text-sm text-muted-foreground mb-4">~2 hours for priority issues</p>
          <Button variant="outline" className="w-full" disabled>View SLA</Button>
        </Card>
      </div>

      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold mb-4">Frequently Asked Questions</h2>
          <div className="relative mb-6">
            <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search FAQs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border rounded-lg"
            />
          </div>
        </div>

        {filteredFaqs.length === 0 ? (
          <Card className="p-6 text-center text-muted-foreground">
            No FAQs matching your search
          </Card>
        ) : (
          filteredFaqs.map((section) => (
            <div key={section.category}>
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Badge variant="outline">{section.category}</Badge>
              </h3>
              <div className="space-y-3">
                {section.questions.map((faq, i) => (
                  <Card key={i} className="p-4 hover:bg-muted/50 transition-colors">
                    <details className="cursor-pointer">
                      <summary className="font-semibold flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                        {faq.q}
                      </summary>
                      <p className="text-sm text-muted-foreground mt-3 ml-6">
                        {faq.a}
                      </p>
                    </details>
                  </Card>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <Card className="p-8 bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
        <div className="text-center">
          <h3 className="text-2xl font-bold mb-2">Still need help?</h3>
          <p className="text-muted-foreground mb-6">
            Our support team is available 24/7 to assist you with any questions or issues.
          </p>
          <Link href="/dashboard/support">
            <Button size="lg">Contact Support Team</Button>
          </Link>
        </div>
      </Card>
    </div>
  )
}
