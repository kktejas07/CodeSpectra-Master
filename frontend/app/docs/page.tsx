'use client'

import Link from 'next/link'
import { MessageSquare, Search, ChevronRight, Code2, Zap, Shield, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PublicPageWrapper } from '@/app/public-layout'
import { useMemo, useState } from 'react'

type DocArticle = { label: string; href: string }

const sections: {
  icon: typeof Zap
  title: string
  description: string
  articles: DocArticle[]
}[] = [
  {
    icon: Zap,
    title: 'Getting Started',
    description: 'Learn the basics and set up your first project',
    articles: [
      { label: 'Welcome to CodeSpectra', href: '/about' },
      { label: 'Creating Your First Organization', href: '/faq' },
      { label: 'Inviting Team Members', href: '/faq' },
      { label: 'Setting Up Integrations', href: '/features' },
    ],
  },
  {
    icon: Code2,
    title: 'User Guide',
    description: 'Comprehensive guide to all features',
    articles: [
      { label: 'Code Scanner Documentation', href: '/features' },
      { label: 'Creating and Taking Exams', href: '/faq' },
      { label: 'Job Posting and Application', href: '/faq' },
      { label: 'Resume Management and AI Analysis', href: '/faq' },
    ],
  },
  {
    icon: Settings,
    title: 'Admin Guide',
    description: 'For organization administrators',
    articles: [
      { label: 'Organization Settings', href: '/faq' },
      { label: 'Team and Permission Management', href: '/faq' },
      { label: 'Billing and Subscriptions', href: '/pricing' },
      { label: 'Integration Management', href: '/features' },
    ],
  },
  {
    icon: Shield,
    title: 'API Reference',
    description: 'For developers integrating with CodeSpectra',
    articles: [
      { label: 'Authentication', href: '/api-reference#auth' },
      { label: 'REST API Overview', href: '/api-reference' },
      { label: 'Code Analysis API', href: '/api-reference#analyze' },
      { label: 'Webhooks', href: '/api-reference#webhooks' },
    ],
  },
]

export default function DocsPage() {
  const [searchQuery, setSearchQuery] = useState('')

  const filteredSections = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return sections
    return sections
      .map((s) => ({
        ...s,
        articles: s.articles.filter(
          (a) => a.label.toLowerCase().includes(q) || s.title.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
        ),
      }))
      .filter((s) => s.articles.length > 0)
  }, [searchQuery])

  return (
    <PublicPageWrapper>
      <div className="space-y-16">
        <div className="text-center">
          <p className="mb-3 text-sm text-muted-foreground">Resources</p>
          <h1 className="mb-4 text-5xl font-bold sm:text-6xl">Documentation</h1>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
            Everything you need to know about CodeSpectra. Guides, tutorials, and API reference.
          </p>
        </div>

        <div className="mx-auto max-w-2xl">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search documentation..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-border/40 bg-background py-3 pl-12 pr-4 transition-colors hover:border-primary/40 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>

        <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-2">
          {filteredSections.map((section) => {
            const Icon = section.icon
            return (
              <div
                key={section.title}
                className="rounded-xl border border-border/40 p-6 transition-colors hover:border-primary/40 hover:bg-primary/5"
              >
                <div className="mb-5 flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold">{section.title}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{section.description}</p>
                  </div>
                </div>
                <ul className="space-y-2">
                  {section.articles.map((article) => (
                    <li key={article.label}>
                      <Link
                        href={article.href}
                        className="group -mx-3 flex items-center justify-between rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <span>{article.label}</span>
                        <ChevronRight className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>

        <div className="mx-auto grid max-w-4xl gap-4 sm:grid-cols-3">
          {[
            { title: 'TypeScript', desc: 'Full type safety with auto-generated types' },
            { title: 'Zero config', desc: 'Sensible defaults that just work' },
            { title: 'Edge-ready', desc: 'Runs anywhere: Node, Deno, Bun, browsers' },
          ].map((item) => (
            <div key={item.title} className="rounded-xl border border-border/40 p-4 text-center">
              <h3 className="mb-1 font-semibold">{item.title}</h3>
              <p className="text-sm text-muted-foreground">{item.desc}</p>
            </div>
          ))}
        </div>

        <div className="mx-auto max-w-3xl rounded-xl border border-primary/20 bg-primary/5 p-8">
          <div className="flex items-start gap-4">
            <MessageSquare className="mt-0.5 h-6 w-6 shrink-0 text-primary" />
            <div>
              <h3 className="mb-2 text-lg font-semibold">Need help?</h3>
              <p className="mb-4 text-sm text-muted-foreground">
                Can&apos;t find what you&apos;re looking for? Visit the support portal or FAQ.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button asChild>
                  <Link href="/support">Contact Support</Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/faq">View FAQ</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PublicPageWrapper>
  )
}
