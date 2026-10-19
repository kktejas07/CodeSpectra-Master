'use client'

/**
 * Share buttons for a Learn post: LinkedIn, WhatsApp, X, Facebook, Telegram,
 * email, copy link, and the native share sheet where the browser has one
 * (mobile). Every link carries UTM tags (lib/learn/share). Shares and one
 * view per browser session are counted via /api/learn/[slug]/track.
 */
import { useEffect, useState } from 'react'
import { Check, Link2, Mail, Send, Share2 } from 'lucide-react'
import { Linkedin } from '@/components/ui/brand-icons'
import { csrfFetch } from '@/lib/csrf-fetch'
import { buildShareUrl, SHARE_LABELS } from '@/lib/learn/share'
import type { ShareChannel } from '@/lib/learn/types'
import { cn } from '@/lib/utils'

function track(slug: string, body: Record<string, string>) {
  void csrfFetch(`/api/learn/${encodeURIComponent(slug)}/track`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => undefined)
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
      <path d="M12.04 2a9.9 9.9 0 0 0-8.5 14.98L2 22l5.17-1.5A9.9 9.9 0 1 0 12.04 2Zm0 18.1a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.07.89.9-2.99-.2-.31a8.2 8.2 0 1 1 6.85 3.74Zm4.5-6.14c-.25-.12-1.46-.72-1.69-.8-.23-.08-.39-.12-.56.12-.16.25-.64.8-.79.97-.14.16-.29.19-.54.06a6.7 6.7 0 0 1-3.32-2.9c-.25-.43.25-.4.72-1.33.08-.16.04-.3-.02-.43l-.76-1.83c-.2-.48-.4-.41-.56-.42h-.48a.92.92 0 0 0-.66.31 2.78 2.78 0 0 0-.87 2.07 4.82 4.82 0 0 0 1.01 2.56 11.05 11.05 0 0 0 4.23 3.74c1.58.68 2.2.74 2.99.62.48-.07 1.46-.6 1.67-1.18.2-.58.2-1.07.14-1.18-.06-.1-.22-.16-.47-.28Z" />
    </svg>
  )
}

function FacebookIcon() {
  return <span aria-hidden className="font-sans text-[17px] font-bold leading-none">f</span>
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
      <path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.65l-5.21-6.82-5.97 6.82H1.68l7.73-8.84L1.25 2.25h6.83l4.71 6.23 5.45-6.23Zm-1.16 17.52h1.83L7.08 4.13H5.12l11.96 15.64Z" />
    </svg>
  )
}

const ICONS: Partial<Record<ShareChannel, React.ReactNode>> = {
  linkedin: <Linkedin className="h-4 w-4" aria-hidden />,
  whatsapp: <WhatsAppIcon />,
  x: <XIcon />,
  facebook: <FacebookIcon />,
  telegram: <Send className="h-4 w-4" aria-hidden />,
  email: <Mail className="h-4 w-4" aria-hidden />,
}

const LINK_CHANNELS: ShareChannel[] = ['linkedin', 'whatsapp', 'x', 'facebook', 'telegram', 'email']

export function ShareBar({ slug, url, title, summary, className, countView = false }: { slug: string; url: string; title: string; summary?: string; className?: string; countView?: boolean }) {
  const [copied, setCopied] = useState(false)
  const [canNative, setCanNative] = useState(false)

  useEffect(() => {
    setCanNative(typeof navigator !== 'undefined' && typeof navigator.share === 'function')
    if (!countView) return
    // One view per post per browser session.
    try {
      const key = `learn-viewed:${slug}`
      if (sessionStorage.getItem(key)) return
      sessionStorage.setItem(key, '1')
    } catch {
      // Storage blocked: still count.
    }
    track(slug, { type: 'view' })
  }, [slug, countView])

  const args = { url, title, summary }
  const btn = 'inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-full border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors duration-200 hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildShareUrl('copy', args))
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
      track(slug, { type: 'share', channel: 'copy' })
    } catch {
      // Clipboard blocked.
    }
  }

  const onNative = async () => {
    try {
      await navigator.share({ title, text: summary || title, url: buildShareUrl('native', args) })
      track(slug, { type: 'share', channel: 'native' })
    } catch {
      // Cancelled.
    }
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)} role="group" aria-label="Share this post">
      {canNative && (
        <button type="button" onClick={onNative} className={cn(btn, 'bg-primary text-primary-foreground hover:text-primary-foreground hover:brightness-110')}>
          <Share2 className="h-4 w-4" aria-hidden /> Share
        </button>
      )}
      {LINK_CHANNELS.map((c) => (
        <a
          key={c}
          href={buildShareUrl(c, args)}
          target={c === 'email' ? undefined : '_blank'}
          rel="noopener noreferrer"
          onClick={() => track(slug, { type: 'share', channel: c })}
          className={btn}
          aria-label={`Share on ${SHARE_LABELS[c]}`}
          title={SHARE_LABELS[c]}
        >
          {ICONS[c]}
        </a>
      ))}
      <button type="button" onClick={onCopy} className={btn} aria-label={copied ? 'Link copied' : 'Copy link'}>
        {copied ? <Check className="h-4 w-4 text-green-600 dark:text-green-400" aria-hidden /> : <Link2 className="h-4 w-4" aria-hidden />}
        <span className="text-sm">{copied ? 'Copied' : 'Copy link'}</span>
      </button>
    </div>
  )
}
