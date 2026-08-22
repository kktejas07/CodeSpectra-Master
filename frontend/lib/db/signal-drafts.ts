/**
 * Signal drafts — AI-rewritten news waiting for human approve.
 * Collection: `signal_drafts`
 */
import { randomUUID } from 'node:crypto'
import type { Collection } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'
import type { BlogCategoryId } from '@/lib/blog-categories'

export type SignalDraftStatus = 'pending' | 'approved' | 'rejected' | 'published'

export interface SignalDraftDoc {
  id: string
  title: string
  excerpt: string
  body: string
  category: BlogCategoryId
  source_url: string
  source_title: string
  source_feed: string
  status: SignalDraftStatus
  blog_slug?: string
  created_at: string
  updated_at: string
}

export async function signalDrafts(): Promise<Collection<SignalDraftDoc>> {
  return (await getMongoDb()).collection<SignalDraftDoc>('signal_drafts')
}

export function newSignalId(): string {
  return randomUUID()
}
