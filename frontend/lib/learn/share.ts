/**
 * Share URL builders for Learn posts (pure, client-safe). Every shared link
 * carries UTM tags so traffic from each network shows up in analytics.
 */
import type { ShareChannel } from './types'

export const SHARE_LABELS: Record<ShareChannel, string> = {
  linkedin: 'LinkedIn',
  whatsapp: 'WhatsApp',
  x: 'X',
  facebook: 'Facebook',
  telegram: 'Telegram',
  email: 'Email',
  copy: 'Copy link',
  native: 'Share',
}

/** Adds utm_source/medium/campaign (replacing any existing UTM values). */
export function withUtm(url: string, source: string, medium = 'social', campaign = 'learn'): string {
  try {
    const u = new URL(url)
    u.searchParams.set('utm_source', source)
    u.searchParams.set('utm_medium', medium)
    u.searchParams.set('utm_campaign', campaign)
    return u.toString()
  } catch {
    return url
  }
}

/** Canonical public URL of a post. */
export function postUrl(origin: string, slug: string): string {
  return `${origin.replace(/\/+$/, '')}/learn/${encodeURIComponent(slug)}`
}

const e = encodeURIComponent

/** Share target for one channel. `copy`/`native` return the UTM-tagged post URL itself. */
export function buildShareUrl(channel: ShareChannel, args: { url: string; title: string; summary?: string }): string {
  const medium = channel === 'email' ? 'email' : channel === 'copy' || channel === 'native' ? 'referral' : 'social'
  const link = withUtm(args.url, channel, medium)
  const text = args.title
  switch (channel) {
    case 'linkedin':
      return `https://www.linkedin.com/sharing/share-offsite/?url=${e(link)}`
    case 'whatsapp':
      return `https://wa.me/?text=${e(`${text} ${link}`)}`
    case 'x':
      return `https://twitter.com/intent/tweet?text=${e(text)}&url=${e(link)}`
    case 'facebook':
      return `https://www.facebook.com/sharer/sharer.php?u=${e(link)}`
    case 'telegram':
      return `https://t.me/share/url?url=${e(link)}&text=${e(text)}`
    case 'email':
      return `mailto:?subject=${e(text)}&body=${e(`${args.summary ? `${args.summary}\n\n` : ''}${link}`)}`
    case 'copy':
    case 'native':
    default:
      return link
  }
}

/** All channel links at once (for server rendering). */
export function buildShareLinks(args: { url: string; title: string; summary?: string }): Record<ShareChannel, string> {
  const channels: ShareChannel[] = ['linkedin', 'whatsapp', 'x', 'facebook', 'telegram', 'email', 'copy', 'native']
  return Object.fromEntries(channels.map((c) => [c, buildShareUrl(c, args)])) as Record<ShareChannel, string>
}
