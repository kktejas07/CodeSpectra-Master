'use client'

/**
 * Markdown renderer for Learn posts: GFM tables, syntax highlighting
 * (rehype-highlight, github-dark theme from globals.css), heading ids for the
 * table of contents (rehype-slug), and a copy button on every code block.
 * Raw HTML is NOT rendered (no rehype-raw) and react-markdown's URL transform
 * drops unsafe protocols — bodies are also sanitised on save (lib/learn/markdown).
 */
import { useRef, useState } from 'react'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import rehypeSlug from 'rehype-slug'
import { Check, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'

function CodeBlock({ children, ...props }: { children?: React.ReactNode }) {
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
      // Clipboard blocked: the code stays selectable.
    }
  }
  return (
    <div className="not-prose group relative my-6">
      <pre ref={ref} {...props} className="overflow-x-auto rounded-2xl border border-border bg-zinc-950 p-4 pr-14 text-sm leading-relaxed text-zinc-100">
        {children}
      </pre>
      <button
        type="button"
        onClick={onCopy}
        aria-label={copied ? 'Copied' : 'Copy code'}
        className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-zinc-300 transition-colors duration-200 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
      >
        {copied ? <Check className="h-4 w-4 text-green-400" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
      </button>
    </div>
  )
}

export function LearnMarkdown({ content, className }: { content: string; className?: string }) {
  return (
    <div
      className={cn(
        'prose prose-zinc max-w-none dark:prose-invert prose-headings:scroll-mt-28 prose-headings:tracking-tight prose-h2:mt-12 prose-p:leading-7 prose-a:font-medium prose-a:text-primary prose-code:before:content-none prose-code:after:content-none',
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight, rehypeSlug]}
        components={{
          a: ({ href, children, node: _node, ...props }) => {
            if (href?.startsWith('/') || href?.startsWith('#')) {
              return <Link href={href} {...props}>{children}</Link>
            }
            return <a href={href} target="_blank" rel="noopener noreferrer nofollow" {...props}>{children}</a>
          },
          table: ({ children }) => (
            <div className="not-prose my-6 overflow-x-auto rounded-2xl border border-border">
              <table className="min-w-full divide-y divide-border text-sm">{children}</table>
            </div>
          ),
          th: ({ children }) => <th className="bg-muted px-4 py-2.5 text-left text-xs font-semibold text-foreground">{children}</th>,
          td: ({ children }) => <td className="border-t border-border px-4 py-2.5 font-mono text-sm tabular-nums text-muted-foreground">{children}</td>,
          code: ({ children, className: cls, node: _node, ...props }) =>
            cls ? (
              <code className={cls} {...props}>{children}</code>
            ) : (
              <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground" {...props}>{children}</code>
            ),
          pre: ({ children, node: _node, ...props }) => <CodeBlock {...props}>{children}</CodeBlock>,
          img: ({ src, alt }) =>
            typeof src === 'string' && /^https:\/\//.test(src) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={src} alt={alt || ''} loading="lazy" className="rounded-2xl border border-border" />
            ) : null,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
