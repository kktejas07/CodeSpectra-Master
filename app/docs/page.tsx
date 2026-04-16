'use client'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { BookOpen, MessageSquare, Search, ChevronRight } from 'lucide-react'

export default function DocsPage() {
  const sections = [
    {
      title: 'Getting Started',
      description: 'Learn the basics and set up your first project',
      articles: [
        'Welcome to CodeSpectra',
        'Creating Your First Organization',
        'Inviting Team Members',
        'Setting Up Integrations'
      ]
    },
    {
      title: 'User Guide',
      description: 'Comprehensive guide to all features',
      articles: [
        'Code Scanner Documentation',
        'Creating and Taking Exams',
        'Job Posting and Application',
        'Resume Management and AI Analysis'
      ]
    },
    {
      title: 'Admin Guide',
      description: 'For organization administrators',
      articles: [
        'Organization Settings',
        'Team and Permission Management',
        'Billing and Subscriptions',
        'Integration Management'
      ]
    },
    {
      title: 'API Reference',
      description: 'For developers integrating with CodeSpectra',
      articles: [
        'Authentication',
        'REST API Overview',
        'Code Analysis API',
        'Webhooks'
      ]
    }
  ]

  return (
    <div className="space-y-12 py-12">
      <div>
        <h1 className="text-4xl font-bold mb-4">Documentation</h1>
        <p className="text-xl text-muted-foreground">Everything you need to know about CodeSpectra</p>
      </div>

      <div className="flex gap-2 max-w-md">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search documentation..."
            className="w-full pl-10 pr-4 py-2 border rounded-lg"
          />
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {sections.map((section) => (
          <Card key={section.title} className="p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-start gap-3 mb-4">
              <BookOpen className="w-6 h-6 text-primary flex-shrink-0" />
              <div>
                <h2 className="text-lg font-semibold">{section.title}</h2>
                <p className="text-sm text-muted-foreground">{section.description}</p>
              </div>
            </div>
            <ul className="space-y-2">
              {section.articles.map((article) => (
                <li key={article}>
                  <a href="#" className="flex items-center justify-between text-sm text-primary hover:underline group">
                    {article}
                    <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </a>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>

      <Card className="p-8 bg-blue-50 dark:bg-blue-950/20">
        <div className="flex items-start gap-4">
          <MessageSquare className="w-6 h-6 text-blue-600 flex-shrink-0 mt-1" />
          <div>
            <h3 className="font-semibold mb-2">Need Help?</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Can't find what you're looking for? Our support team is here to help.
            </p>
            <div className="flex gap-2">
              <Link href="/support">
                <Button variant="default">Contact Support</Button>
              </Link>
              <a href="#" className="inline-flex items-center text-sm text-primary hover:underline">
                Check FAQ
              </a>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}
