'use client'

import { useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import rehypeSlug from 'rehype-slug'
import type { DocPage, DocSection } from '@/lib/docs'
import { ChevronRight, Hash } from 'lucide-react'
import Link from 'next/link'


interface DocContentProps {
  page: DocPage
  sections: DocSection[]
}

export function DocContent({ page, sections }: DocContentProps) {
  const currentSection = sections.find((s) => s.id === page.meta.section)
  const toc = useMemo(() => {
    return page.headings.filter((h) => h.level >= 2)
  }, [page.headings])

  return (
    <div className="flex gap-12 min-w-0">
      <article className="flex-1 min-w-0 max-w-3xl">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-8">
          <Link href="/docs" className="hover:text-foreground transition-colors">
            Docs
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          {currentSection && (
            <>
              <span className="text-foreground font-medium">
                {currentSection.label}
              </span>
              <ChevronRight className="h-3.5 w-3.5" />
            </>
          )}
          <span className="text-foreground">{page.meta.title}</span>
        </nav>

        {/* Page title */}
        <h1 className="text-3xl font-bold mb-8 leading-tight">{page.meta.title}</h1>

        {/* Rendered markdown */}
        <div className="prose prose-zinc dark:prose-invert max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-h2:text-xl prose-h2:mt-10 prose-h2:mb-4 prose-h3:text-lg prose-h3:mt-8 prose-h3:mb-3 prose-p:text-[15px] prose-p:leading-relaxed prose-p:text-muted-foreground prose-code:before:content-none prose-code:after:content-none prose-pre:bg-zinc-950 prose-pre:border prose-pre:border-border/40 prose-pre:rounded-lg prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-li:text-[15px] prose-li:text-muted-foreground prose-strong:text-foreground">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight, rehypeSlug]}
            components={{
              a: ({ href, children, ...props }) => {
                if (href?.startsWith('/') || href?.startsWith('#')) {
                  return <Link href={href} {...props}>{children}</Link>
                }
                return <a href={href} target="_blank" rel="noopener noreferrer" {...props}>{children}</a>
              },
              img: ({ src, alt, ...props }) => (
                <figure className="not-prose my-6">
                  <img src={src} alt={alt || ''} className="rounded-lg border border-border/40 w-full" {...props} />
                  {alt && <figcaption className="text-center text-xs text-muted-foreground mt-2">{alt}</figcaption>}
                </figure>
              ),
              table: ({ children }) => (
                <div className="overflow-x-auto my-6 rounded-lg border border-border/40">
                  <table className="min-w-full divide-y divide-border/40 text-sm">{children}</table>
                </div>
              ),
              th: ({ children }) => <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider bg-muted/30 text-muted-foreground">{children}</th>,
              td: ({ children }) => <td className="px-4 py-3 text-sm border-t border-border/20">{children}</td>,
              blockquote: ({ children }) => (
                <blockquote className="border-l-4 border-primary/30 bg-primary/5 rounded-r-lg px-4 py-3 my-6">{children}</blockquote>
              ),
              code: ({ children, className, ...props }) => {
                const isInline = !className
                return isInline
                  ? <code className="rounded bg-muted/60 px-1.5 py-0.5 text-sm font-mono text-foreground" {...props}>{children}</code>
                  : <code className={className} {...props}>{children}</code>
              },
            }}
          >
            {page.content}
          </ReactMarkdown>
        </div>
      </article>

      {/* Table of Contents */}
      {toc.length > 0 && (
        <aside className="hidden xl:block w-56 shrink-0">
          <div className="sticky top-24">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
              <Hash className="h-3 w-3" />
              On this page
            </div>
            <nav className="space-y-1 border-l-2 border-border/40">
              {toc.map((h) => (
                <a
                  key={h.id}
                  href={`#${h.id}`}
                  className="block text-xs text-muted-foreground hover:text-foreground transition-colors py-1.5 -ml-[1px] border-l-2 border-transparent hover:border-primary/40 truncate"
                  style={{ paddingLeft: `${(h.level - 2) * 12 + 16}px` }}
                >
                  {h.text}
                </a>
              ))}
            </nav>
          </div>
        </aside>
      )}
    </div>
  )
}
