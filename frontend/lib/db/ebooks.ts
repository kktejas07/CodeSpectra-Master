/**
 * CodeSpectra ebooks / resources — Unstop-style structured flipbooks.
 * Collection: `resources_ebooks`
 */
import { randomUUID } from 'node:crypto'
import type { Collection } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb' // getMongoDb is the canonical export

export type EbookPageType =
  | 'cover'
  | 'toc'
  | 'section'
  | 'compare'
  | 'stats'
  | 'journey'
  | 'tips'
  | 'image'

export type EbookPage = {
  type: EbookPageType
  title?: string
  subtitle?: string
  body?: string
  bullets?: string[]
  items?: { label: string; text: string; color?: string }[]
  left?: { title: string; points: string[] }
  right?: { title: string; points: string[] }
  stats?: { value: string; label: string }[]
  steps?: { n: string; title: string; text: string }[]
  quote?: string
  quoteBy?: string
  imageUrl?: string
  imageAlt?: string
}

export type EbookStatus = 'draft' | 'published' | 'archived'

export type EbookDoc = {
  id: string
  slug: string
  title: string
  subtitle: string
  description: string
  topic: string
  coverTheme: 'violet' | 'teal' | 'amber' | 'rose' | 'slate'
  readMinutes: number
  pages: EbookPage[]
  status: EbookStatus
  sourceNote?: string
  createdAt: string
  updatedAt: string
  publishedAt?: string | null
  createdBy: string
}

export async function ebooksCol(): Promise<Collection<EbookDoc>> {
  return (await getMongoDb()).collection<EbookDoc>('resources_ebooks')
}

export function newEbookId(): string {
  return randomUUID()
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function slugifyEbook(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
}

export const COVER_THEMES: EbookDoc['coverTheme'][] = ['violet', 'teal', 'amber', 'rose', 'slate']
