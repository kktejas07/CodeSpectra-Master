'use client'

import Link from 'next/link'
import { BookOpen, MessageSquare, Search, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PublicPageWrapper } from '@/app/public-layout'

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
    <PublicPageWrapper>
      <div className="space-y-16">
        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-6xl font-bold text-foreground">Documentation</h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">Everything you need to know about CodeSpectra</p>
        </div>

        {/* Search */}
        <div className="max-w-2xl mx-auto w-full">
          <div className="relative">
            <Search className="absolute left-3 top-3.5 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search documentation..."
              className="w-full pl-10 pr-4 py-2.5 border border-border/50 rounded-lg bg-card hover:border-primary/30 transition-colors focus:border-primary focus:outline-none"
            />
          </div>
        </div>

        {/* Documentation Grid */}
        <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto w-full">
          {sections.map((section) => (
            <div key={section.title} className="p-6 border border-border/50 rounded-lg hover:border-primary/30 hover:shadow-md transition-all duration-300">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <BookOpen className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">{section.title}</h2>
                  <p className="text-sm text-muted-foreground mt-1">{section.description}</p>
                </div>
              </div>
              <ul className="space-y-2">
                {section.articles.map((article) => (
                  <li key={article}>
                    <a href="#" className="flex items-center justify-between text-sm text-primary hover:text-primary/80 transition-colors group">
                      <span>{article}</span>
                      <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Help CTA */}
        <div className="p-8 border border-primary/20 rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 max-w-3xl mx-auto w-full">
          <div className="flex items-start gap-4">
            <MessageSquare className="w-6 h-6 text-primary flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-foreground text-lg mb-2">Need help?</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Can't find what you're looking for? Our support team is here to help 24/7.
              </p>
              <div className="flex gap-3">
                <Button asChild className="rounded-lg">
                  <Link href="/support">Contact Support</Link>
                </Button>
                <Button variant="outline" asChild className="rounded-lg">
                  <a href="#">Check FAQ</a>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PublicPageWrapper>
  )
}
