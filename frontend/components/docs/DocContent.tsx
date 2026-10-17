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
              className="w-full rounded-2xl border border-cs-grid"
              {...props}
            />
            {alt ? (
              <figcaption className="mt-2 text-center text-xs text-cs-ink-soft">
                {alt}
              </figcaption>
            ) : null}
          </figure>
        ),
        table: ({ children }) => (
          <div className="my-6 overflow-x-auto rounded-2xl border border-cs-grid">
            <table className="min-w-full divide-y divide-cs-grid text-sm">{children}</table>
          </div>
        ),
        th: ({ children }) => (
          <th className="bg-cs-accent/5 px-4 py-2.5 text-left text-xs font-semibold text-cs-ink">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="border-t border-cs-grid px-4 py-2.5 text-sm text-cs-ink-soft">{children}</td>
        ),
        blockquote: ({ children }) => (
          <blockquote className="my-6 rounded-r-2xl border-l-4 border-cs-accent/50 bg-cs-accent/5 px-4 py-3 not-italic">
            {children}
          </blockquote>
        ),
        code: ({ children, className, ...props }) => {
          const inline = !className
          return inline ? (
            <code
              className="rounded-md bg-cs-accent/8 px-1.5 py-0.5 font-mono text-[13px] text-cs-ink"
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

/** Industry-standard copy button for fenced code blocks (Stripe/Mintlify pattern). */
function CodeBlockWithCopy({ children, ...props }: { children?: React.ReactNode }) {
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
      <pre ref={ref} {...props} className="overflow-x-auto rounded-2xl border border-cs-grid bg-zinc-950 p-4 pr-12 text-sm text-zinc-100 shadow-sm">
        {children}
      </pre>
      <button
        type="button"
        onClick={onCopy}
        aria-label={copied ? 'Copied' : 'Copy code'}
        className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-zinc-400 opacity-0 backdrop-blur transition-[opacity,background-color,color] duration-200 hover:bg-white/10 hover:text-white focus-visible:opacity-100 group-hover:opacity-100 max-sm:opacity-100"
      >
        {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
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
        <nav aria-label="Breadcrumb" className="mb-6 flex flex-wrap items-center gap-1.5 text-sm text-cs-ink-soft">
          <Link href="/docs" className="hover:text-cs-ink">
            Docs
          </Link>
          <ChevronRight className="h-3.5 w-3.5 opacity-60" aria-hidden />
          {section ? (
            <>
              <span>{section.label}</span>
              <ChevronRight className="h-3.5 w-3.5 opacity-60" aria-hidden />
            </>
          ) : null}
          <span className="font-medium text-cs-ink" aria-current="page">{page.meta.title}</span>
        </nav>

        <header className="mb-8 max-w-[72ch] border-b border-cs-grid pb-6">
          <p className="mb-2 text-sm font-semibold text-cs-accent-text">
            {section?.label || 'Documentation'}
          </p>
          <h1 className="cs-heading text-4xl sm:text-5xl">{page.meta.title}</h1>
        </header>

        <div
          className={cn(
            'prose prose-zinc max-w-[72ch] dark:prose-invert',
            'prose-headings:scroll-mt-28 prose-headings:font-semibold prose-headings:tracking-tight',
            'prose-headings:text-cs-ink prose-h2:mt-10 prose-h2:mb-3 prose-h2:border-b prose-h2:border-cs-grid prose-h2:pb-2 prose-h2:text-xl',
            'prose-h3:mt-8 prose-h3:mb-2 prose-h3:text-lg',
            'prose-p:text-[15px] prose-p:leading-7 prose-p:text-cs-ink-soft',
            'prose-li:text-[15px] prose-li:text-cs-ink-soft',
            'prose-strong:text-cs-ink',
            'prose-a:font-medium prose-a:text-cs-accent-text prose-a:no-underline hover:prose-a:underline',
            'prose-code:before:content-none prose-code:after:content-none',
            'prose-pre:rounded-2xl prose-pre:border prose-pre:border-cs-grid prose-pre:bg-zinc-950 prose-pre:shadow-sm',
            'prose-hr:border-cs-grid',
          )}
        >
          <DocBody content={page.content} />
        </div>

        <div className="mt-14 grid max-w-[72ch] gap-3 border-t border-cs-grid pt-8 sm:grid-cols-2">
          {prev ? (
            <Link
              href={docHref(prev)}
              className="group flex flex-col rounded-2xl border border-cs-grid bg-cs-sheet p-4 transition-colors duration-200 hover:border-cs-accent/40 hover:bg-cs-accent/5"
            >
              <span className="mb-1 inline-flex items-center gap-1 text-xs text-cs-ink-soft">
                <ChevronLeft className="h-3.5 w-3.5" /> Previous
              </span>
              <span className="font-medium text-cs-ink group-hover:text-cs-accent-text">
                {prev.title}
              </span>
            </Link>
          ) : (
            <div />
          )}
          {next ? (
            <Link
              href={docHref(next)}
              className="group flex flex-col items-end rounded-2xl border border-cs-grid bg-cs-sheet p-4 text-right transition-colors duration-200 hover:border-cs-accent/40 hover:bg-cs-accent/5"
            >
              <span className="mb-1 inline-flex items-center gap-1 text-xs text-cs-ink-soft">
                Next <ChevronRight className="h-3.5 w-3.5" />
              </span>
              <span className="font-medium text-cs-ink group-hover:text-cs-accent-text">
                {next.title}
              </span>
            </Link>
          ) : null}
        </div>
      </article>

      {toc.length > 0 ? (
        <aside className="hidden w-52 shrink-0 xl:block">
          <div className="sticky top-28">
            <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-cs-ink">
              <List className="h-3.5 w-3.5" aria-hidden />
              On this page
            </p>
            <nav aria-label="On this page" className="space-y-0.5 border-l border-cs-grid">
              {toc.map((h) => (
                <a
                  key={h.id}
                  href={`#${h.id}`}
                  className={cn(
                    'block border-l-2 py-1.5 text-xs transition-colors',
                    activeId === h.id
                      ? 'border-cs-accent font-medium text-cs-accent-text'
                      : 'border-transparent text-cs-ink-soft hover:text-cs-ink',
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
