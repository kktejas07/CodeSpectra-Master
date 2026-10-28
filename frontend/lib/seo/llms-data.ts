/** Server loaders for llms.txt / llms-full.txt / facts (DB errors → empty lists). */
import { LEARN_CATEGORIES } from '@/lib/learn/types'
import type { LlmsLink } from './llms'

export async function learnLinks(limit = 50): Promise<{ title: string; path: string; summary: string; category: string; published_at?: string | null }[]> {
  try {
    const { latestPublished } = await import('@/lib/learn/queries')
    const { categoryLabel } = await import('@/lib/learn/types')
    return (await latestPublished(limit)).map((p) => ({ title: p.title, path: `/learn/${encodeURIComponent(p.slug)}`, summary: p.summary, category: categoryLabel(p.category), published_at: p.published_at }))
  } catch {
    return []
  }
}

export function learnCategoryLinks(): LlmsLink[] {
  return LEARN_CATEGORIES.map((c) => ({ title: c.label, path: `/learn?category=${c.id}` }))
}

export async function docLinks(): Promise<LlmsLink[]> {
  try {
    const { docHref, getDocTree } = await import('@/lib/docs')
    return getDocTree().flatMap((s) => s.docs.map((d) => ({ title: `${d.title} (${s.label})`, path: docHref(d) }))).slice(0, 80)
  } catch {
    return []
  }
}
