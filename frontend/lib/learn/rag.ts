/**
 * Copilot knowledge source for Learn posts: `doc` source type, id
 * `learn:<post id>`, public visibility. Only published posts load; anything
 * else returns null so the indexer removes it (unpublish → out of the index).
 */
import type { ExtractedSource } from '@/lib/rag/types'
import { learnPosts } from './store'
import { categoryLabel } from './types'

export const LEARN_DOC_PREFIX = 'learn:'

export async function loadLearnDoc(id: string): Promise<ExtractedSource | null> {
  if (!id.startsWith(LEARN_DOC_PREFIX)) return null
  const postId = id.slice(LEARN_DOC_PREFIX.length)
  if (!postId || postId.length > 100) return null
  const col = await learnPosts()
  const p = await col.findOne({ id: postId, status: 'published' }, { projection: { _id: 0 } })
  if (!p) return null
  return {
    type: 'doc',
    source_id: id,
    tenant_id: null,
    visibility: 'public',
    title: p.title,
    url: `/learn/${encodeURIComponent(p.slug)}`,
    text: `${p.summary}\n\n- Category: ${categoryLabel(p.category)}\n- Level: ${p.level}\n- Tags: ${p.tags.join(', ')}\n\n${p.body}`,
    metadata: { kind: 'learn', slug: p.slug, category: p.category, level: p.level },
  }
}

export async function listLearnDocIds(limit = 5000): Promise<string[]> {
  const col = await learnPosts()
  const rows = await col.find({ status: 'published' }, { projection: { _id: 0, id: 1 } }).limit(limit).toArray()
  return rows.map((r) => `${LEARN_DOC_PREFIX}${r.id}`)
}
