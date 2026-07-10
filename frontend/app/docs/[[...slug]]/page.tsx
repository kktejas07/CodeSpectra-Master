import { notFound } from 'next/navigation'
import Link from 'next/link'
import { PublicPageWrapper } from '@/app/public-layout'
import { DocSidebar } from '@/components/docs/DocSidebar'
import { DocContent } from '@/components/docs/DocContent'
import { getDocTree, resolveDoc } from '@/lib/docs'
import { ArrowRight } from 'lucide-react'

interface Props {
  params: Promise<{ slug?: string[] }>
}

export default async function DocsPage({ params }: Props) {
  const { slug } = await params
  const sections = getDocTree()
  const page = slug && slug.length > 0 ? resolveDoc(slug) : null

  if (slug && slug.length > 0 && !page) {
    notFound()
  }

  return (
    <PublicPageWrapper>
      <div className="flex min-h-screen">
        <DocSidebar sections={sections} />

        <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-8">
          {page ? (
            <DocContent page={page} sections={sections} />
          ) : (
            <DocLanding sections={sections} />
          )}
        </main>
      </div>
    </PublicPageWrapper>
  )
}

function DocLanding({
  sections,
}: {
  sections: Awaited<ReturnType<typeof getDocTree>>
}) {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-16">
        <h1 className="text-5xl font-bold tracking-tight mb-4">
          CodeSpectra Docs
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl leading-relaxed">
          Everything you need to build, analyze, and ship quality software with CodeSpectra.
          Browse guides, API references, and tutorials below.
        </p>
      </div>

      <div className="space-y-24">
        {sections.map((section) => (
          <section key={section.id}>
            <div className="mb-8">
              <h2 className="text-2xl font-bold tracking-tight">{section.label}</h2>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {section.docs.map((doc, idx) => (
                <Link
                  key={doc.slug}
                  href={`/docs/${doc.section === 'public' ? '' : 'user/'}${doc.slug}`}
                  className="group relative rounded-xl border border-border/40 bg-card/30 p-5 hover:border-primary/40 hover:bg-primary/5 transition-all"
                >
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-[11px] font-mono font-bold text-primary shrink-0">
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <span className="text-sm font-semibold group-hover:text-primary transition-colors">
                        {doc.title}
                      </span>
                    </div>
                  </div>
                  <ArrowRight className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0" />
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
