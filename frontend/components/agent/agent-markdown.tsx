'use client'

import Link from 'next/link'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * Model text → markdown. Raw HTML is never rendered (no rehype-raw), links are
 * limited to in-app paths and http(s) URLs, and images are not loaded.
 */
export function safeHref(url: string): string {
  const s = url.trim()
  if (s.startsWith('/') && !s.startsWith('//')) return s
  if (s.startsWith('#')) return s
  try {
    const u = new URL(s)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : ''
  } catch {
    return ''
  }
}

export function AgentMarkdown({ text }: { text: string }) {
  return (
    <div className="prose prose-sm max-w-none break-words dark:prose-invert prose-p:my-2 prose-pre:my-2 prose-pre:rounded-xl prose-pre:bg-muted prose-pre:text-foreground prose-code:before:content-none prose-code:after:content-none prose-table:my-2 prose-li:my-0.5 prose-headings:mb-2 prose-headings:mt-4 prose-a:text-primary">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={(url) => safeHref(defaultUrlTransform(url))}
        components={{
          a: ({ href, children }) => {
            if (!href) return <span>{children}</span>
            if (href.startsWith('/') || href.startsWith('#')) return <Link href={href}>{children}</Link>
            return <a href={href} target="_blank" rel="noopener noreferrer nofollow">{children}</a>
          },
          img: ({ alt }) => <span className="text-muted-foreground">[image{alt ? `: ${alt}` : ''}]</span>,
          table: ({ children }) => (
            <div className="not-prose my-2 overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-left text-sm [&_td]:border-t [&_td]:border-border [&_td]:px-3 [&_td]:py-1.5 [&_th]:px-3 [&_th]:py-1.5 [&_th]:font-semibold">
                {children}
              </table>
            </div>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}
