'use client'

import Link from 'next/link'
import { BookOpen, MessageSquare, Search, ChevronRight, Code2, Zap, Shield, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PublicPageWrapper } from '@/app/public-layout'
import { useState } from 'react'

export default function DocsPage() {
  const [searchQuery, setSearchQuery] = useState('')

  const sections = [
    {
      icon: Zap,
      title: 'Getting Started',
      description: 'Learn the basics and set up your first project',
      articles: [
        'Welcome to CodeSpectra',
        'Creating Your First Organization',
        'Inviting Team Members',
        'Setting Up Integrations',
      ],
    },
    {
      icon: Code2,
      title: 'User Guide',
      description: 'Comprehensive guide to all features',
      articles: [
        'Code Scanner Documentation',
        'Creating and Taking Exams',
        'Job Posting and Application',
        'Resume Management and AI Analysis',
      ],
    },
    {
      icon: Settings,
      title: 'Admin Guide',
      description: 'For organization administrators',
      articles: [
        'Organization Settings',
        'Team and Permission Management',
        'Billing and Subscriptions',
        'Integration Management',
      ],
    },
    {
      icon: Shield,
      title: 'API Reference',
      description: 'For developers integrating with CodeSpectra',
      articles: [
        'Authentication',
        'REST API Overview',
        'Code Analysis API',
        'Webhooks',
      ],
    },
  ]

  return (
    <PublicPageWrapper>
      <div className="space-y-16">
        {/* Header */}
        <div className="text-center">
          <p className="text-sm text-muted-foreground mb-3">Resources</p>
          <h1 className="text-5xl sm:text-6xl font-bold mb-4">
            Documentation
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Everything you need to know about CodeSpectra. Guides, tutorials, and API reference.
          </p>
        </div>

        {/* Search */}
        <div className="max-w-2xl mx-auto">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search documentation..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 border border-border/40 rounded-xl bg-background hover:border-primary/40 transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>

        {/* Documentation Grid */}
        <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto">
          {sections.map((section) => {
            const Icon = section.icon
            return (
              <div
                key={section.title}
                className="p-6 border border-border/40 rounded-xl hover:border-primary/40 hover:bg-primary/5 transition-all duration-300"
              >
                <div className="flex items-start gap-4 mb-5">
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold">{section.title}</h2>
                    <p className="text-sm text-muted-foreground mt-1">{section.description}</p>
                  </div>
                </div>
                <ul className="space-y-2">
                  {section.articles.map((article) => (
                    <li key={article}>
                      <a
                        href="#"
                        className="flex items-center justify-between py-2 px-3 -mx-3 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors group"
                      >
                        <span>{article}</span>
                        <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>

        {/* Quick Links */}
        <div className="grid sm:grid-cols-3 gap-4 max-w-4xl mx-auto">
          {[
            { title: 'TypeScript', desc: 'Full type safety with auto-generated types' },
            { title: 'Zero config', desc: 'Sensible defaults that just work' },
            { title: 'Edge-ready', desc: 'Runs anywhere: Node, Deno, Bun, browsers' },
          ].map((item) => (
            <div key={item.title} className="p-4 border border-border/40 rounded-xl text-center">
              <h3 className="font-semibold mb-1">{item.title}</h3>
              <p className="text-sm text-muted-foreground">{item.desc}</p>
            </div>
          ))}
        </div>

        {/* Help CTA */}
        <div className="p-8 border border-primary/20 rounded-xl bg-primary/5 max-w-3xl mx-auto">
          <div className="flex items-start gap-4">
            <MessageSquare className="w-6 h-6 text-primary shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-lg mb-2">Need help?</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Can&apos;t find what you&apos;re looking for? Our support team is here to help 24/7.
              </p>
              <div className="flex gap-3">
                <Button asChild>
                  <Link href="/support">Contact Support</Link>
                </Button>
                <Button variant="outline" asChild>
                  <a href="#">View FAQ</a>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PublicPageWrapper>
  )
}
