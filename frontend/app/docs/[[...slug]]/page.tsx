import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  ArrowRight,
  BookOpen,
  Code2,
  Compass,
  HelpCircle,
  LayoutDashboard,
  Rocket,
  Sparkles,
} from 'lucide-react'
import { PublicPageWrapper } from '@/app/public-layout'
import { DocSidebar } from '@/components/docs/DocSidebar'
import { DocContent } from '@/components/docs/DocContent'
import { docHref, getDocTree, resolveDoc, type DocSection } from '@/lib/docs'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ slug?: string[] }>
}

export default async function DocsPage({ params }: Props) {
  const { slug } = await params
  const sections = getDocTree()
  const page = slug && slug.length > 0 ? resolveDoc(slug) : null

  if (slug && slug.length > 0 && !page) notFound()

  return (
    <PublicPageWrapper>
      <div className="flex w-full min-w-0 border-t border-border/40">
        <DocSidebar sections={sections} />
        <main className="min-w-0 flex-1 px-4 py-8 sm:px-6 lg:px-8 xl:px-10">
          {page ? <DocContent page={page} sections={sections} /> : <DocsHome sections={sections} />}
        </main>
      </div>
    </PublicPageWrapper>
  )
}

const FEATURED: {
  title: string
  description: string
  href: string
  icon: React.ElementType
}[] = [
  {
    title: 'Getting started',
    description: 'Create an account and run your first scan in about five minutes.',
    href: '/docs/getting-started',
    icon: Rocket,
  },
  {
    title: 'Product overview',
    description: 'What CodeSpectra covers — scanning, practice, AI, and assessments.',
    href: '/docs/product-overview',
    icon: Compass,
  },
  {
    title: 'Dashboard guide',
    description: 'Find your way around the signed-in workspace.',
    href: '/docs/user/dashboard-guide',
    icon: LayoutDashboard,
  },
  {
    title: 'API overview',
    description: 'Authenticate and call public API endpoints.',
    href: '/docs/api-overview',
    icon: Code2,
  },
  {
    title: 'FAQ',
    description: 'Common questions about plans, scanning, and accounts.',
    href: '/docs/faq',
    icon: HelpCircle,
  },
  {
    title: 'Features',
    description: 'Deep dive into scanners, challenges, interviews, and more.',
    href: '/docs/features',
    icon: Sparkles,
  },
]

function DocsHome({ sections }: { sections: DocSection[] }) {
  const totalDocs = sections.reduce((n, s) => n + s.docs.length, 0)
  const firstPublic = sections.find((s) => s.id === 'public')?.docs[0]
  const firstUser = sections.find((s) => s.id === 'user')?.docs[0]
  const startHref = firstPublic ? docHref(firstPublic) : '/docs'
  const userHref = firstUser ? docHref(firstUser) : '/docs'

  return (
    <div className="mx-auto w-full max-w-5xl pb-16">
      <div className="relative mb-12 overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-teal-500/10 via-background to-cyan-500/5 p-8 sm:p-10">
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-teal-500/10 blur-3xl" />
        <div className="relative">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-teal-500/30 bg-teal-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-300">
            <BookOpen className="h-3.5 w-3.5" />
            Documentation
          </p>
          <h1 className="max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
            Build, scan, and ship with CodeSpectra
          </h1>
          <p className="mt-4 max-w-2xl text-base text-muted-foreground sm:text-lg">
            Guides for getting started, using the product day to day, and integrating with the API.
            Use the sidebar to browse, or jump into a popular topic below.
          </p>
          {totalDocs > 0 ? (
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={startHref}
                className="inline-flex items-center gap-2 rounded-full bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-500"
              >
                Start here <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href={userHref}
                className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-semibold hover:border-teal-500/40 hover:bg-teal-500/5"
              >
                User guides
              </Link>
            </div>
          ) : (
            <p className="mt-6 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
              Docs content is not in this image yet. Redeploy after the frontend includes{' '}
              <code className="rounded bg-muted px-1">docs/public</code> and{' '}
              <code className="rounded bg-muted px-1">docs/user</code>.
            </p>
          )}
        </div>
      </div>

      {totalDocs > 0 ? (
        <>
          <section className="mb-14">
            <h2 className="mb-4 text-lg font-semibold tracking-tight">Popular topics</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {FEATURED.map((item) => {
                const Icon = item.icon
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="group flex gap-3 rounded-xl border border-border/60 bg-card/40 p-4 transition-colors hover:border-teal-500/40 hover:bg-teal-500/5"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block font-semibold group-hover:text-teal-600 dark:group-hover:text-teal-400">
                        {item.title}
                      </span>
                      <span className="mt-1 block text-sm text-muted-foreground">{item.description}</span>
                    </span>
                  </Link>
                )
              })}
            </div>
          </section>

          <div className="space-y-12">
            {sections.map((section) => (
              <section key={section.id}>
                <div className="mb-4 flex items-end justify-between gap-3 border-b border-border/50 pb-3">
                  <div>
                    <h2 className="text-xl font-semibold tracking-tight">{section.label}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {section.id === 'public'
                        ? 'Open guides — no login required.'
                        : 'In-product walkthroughs for signed-in users.'}
                    </p>
                  </div>
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {section.docs.length} pages
                  </span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {section.docs.map((doc, i) => (
                    <Link
                      key={`${doc.section}-${doc.slug}`}
                      href={docHref(doc)}
                      className="group flex items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 transition-colors hover:border-border hover:bg-muted/40"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted font-mono text-[11px] font-bold text-muted-foreground">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium group-hover:text-teal-600 dark:group-hover:text-teal-400">
                        {doc.title}
                      </span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}
