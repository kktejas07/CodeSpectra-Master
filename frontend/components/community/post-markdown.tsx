'use client'

/**
 * Forum / chat markdown: GFM, syntax-highlighted code blocks, @mentions.
 * Raw HTML is never rendered (skipHtml, no rehype-raw); every URL goes
 * through lib/safe-html safeHttpUrl (http(s) and same-site paths only);
 * images are shown as links; external links get rel="nofollow ugc noopener".
 * The `lang` attribute keeps user content in the language it was written in.
 */
import Link from 'next/link'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { safeHttpUrl } from '@/lib/safe-html'
import { cn } from '@/lib/utils'

export function PostMarkdown({ text, lang, compact, className }: { text: string; lang?: string; compact?: boolean; className?: string }) {
  return (
    <div lang={lang && lang !== 'other' ? lang : undefined} className={cn('prose max-w-none break-words dark:prose-invert prose-a:text-primary prose-code:before:content-none prose-code:after:content-none prose-pre:my-3 prose-pre:rounded-2xl prose-pre:bg-zinc-950 prose-pre:text-zinc-100', compact ? 'prose-sm prose-p:my-1' : 'prose-p:leading-7', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        skipHtml
        urlTransform={(url) => safeHttpUrl(defaultUrlTransform(url)) ?? ''}
        components={{
          a: ({ href, children }) => {
            if (!href) return <span>{children}</span>
            if (href.startsWith('/') || href.startsWith('#')) return <Link href={href}>{children}</Link>
            return <a href={href} target="_blank" rel="nofollow ugc noopener noreferrer">{children}</a>
          },
          img: ({ src, alt }) => (typeof src === 'string' && src ? <a href={src} target="_blank" rel="nofollow ugc noopener noreferrer">{alt || src}</a> : null),
          h1: ({ children }) => <p className="font-semibold">{children}</p>,
          h2: ({ children }) => <p className="font-semibold">{children}</p>,
          table: ({ children }) => <div className="not-prose my-3 overflow-x-auto rounded-xl border border-border"><table className="w-full text-left text-sm [&_td]:border-t [&_td]:border-border [&_td]:px-3 [&_td]:py-1.5 [&_th]:px-3 [&_th]:py-1.5">{children}</table></div>,
          code: ({ children, className: cls }) => (cls ? <code className={cls}>{children}</code> : <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">{children}</code>),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}
