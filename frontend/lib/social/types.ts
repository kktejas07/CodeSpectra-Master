/**
 * Social studio — shared types (client-safe, no I/O).
 *
 * The owner posts to CodeSpectra's social accounts himself: the studio queues
 * every newly published item, drafts captions, renders share cards and opens
 * the networks' official share pages. Nothing is ever posted automatically.
 */

export const SOCIAL_ITEM_TYPES = ['event', 'news', 'learn', 'contest', 'hackathon', 'codeathon', 'certification', 'company_test', 'roundup'] as const
export type SocialItemType = (typeof SOCIAL_ITEM_TYPES)[number]

export const SOCIAL_PLATFORMS = ['linkedin', 'x', 'instagram', 'whatsapp', 'telegram', 'facebook'] as const
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number]

/** Platform names are brand names: the same in every interface language. */
export const PLATFORM_LABELS: Record<SocialPlatform, string> = {
  linkedin: 'LinkedIn',
  x: 'X',
  instagram: 'Instagram',
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  facebook: 'Facebook',
}

export const CAPTION_LANGS = ['en', 'hi', 'te'] as const
export type CaptionLang = (typeof CAPTION_LANGS)[number]

export const CARD_SIZES = {
  landscape: { width: 1200, height: 627 },
  square: { width: 1080, height: 1080 },
  story: { width: 1080, height: 1920 },
} as const
export type CardSize = keyof typeof CARD_SIZES

export const isSocialPlatform = (v: unknown): v is SocialPlatform => typeof v === 'string' && (SOCIAL_PLATFORMS as readonly string[]).includes(v)
export const isSocialItemType = (v: unknown): v is SocialItemType => typeof v === 'string' && (SOCIAL_ITEM_TYPES as readonly string[]).includes(v)
export const isCaptionLang = (v: unknown): v is CaptionLang => typeof v === 'string' && (CAPTION_LANGS as readonly string[]).includes(v)
export const isCardSize = (v: unknown): v is CardSize => typeof v === 'string' && v in CARD_SIZES

/** Facts the captions and cards may use — and nothing else. All optional. */
export interface SocialFacts {
  starts_at?: string | null
  ends_at?: string | null
  deadline?: string | null
  prize?: string | null
  mode?: string | null
  city?: string | null
  organiser?: string | null
  level?: string | null
  duration_min?: number | null
  company?: string | null
  tags?: string[]
  /** Roundup only: the items it lists. */
  items?: { id: string; title: string; type: SocialItemType; url: string }[]
}

/** What a source mapper produces (before it is stored). */
export interface QueueInput {
  type: SocialItemType
  /** Id in the source collection (with the type it is unique). */
  ref_id: string
  title: string
  summary: string
  /** Absolute public URL on our site (no UTM). */
  url: string
  /** The item's own image (publisher's or ours), linked and credited, never re-hosted. */
  image: string | null
  /** Image belongs to us (our banner / cover) rather than a third-party publisher. */
  image_own: boolean
  /** Where it came from (feed source id, 'codespectra', 'signals', …). */
  source: string
  facts: SocialFacts
  /** When it went live (ISO); null = "when we first saw it". */
  published_at: string | null
}

export interface CaptionDraft {
  /** Caption body WITHOUT the link (the link is added per platform with UTM tags). */
  text: string
  ai: boolean
  edited: boolean
  updated_at: string
  updated_by?: string | null
}

export interface PostMark {
  at: string
  by: string
  by_name?: string | null
}

export interface SocialQueueDoc extends Omit<QueueInput, 'published_at'> {
  id: string
  /** `${type}:${ref_id}` — unique, so every sync is idempotent. */
  key: string
  published_at: string
  captions: Partial<Record<CaptionLang, Partial<Record<SocialPlatform, CaptionDraft>>>>
  posts: Partial<Record<SocialPlatform, PostMark>>
  posted_count: number
  last_posted_at: string | null
  created_at: string
  updated_at: string
}
