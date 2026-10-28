/**
 * Social studio — links, share intents and caption rules (pure, client-safe).
 *
 *   socialLink(url, 'linkedin', 'event')     → url + utm_source/medium/campaign
 *   finalCaption('x', body, link, 'en')      → what gets pasted / prefilled
 *   checkCaption('x', body, link, 'en')      → { ok, length, max, issues }
 *   shareIntentUrl('whatsapp', body, link)   → official share page, prefilled
 *
 * Captions are stored WITHOUT the link; each platform adds its own UTM-tagged
 * link (Instagram links aren't clickable, so it says "link in bio" instead).
 */
import type { CaptionLang, SocialItemType, SocialPlatform } from './types'

/** utm_source=<platform>, utm_medium=social, utm_campaign=<type>. Replaces existing UTM values; keeps other params. */
export function socialLink(url: string, platform: SocialPlatform, campaign: SocialItemType | string): string {
  try {
    const u = new URL(url)
    u.searchParams.set('utm_source', platform)
    u.searchParams.set('utm_medium', 'social')
    u.searchParams.set('utm_campaign', String(campaign).toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40) || 'social')
    return u.toString()
  } catch {
    return url
  }
}

export interface PlatformRule {
  /** Hard limit of the network (characters; X uses its weighted count). */
  max: number
  /** Soft target the composer warns above. */
  target: number
  /** The link is part of the caption text. */
  linkInText: boolean
  hashtags: { min: number; max: number } | null
  /** LinkedIn: body lines (hashtag line not counted). */
  lines?: { min: number; max: number }
}

export const PLATFORM_RULES: Record<SocialPlatform, PlatformRule> = {
  linkedin: { max: 3000, target: 700, linkInText: true, hashtags: { min: 3, max: 5 }, lines: { min: 3, max: 5 } },
  x: { max: 280, target: 280, linkInText: true, hashtags: { min: 0, max: 3 } },
  instagram: { max: 2200, target: 1200, linkInText: false, hashtags: { min: 3, max: 30 } },
  whatsapp: { max: 700, target: 400, linkInText: true, hashtags: null },
  telegram: { max: 1024, target: 500, linkInText: true, hashtags: null },
  facebook: { max: 5000, target: 600, linkInText: true, hashtags: { min: 0, max: 5 } },
}

/** X counts every link as 23 characters (t.co). */
export const X_LINK_LENGTH = 23

/**
 * X's weighted length (twitter-text v3): code points up to U+10FF (Latin,
 * Devanagari, Telugu, …) and some punctuation count 1, others (CJK, emoji)
 * count 2; URLs count 23.
 */
export function xWeightedLength(text: string): number {
  let n = 0
  const withoutUrls = text.replace(/https?:\/\/\S+/g, () => {
    n += X_LINK_LENGTH
    return ''
  })
  for (const ch of withoutUrls) {
    const c = ch.codePointAt(0) || 0
    const light = (c >= 0 && c <= 4351) || (c >= 8192 && c <= 8205) || (c >= 8208 && c <= 8223) || (c >= 8242 && c <= 8247)
    n += light ? 1 : 2
  }
  return n
}

const LINK_IN_BIO: Record<CaptionLang, string> = {
  en: 'Link in bio.',
  hi: 'लिंक बायो में है।',
  te: 'లింక్ బయోలో ఉంది.',
}

/** The full text for a platform: body + link (or "link in bio" on Instagram). */
export function finalCaption(platform: SocialPlatform, body: string, link: string, lang: CaptionLang = 'en'): string {
  const b = body.trim()
  if (platform === 'instagram') return `${b}\n\n${LINK_IN_BIO[lang]}`.trim()
  if (platform === 'x') return `${b}\n${link}`.trim()
  return `${b}\n\n${link}`.trim()
}

