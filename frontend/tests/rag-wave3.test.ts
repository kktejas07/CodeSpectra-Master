/**
 * Knowledge layer: text-index weight migration, docs preamble/heading
 * handling, section-exact chunking, and the marketplace / events-feed
 * extractors (public only when published).
 */
import { describe, it, expect } from 'vitest'
import { CHUNK_TEXT_INDEX, ensureTextIndex, textIndexOutdated } from '@/lib/rag/store'
import { MemoryDb } from '@/lib/rag/eval/memory-mongo'
import { stripDocPreamble } from '@/lib/rag/sources/docs'
import { chunkText } from '@/lib/rag/chunk'
import { externalEventSource, marketplaceProductSource } from '@/lib/rag/sources/content'

describe('rag_chunks text index', () => {
  it('detects a changed definition', () => {
    const want = { name: 'rag_chunks_text', weights: { title: 1, text: 1 } }
    expect(textIndexOutdated(undefined, want)).toBe(false)
    expect(textIndexOutdated({ name: 'rag_chunks_text', weights: { title: 1, text: 1 } }, want)).toBe(false)
    expect(textIndexOutdated({ name: 'rag_chunks_text', weights: { title: 5, text: 1 } }, want)).toBe(true)
    expect(textIndexOutdated({ name: 'title_text_text_text', weights: { title: 1, text: 1 } }, want)).toBe(true)
  })

  it('drops and recreates an index with old weights; idempotent afterwards', async () => {
    const col = new MemoryDb().collection('rag_chunks')
    await col.createIndex({ title: 'text', text: 'text' }, { name: 'rag_chunks_text', weights: { title: 5, text: 1 } })
    // A plain createIndex with new weights conflicts, like MongoDB.
    await expect(col.createIndex({ title: 'text', text: 'text' }, { name: 'rag_chunks_text', weights: { title: 1, text: 1 } })).rejects.toMatchObject({ code: 85 })
    const want = { name: CHUNK_TEXT_INDEX.name, weights: { ...CHUNK_TEXT_INDEX.weights } }
    await ensureTextIndex(col as never, { title: 'text', text: 'text' }, want)
    expect(col.textWeights).toEqual({ title: 1, text: 1 })
    await ensureTextIndex(col as never, { title: 'text', text: 'text' }, want)
    expect(await col.indexes()).toHaveLength(1)
  })
})

describe('docs preamble and sections', () => {
  const md = [
    '> **Customer Documentation**',
    '> **Last Updated**: 2026-07-08',
    '> **Audience**: Logged-in users',
    '',
    '# Dashboard Guide',
    '',
    'Intro text.',
    '',
    '## Navigation',
    '',
    'Sidebar text.',
    '',
    '```bash',
    '# not a heading',
    '```',
    '',
    '## Billing',
    '',
    'Billing text.',
  ].join('\n')

  it('removes the shared preamble and the title heading', () => {
    const out = stripDocPreamble(md, 'Dashboard guide')
    expect(out).not.toMatch(/Customer Documentation|Last Updated|Audience/)
    expect(out).not.toMatch(/^# Dashboard Guide/m)
    expect(out.startsWith('Intro text.')).toBe(true)
    expect(out).toContain('# not a heading')
  })

  it('keeps a differing H1 as plain text', () => {
    expect(stripDocPreamble('# API Guide\n\n## Auth\n\nx', 'Api keys guide').startsWith('API Guide')).toBe(true)
  })

  it('splitOnSection gives each ## its own chunk with an exact label', () => {
    const text = stripDocPreamble(md, 'Dashboard guide')
    const packed = chunkText('Dashboard guide', text)
    const split = chunkText('Dashboard guide', text, { splitOnSection: true })
    expect(packed).toHaveLength(1)
    expect(split.map((c) => c.section[0] ?? '')).toEqual(['', 'Navigation', 'Billing'])
    expect(split[2].body).toContain('Billing text.')
    expect(split[2].body).not.toContain('Sidebar text.')
  })
})

describe('catalogue extractors', () => {
  const seller = { id: 's1', status: 'approved', display_name: 'Asha Books' }
  const product = { id: 'p1', seller_id: 's1', kind: 'digital', title: 'Templates', slug: 'templates', status: 'published', category: 'templates', tags: ['resume'], currency: 'USD', price: 1900, description_md: 'Five layouts.', digital: { file_ids: ['secret-file'] } }

  it('marketplace: public only when published from an approved seller; no file ids', () => {
    const s = marketplaceProductSource(product, seller)!
    expect(s.visibility).toBe('public')
    expect(s.tenant_id).toBeNull()
    expect(s.url).toBe('/marketplace/p/templates')
    expect(s.text).toContain('19.00 USD')
    expect(s.text).not.toContain('secret-file')
    expect(marketplaceProductSource({ ...product, status: 'draft' }, seller)).toBeNull()
    expect(marketplaceProductSource(product, { ...seller, status: 'suspended' })).toBeNull()
    expect(marketplaceProductSource(product, null)).toBeNull()
  })

  it('events feed: published only', () => {
    const e = { id: 'ef_1', title: 'Hack', status: 'published', kind: 'hackathon', mode: 'online', location: { city: 'Pune', country: 'IN' }, description_summary: 'Build things.' }
    const s = externalEventSource(e)!
    expect(s.visibility).toBe('public')
    expect(s.url).toBe('/events/ef_1')
    expect(s.text).toContain('Pune')
    expect(externalEventSource({ ...e, status: 'hidden' })).toBeNull()
    expect(externalEventSource({ ...e, status: 'archived' })).toBeNull()
  })
})
