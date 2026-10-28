import type { Metadata } from 'next'
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
import { BentoBody, BentoCard, BentoIcon, BentoShell, BentoTitle } from '@/components/landing/bento-grid'
import { btnPrimary, btnSecondary } from '@/components/landing/page-hero'
import { ThemeIllustration } from '@/components/landing/theme-illustration'
import { docHref, docDescription, getDocTree, resolveDoc, type DocSection } from '@/lib/docs'
import { buildMetadata } from '@/lib/seo/metadata'
import { articleJsonLd, breadcrumbJsonLd } from '@/lib/seo/jsonld'
import { publicRoute } from '@/lib/seo/public-routes'
import { getSiteUrl } from '@/lib/seo/site'
import { JsonLd } from '@/components/seo/json-ld'

interface Props {
  params: Promise<{ slug?: string[] }>
}

export async function generateStaticParams(): Promise<{ slug?: string[] }[]> {
  // Pre-render every doc page at build time (Mintlify/Docusaurus standard) —
  // docs change rarely, so static HTML + CDN caching beats per-request disk reads.
  // The index (no slug) stays dynamic-safe via the same shell.
  const params: { slug?: string[] }[] = []
  for (const section of getDocTree()) {
    for (const doc of section.docs) {
      params.push({ slug: section.id === 'user' ? ['user', doc.slug] : [doc.slug] })
    }
  }
  return params
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const route = publicRoute('/docs')!
  const fallback = buildMetadata({ title: route.title, description: route.description, path: '/docs', kind: 'docs' })
  if (!slug || slug.length === 0) return fallback
  const page = resolveDoc(slug)
  if (!page) return { ...fallback, robots: { index: false, follow: true } }
  return buildMetadata({
    // The doc's own H1 ("Frequently Asked Questions"), not the file name ("Faq"), plus where it lives.
    title: `${page.content.match(/^#\s+(.+)$/m)?.[1]?.trim() || page.meta.title} · ${page.meta.section === 'public' ? 'Docs' : 'User guide'}`,
    description: docDescription(page.content),
    path: docHref(page.meta),
    kind: 'docs',
    type: 'article',
    ogSubtitle: `CodeSpectra docs · ${page.meta.sectionLabel}`,
  })
}

export default async function DocsPage({ params }: Props) {
  const { slug } = await params
  const sections = getDocTree()
  const page = slug && slug.length > 0 ? resolveDoc(slug) : null

  if (slug && slug.length > 0 && !page) notFound()
  const site = getSiteUrl()
  const crumbs = [{ name: 'Home', path: '/' }, { name: 'Docs', path: '/docs' }]
  if (page) crumbs.push({ name: page.meta.sectionLabel, path: '/docs' }, { name: page.meta.title, path: docHref(page.meta) })

  return (
    <PublicPageWrapper>
      <JsonLd
        data={[
          breadcrumbJsonLd(crumbs.filter((c, i, a) => a.findIndex((x) => x.path === c.path && x.name === c.name) === i), site),
          page
            ? articleJsonLd({ site, type: 'TechArticle', path: docHref(page.meta), headline: page.meta.title, description: docDescription(page.content), section: page.meta.sectionLabel })
            : null,
        ]}
      />
      <div className="flex w-full min-w-0 border-t border-cs-grid">
        <DocSidebar sections={sections} />
        <div className="min-w-0 flex-1 px-4 py-8 sm:px-6 lg:px-8 xl:px-10">
          {page ? <DocContent page={page} sections={sections} /> : <DocsHome sections={sections} />}
        </div>
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
      <div className="relative isolate mb-12 overflow-hidden rounded-3xl border border-cs-grid bg-cs-sheet p-8 sm:p-10">
        <div
          aria-hidden
          className="absolute inset-0 -z-10 opacity-60 [mask-image:radial-gradient(60%_70%_at_85%_20%,#000_25%,transparent_75%)]"
          style={{ backgroundImage: 'radial-gradient(rgba(47,91,231,0.28) 1px, transparent 1px)', backgroundSize: '22px 22px' }}
        />
        <div aria-hidden className="absolute -right-16 -top-16 -z-10 h-48 w-48 rounded-full bg-cs-accent/10 blur-3xl" />
        <div className="grid items-center gap-8 lg:grid-cols-[1fr_220px]">
        <div>
        <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-cs-accent/25 bg-cs-accent/10 px-3 py-1 text-xs font-semibold text-cs-accent-text">
          <BookOpen className="h-3.5 w-3.5" aria-hidden />
          Documentation
        </p>
        <h1 className="cs-display max-w-[20ch] text-4xl sm:text-5xl">CodeSpectra documentation</h1>
        <p className="mt-4 max-w-[60ch] text-base leading-relaxed text-cs-ink-soft sm:text-lg">
          Guides for getting started, using the product day to day, and integrating with the API.
          Use the sidebar to browse, or jump into a popular topic below.
        </p>
        {totalDocs > 0 ? (
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link href={startHref} className={btnPrimary}>
              Start here <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link href={userHref} className={btnSecondary}>
              User guides
            </Link>
          </div>
        ) : (
          <p className="mt-6 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
            Docs content is not in this image yet. Redeploy after the frontend includes{' '}
            <code className="rounded bg-cs-paper px-1 font-mono">docs/public</code> and{' '}
            <code className="rounded bg-cs-paper px-1 font-mono">docs/user</code>.
          </p>
        )}
        </div>
        <ThemeIllustration name="code-visor" alt="" width={240} height={200} priority className="hidden w-full lg:block" />
        </div>
      </div>

      {totalDocs > 0 ? (
        <>
          <section className="mb-14" aria-labelledby="docs-popular">
            <h2 id="docs-popular" className="cs-heading mb-5 text-2xl">Popular topics</h2>
            <BentoShell className="auto-rows-auto lg:grid-cols-3">
              {FEATURED.map((item) => {
                const Icon = item.icon
                return (
                  <BentoCard key={item.href} href={item.href} label={item.title} className="p-5 sm:p-6">
                    <BentoIcon><Icon className="h-5 w-5" aria-hidden /></BentoIcon>
                    <BentoTitle>{item.title}</BentoTitle>
                    <BentoBody className="text-sm">{item.description}</BentoBody>
                  </BentoCard>
                )
              })}
            </BentoShell>
          </section>

          <div className="space-y-12">
            {sections.map((section) => (
              <section key={section.id}>
                <div className="mb-4 flex items-end justify-between gap-3 border-b border-cs-grid pb-3">
                  <div>
                    <h2 className="text-xl font-bold tracking-tight text-cs-ink">{section.label}</h2>
                    <p className="mt-1 text-sm text-cs-ink-soft">
                      {section.id === 'public'
                        ? 'Open guides — no login required.'
                        : 'In-product walkthroughs for signed-in users.'}
                    </p>
                  </div>
                  <span className="rounded-full bg-cs-accent/10 px-2.5 py-0.5 text-xs font-medium tabular-nums text-cs-accent-text">
                    {section.docs.length} pages
                  </span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {section.docs.map((doc, i) => (
                    <Link
                      key={`${doc.section}-${doc.slug}`}
                      href={docHref(doc)}
                      className="group flex items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 transition-colors duration-200 hover:border-cs-grid hover:bg-cs-sheet"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-cs-accent/10 font-mono text-[11px] font-bold tabular-nums text-cs-accent-text">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-cs-ink group-hover:text-cs-accent-text">
                        {doc.title}
                      </span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-cs-ink-soft opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden />
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