export const hashtagsIn = (text: string): string[] => [...text.matchAll(/(^|\s)#([\p{L}\p{N}_]+)/gu)].map((m) => `#${m[2]}`)

export type CaptionIssue = 'empty' | 'too_long' | 'over_target' | 'hashtags_few' | 'hashtags_many' | 'lines_few' | 'lines_many' | 'has_url'

export interface CaptionCheck {
  ok: boolean
  length: number
  max: number
  issues: CaptionIssue[]
}

/** Platform rules for a caption body (pure). `ok` = no hard problem; soft ones (over_target) are warnings. */
export function checkCaption(platform: SocialPlatform, body: string, link: string, lang: CaptionLang = 'en'): CaptionCheck {
  const rule = PLATFORM_RULES[platform]
  const full = finalCaption(platform, body, link, lang)
  const length = platform === 'x' ? xWeightedLength(full) : [...full].length
  const issues: CaptionIssue[] = []
  if (!body.trim()) issues.push('empty')
  if (length > rule.max) issues.push('too_long')
  else if (length > rule.target) issues.push('over_target')
  if (/https?:\/\//i.test(body)) issues.push('has_url')
  const tags = hashtagsIn(body).length
  if (rule.hashtags) {
    if (tags < rule.hashtags.min) issues.push('hashtags_few')
    if (tags > rule.hashtags.max) issues.push('hashtags_many')
  } else if (tags > 3) issues.push('hashtags_many')
  if (rule.lines) {
    const lines = body.split('\n').map((l) => l.trim()).filter((l) => l && !/^(#[\p{L}\p{N}_]+\s*)+$/u.test(l)).length
    if (lines < rule.lines.min) issues.push('lines_few')
    if (lines > rule.lines.max) issues.push('lines_many')
  }
  const hard: CaptionIssue[] = ['empty', 'too_long', 'has_url']
  return { ok: !issues.some((i) => hard.includes(i)), length, max: rule.max, issues }
}

/** Shorten a body so the X post (body + link) fits 280 weighted characters. Keeps whole words where it can. */
export function fitX(body: string, link: string): string {
  const max = PLATFORM_RULES.x.max
  if (xWeightedLength(finalCaption('x', body, link)) <= max) return body.trim()
  const chars = [...body.trim()]
  let lo = 0
  let hi = chars.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (xWeightedLength(finalCaption('x', `${chars.slice(0, mid).join('').trimEnd()}…`, link)) <= max) lo = mid
    else hi = mid - 1
  }
  let cut = chars.slice(0, lo).join('')
  const sp = cut.lastIndexOf(' ')
  if (sp > cut.length * 0.6) cut = cut.slice(0, sp)
  return `${cut.trimEnd()}…`
}

const e = encodeURIComponent

/**
 * Official share pages. LinkedIn and Facebook only take the link (they read
 * the page's Open Graph card); paste the copied caption there. Instagram has
 * no web share page: copy the caption and download the image instead.
 */
export function shareIntentUrl(platform: SocialPlatform, body: string, link: string, lang: CaptionLang = 'en'): string {
  switch (platform) {
    case 'linkedin':
      return `https://www.linkedin.com/sharing/share-offsite/?url=${e(link)}`
    case 'x':
      return `https://x.com/intent/tweet?text=${e(body.trim())}&url=${e(link)}`
    case 'facebook':
      return `https://www.facebook.com/sharer/sharer.php?u=${e(link)}`
    case 'whatsapp':
      return `https://wa.me/?text=${e(finalCaption('whatsapp', body, link, lang))}`
    case 'telegram':
      return `https://t.me/share/url?url=${e(link)}&text=${e(body.trim())}`
    case 'instagram':
    default:
      return 'https://www.instagram.com/'
  }
}

/** Does the share page carry our caption text, or must it be pasted? */
export const intentCarriesText = (p: SocialPlatform): boolean => p === 'x' || p === 'whatsapp' || p === 'telegram'

/** ISO week key, e.g. 2026-W43 (Monday-based, UTC). */
export function isoWeekKey(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const year = t.getUTCFullYear()
  const week = Math.ceil(((t.getTime() - Date.UTC(year, 0, 1)) / 86_400_000 + 1) / 7)
  return `${year}-W${String(week).padStart(2, '0')}`
}
