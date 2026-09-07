'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import rehypeSlug from 'rehype-slug'
import { Check, ChevronLeft, ChevronRight, Copy, List } from 'lucide-react'
import { LivePricingTables } from './LivePricingTables'
import {
  docHref,
  getAdjacentDocs,
  type DocPage,
  type DocSection,
} from '@/lib/docs-shared'
import { cn } from '@/lib/utils'

interface DocContentProps {
  page: DocPage
  sections: DocSection[]
}

/** Markdown renderer shared by doc body parts. Split out so live embeds
 *  (e.g. `{{live-pricing}}`) can be interleaved between rendered chunks. */
function DocMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight, rehypeSlug]}
      components={{
        a: ({ href, children, ...props }) => {
          if (href?.startsWith('/') || href?.startsWith('#')) {
            return (
              <Link href={href} {...props}>
                {children}
              </Link>
            )
          }
          return (
            <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
              {children}
            </a>
          )
        },
        img: ({ src, alt, ...props }) => (
          <figure className="not-prose my-8">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={alt || ''}
              className="w-full rounded-xl border border-border/50"
              {...props}
            />
            {alt ? (
              <figcaption className="mt-2 text-center text-xs text-muted-foreground">
                {alt}
              </figcaption>
            ) : null}
          </figure>
        ),
        table: ({ children }) => (
          <div className="my-6 overflow-x-auto rounded-xl border border-border/50">
            <table className="min-w-full divide-y divide-border/40 text-sm">{children}</table>
          </div>
        ),
        th: ({ children }) => (
          <th className="bg-muted/40 px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="border-t border-border/30 px-4 py-2.5 text-sm">{children}</td>
        ),
        blockquote: ({ children }) => (
          <blockquote className="my-6 rounded-r-xl border-l-4 border-teal-500/40 bg-teal-500/5 px-4 py-3 not-italic">
            {children}
          </blockquote>
        ),
        code: ({ children, className, ...props }) => {
          const inline = !className
          return inline ? (
            <code
              className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[13px] text-foreground"
              {...props}
            >
              {children}
            </code>
          ) : (
            <code className={className} {...props}>
              {children}
            </code>
          )
        },
        pre: ({ children, node, ...props }) => <CodeBlockWithCopy {...props}>{children}</CodeBlockWithCopy>,
      }}
    >
      {content}
    </ReactMarkdown>
  )
}

/** Renders markdown with `{{live-pricing}}` tokens replaced by live price tables. */
function DocBody({ content }: { content: string }) {
  const parts = content.split('{{live-pricing}}')
  if (parts.length === 1) return <DocMarkdown content={content} />
  return (
    <>
      {parts.map((part, i) => (
        <span key={i} className="contents">
          {part ? <DocMarkdown content={part} /> : null}
          {i < parts.length - 1 ? <LivePricingTables /> : null}
        </span>
      ))}
    </>
  )
}

