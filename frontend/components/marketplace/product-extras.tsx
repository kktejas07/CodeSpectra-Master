'use client'

import { useState } from 'react'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Link2, Share2, Star, Package } from 'lucide-react'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useToast } from '@/lib/toast-context'
import { useHasUserSession } from '@/hooks/use-has-user-session'
import { safeHref } from '@/components/agent/agent-markdown'

/** Gallery: main image + thumbnails (keyboard reachable). */
export function Gallery({ images, title }: { images: string[]; title: string }) {
  const [i, setI] = useState(0)
  if (!images.length) {
    return <div className="flex aspect-square w-full items-center justify-center rounded-3xl border border-cs-grid bg-cs-paper text-cs-ink-soft"><Package className="h-14 w-14" aria-hidden /></div>
  }
  return (
    <div className="space-y-3">
      <div className="aspect-square w-full overflow-hidden rounded-3xl border border-cs-grid bg-cs-paper">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={images[i]} alt={`${title} — image ${i + 1} of ${images.length}`} className="h-full w-full object-cover" />
      </div>
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((src, k) => (
            <button key={src + k} type="button" onClick={() => setI(k)} aria-label={`Show image ${k + 1}`} aria-current={k === i} className={`h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 ${k === i ? 'border-cs-accent' : 'border-transparent'}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Seller-written description: markdown, no raw HTML, http(s)/relative links only, images as text. */
export function Description({ md }: { md: string }) {
  return (
    <div className="prose prose-sm max-w-none break-words text-cs-ink dark:prose-invert sm:prose-base prose-a:text-cs-accent-text">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={(url) => safeHref(defaultUrlTransform(url))}
        components={{
          a: ({ href, children }) => (href ? <a href={href} target="_blank" rel="noopener noreferrer nofollow ugc">{children}</a> : <span>{children}</span>),
          img: ({ alt }) => <span className="text-cs-ink-soft">[image{alt ? `: ${alt}` : ''}]</span>,
        }}
      >
        {md}
      </ReactMarkdown>
    </div>
  )
}

export function ShareButtons({ url, title }: { url: string; title: string }) {
  const addToast = useToast()
  const u = encodeURIComponent(url)
  const t = encodeURIComponent(title)
  const links = [
    { label: 'X', href: `https://twitter.com/intent/tweet?url=${u}&text=${t}` },
    { label: 'LinkedIn', href: `https://www.linkedin.com/sharing/share-offsite/?url=${u}` },
    { label: 'WhatsApp', href: `https://wa.me/?text=${t}%20${u}` },
  ]
  const native = async () => {
    try {
      if (navigator.share) await navigator.share({ title, url })
      else { await navigator.clipboard.writeText(url); addToast({ type: 'success', title: 'Link copied' }) }
    } catch { /* dismissed */ }
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-cs-ink-soft">Share</span>
      <button type="button" onClick={native} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-cs-grid px-3 text-xs font-semibold text-cs-ink hover:border-cs-accent"><Share2 className="h-3.5 w-3.5" aria-hidden />Share</button>
      <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(url); addToast({ type: 'success', title: 'Link copied' }) } catch { /* ignore */ } }} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-cs-grid px-3 text-xs font-semibold text-cs-ink hover:border-cs-accent"><Link2 className="h-3.5 w-3.5" aria-hidden />Copy link</button>
      {links.map((l) => <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center rounded-full border border-cs-grid px-3 text-xs font-semibold text-cs-ink hover:border-cs-accent">{l.label}</a>)}
    </div>
  )
}

/** Verified-purchase review form; the server decides whether this buyer may review. */
export function ReviewForm({ slug }: { slug: string }) {
  const signedIn = useHasUserSession()
  const addToast = useToast()
  const [rating, setRating] = useState(0)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  if (!signedIn) return <p className="text-sm text-cs-ink-soft">Bought this? <a href={`/auth/login?redirectTo=/marketplace/p/${slug}`} className="font-semibold text-cs-accent-text hover:underline">Sign in</a> to leave a review.</p>
  if (done) return <p className="text-sm font-medium text-green-700 dark:text-green-400" role="status">{done}</p>
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!rating) { addToast({ type: 'warning', title: 'Choose a rating first.' }); return }
    setBusy(true)
    try {
      const res = await csrfFetch(`/api/marketplace/products/${encodeURIComponent(slug)}/reviews`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rating, title, body }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) addToast({ type: 'error', title: j.error || 'Could not save your review.' })
      else setDone(j.message || 'Thanks for your review.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border border-cs-grid p-4">
      <p className="text-sm font-semibold text-cs-ink">Write a review</p>
      <div className="flex gap-1" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} onClick={() => setRating(n)} className="rounded-md p-1">
            <Star className={`h-6 w-6 ${rating >= n ? 'fill-amber-400 text-amber-400' : 'text-cs-ink-soft'}`} aria-hidden />
          </button>
        ))}
      </div>
      <label className="block text-sm text-cs-ink"><span className="sr-only">Title</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Title (optional)" className="h-10 w-full rounded-xl border border-cs-grid bg-cs-sheet px-3 text-sm text-cs-ink placeholder:text-cs-ink-soft/70" />
      </label>
      <label className="block text-sm text-cs-ink"><span className="sr-only">Review</span>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} rows={4} placeholder="What did you like? What could be better?" className="w-full rounded-xl border border-cs-grid bg-cs-sheet px-3 py-2 text-sm text-cs-ink placeholder:text-cs-ink-soft/70" />
      </label>
      <button type="submit" disabled={busy} className="inline-flex h-10 items-center rounded-full bg-cs-accent px-5 text-sm font-semibold text-cs-accent-ink disabled:opacity-50">Post review</button>
    </form>
  )
}
