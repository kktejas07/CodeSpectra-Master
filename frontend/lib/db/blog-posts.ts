/**
 * Blog / Newsroom posts — public articles distinct from email campaigns.
 * Collection: `blog_posts`
 */
import { randomUUID } from 'node:crypto'
import type { Collection } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'
import {
  BLOG_CATEGORIES,
  isBlogCategory,
  categoryLabel,
  type BlogCategoryId,
} from '@/lib/blog-categories'

export { BLOG_CATEGORIES, isBlogCategory, categoryLabel, type BlogCategoryId }

export type BlogPostStatus = 'draft' | 'published' | 'archived'

export interface BlogPostDoc {
  id: string
  slug: string
  title: string
  excerpt: string
  body: string
  cover_image?: string
  category: BlogCategoryId
  tags: string[]
  author_name: string
  author_role?: string
  status: BlogPostStatus
  source_urls?: string[]
  source_note?: string
  newsletter_campaign_id?: string
  read_minutes: number
  published_at?: string | null
  created_at: string
  updated_at: string
  created_by: string
}

export async function blogPosts(): Promise<Collection<BlogPostDoc>> {
  return (await getMongoDb()).collection<BlogPostDoc>('blog_posts')
}

export function newBlogId(): string {
  return randomUUID()
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function slugifyTitle(title: string): string {
  return (title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96) || `post-${Date.now().toString(36)}`
}

/** ~200 wpm; HTML stripped. */
export function estimateReadMinutes(html: string): number {
  const text = (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  const words = text ? text.split(' ').length : 0
  return Math.max(1, Math.round(words / 200))
}