/** Industry-standard copy button for fenced code blocks (Stripe/Mintlify pattern). */function CodeBlockWithCopy({ children, ...props }: { children?: React.ReactNode }) {
  const ref = useRef<HTMLPreElement>(null)
  const [copied, setCopied] = useState(false)
  const onCopy = async () => {
    try {
      const text = ref.current?.innerText || ''
      if (!text) return
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // Clipboard unavailable (permissions) — stay silent, content is selectable.
    }
  }
  return (
    <div className="not-prose group relative my-6">
      <pre ref={ref} {...props} className="overflow-x-auto rounded-xl border border-border/50 bg-zinc-950 p-4 pr-12 text-sm shadow-sm">
        {children}
      </pre>
      <button
        type="button"
        onClick={onCopy}
        aria-label={copied ? 'Copied' : 'Copy code'}
        className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-zinc-400 opacity-0 backdrop-blur transition-all hover:bg-white/10 hover:text-white focus-visible:opacity-100 group-hover:opacity-100 max-sm:opacity-100"
      >
        {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  )
}

export function DocContent({ page, sections }: DocContentProps) {
  const section = sections.find((s) => s.id === page.meta.section)
  const toc = useMemo(
    () => page.headings.filter((h) => h.level === 2 || h.level === 3),
    [page.headings],
  )
  const { prev, next } = useMemo(
    () => getAdjacentDocs(page.meta, sections),
    [page.meta, sections],
  )
  const [activeId, setActiveId] = useState<string>('')

  useEffect(() => {
    if (toc.length === 0) return
    const els = toc
      .map((h) => document.getElementById(h.id))
      .filter((el): el is HTMLElement => !!el)

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => (a.boundingClientRect.top > b.boundingClientRect.top ? 1 : -1))
        if (visible[0]?.target?.id) setActiveId(visible[0].target.id)
      },
      { rootMargin: '-20% 0% -65% 0%', threshold: [0, 1] },
    )
    els.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [toc])

  return (
    <div className="flex min-w-0 flex-1 gap-10 xl:gap-12">
      <article className="min-w-0 flex-1 pb-16">
        <nav className="mb-6 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
          <Link href="/docs" className="hover:text-foreground">
            Docs
          </Link>
          <ChevronRight className="h-3.5 w-3.5 opacity-60" />
          {section ? (
            <>
              <span>{section.label}</span>
              <ChevronRight className="h-3.5 w-3.5 opacity-60" />
            </>
          ) : null}
          <span className="font-medium text-foreground">{page.meta.title}</span>
        </nav>

        <header className="mb-8 border-b border-border/60 pb-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-teal-600 dark:text-teal-400">
            {section?.label || 'Documentation'}
          </p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{page.meta.title}</h1>
        </header>

        <div
          className={cn(
            'prose prose-zinc max-w-none dark:prose-invert',
            'prose-headings:scroll-mt-28 prose-headings:font-semibold prose-headings:tracking-tight',
            'prose-h2:mt-10 prose-h2:mb-3 prose-h2:border-b prose-h2:border-border/50 prose-h2:pb-2 prose-h2:text-xl',
            'prose-h3:mt-8 prose-h3:mb-2 prose-h3:text-lg',
            'prose-p:text-[15px] prose-p:leading-7 prose-p:text-muted-foreground',
            'prose-li:text-[15px] prose-li:text-muted-foreground',
            'prose-strong:text-foreground',
            'prose-a:font-medium prose-a:text-teal-600 prose-a:no-underline hover:prose-a:underline dark:prose-a:text-teal-400',
            'prose-code:before:content-none prose-code:after:content-none',
            'prose-pre:rounded-xl prose-pre:border prose-pre:border-border/50 prose-pre:bg-zinc-950 prose-pre:shadow-sm',
            'prose-hr:border-border/60',
          )}
        >
          <DocBody content={page.content} />
        </div>

        <div className="mt-14 grid gap-3 border-t border-border/60 pt-8 sm:grid-cols-2">
          {prev ? (
            <Link
              href={docHref(prev)}
              className="group flex flex-col rounded-xl border border-border/60 p-4 transition-colors hover:border-teal-500/40 hover:bg-teal-500/5"
            >
              <span className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                <ChevronLeft className="h-3.5 w-3.5" /> Previous
              </span>
              <span className="font-medium group-hover:text-teal-600 dark:group-hover:text-teal-400">
                {prev.title}
              </span>
            </Link>
          ) : (
            <div />
          )}
          {next ? (
            <Link
              href={docHref(next)}
              className="group flex flex-col items-end rounded-xl border border-border/60 p-4 text-right transition-colors hover:border-teal-500/40 hover:bg-teal-500/5"
            >
              <span className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                Next <ChevronRight className="h-3.5 w-3.5" />
              </span>
              <span className="font-medium group-hover:text-teal-600 dark:group-hover:text-teal-400">
                {next.title}
              </span>
            </Link>
          ) : null}
        </div>
      </article>

      {toc.length > 0 ? (
        <aside className="hidden w-52 shrink-0 xl:block">
          <div className="sticky top-28">
            <p className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <List className="h-3.5 w-3.5" />
              On this page
            </p>
            <nav className="space-y-0.5 border-l border-border/60">
              {toc.map((h) => (
                <a
                  key={h.id}
                  href={`#${h.id}`}
                  className={cn(
                    'block border-l-2 py-1.5 text-xs transition-colors',
                    activeId === h.id
                      ? 'border-teal-500 text-teal-700 dark:text-teal-300'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                  style={{ paddingLeft: `${(h.level - 2) * 10 + 12}px` }}
                >
                  {h.text}
                </a>
              ))}
            </nav>
          </div>
        </aside>
      ) : null}
    </div>
  )
}
