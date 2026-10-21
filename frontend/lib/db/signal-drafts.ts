/**
 * Signal drafts — AI-rewritten news waiting for human approve.
 * Collection: `signal_drafts`
 */
import { randomUUID } from 'node:crypto'
import type { Collection } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'
import type { BlogCategoryId } from '@/lib/blog-categories'

export type SignalDraftStatus = 'pending' | 'approved' | 'rejected' | 'published'

export interface SignalFactStored {
  claim: string
  source_url: string
  date?: string
}

export interface SignalDraftDoc {
  id: string
  title: string
  excerpt: string
  body: string
  category: BlogCategoryId
  source_url: string
  source_title: string
  source_feed: string
  /** Editorial angle from research pass */
  angle?: string
  /** Verifiable claims extracted before drafting */
  facts?: SignalFactStored[]
  /** All public URLs used (seed + linked pages) */
  source_urls?: string[]
  /** AI-generated cover art URL (falls back to SVG cover when unset) */
  cover_image?: string
  status: SignalDraftStatus
  blog_slug?: string
  /** News topic (lib/signals/feeds NEWS_TOPICS). */
  topic?: string
  /** Feed was trusted when this was ingested. */
  trusted?: boolean
  /** Published by the ingest run without an admin (trusted feed). */
  auto_published?: boolean
  /** Written by the AI pipeline (false = plain fallback). */
  ai_rewritten?: boolean
  /** Prompt-guard reasons found in the source text (forces review). */
  flags?: string[]
  created_at: string
  updated_at: string
}

export async function signalDrafts(): Promise<Collection<SignalDraftDoc>> {
  return (await getMongoDb()).collection<SignalDraftDoc>('signal_drafts')
}

export function newSignalId(): string {
  return randomUUID()
}
