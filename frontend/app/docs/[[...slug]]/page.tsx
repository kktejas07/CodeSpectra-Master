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
      <div className="mb-12">
        <h1 className="text-4xl font-bold mb-3">CodeSpectra Documentation</h1>
        <p className="text-lg text-muted-foreground max-w-2xl">
          Everything you need to know about using CodeSpectra. Browse the sections
          below or use the sidebar to find specific topics.
        </p>
      </div>

      <div className="space-y-16">
        {sections.map((section) => {
          return (
            <section key={section.id}>
              <div className="flex items-center gap-3 mb-6">
                <h2 className="text-2xl font-bold">{section.label}</h2>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {section.docs.map((doc) => (
                  <Link
                    key={doc.slug}
                    href={`/docs/${doc.section === 'public' ? '' : 'user/'}${doc.slug}`}
                    className="group rounded-lg border border-border/40 p-4 hover:border-primary/40 hover:bg-primary/5 transition-all"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium group-hover:text-primary transition-colors">
                        {doc.title}
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
