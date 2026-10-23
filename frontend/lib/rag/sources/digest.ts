/**
 * Public news + daily digests for the copilot (both public, platform-wide):
 *  - `news`    a published tech news post (blog_posts tagged 'signals'):
 *              title, topic, source, excerpt and the article text.
 *  - `digest`  a published daily digest: one section per category, each item
 *              with its summary, key facts and on-site link — so "what
 *              hackathons are open this week?" cites /digest/<date>.
 * Anything not published loads as null (the indexer removes it).
 */
import type { Db } from 'mongodb'
import type { ExtractedSource } from '../types'
import { fields, htmlToText, isoDate, str, strList, type Doc } from './util'

const NEWS_TAG = 'signals'
const plain = (html: unknown, max: number) => str(typeof html === 'string' ? htmlToText(html) : '', max)

function newsTopic(tags: string[]): string {
  const t = tags.find((x) => x.startsWith('news:'))
  return t ? t.slice(5) : 'industry'
}

/** Pure. */
export function newsPostSource(p: Doc): ExtractedSource | null {
  const id = str(p.id, 200)
  const tags = strList(p.tags, 20, 60)
  if (!id || p.status !== 'published' || !tags.includes(NEWS_TAG) || !str(p.slug, 200)) return null
  const text = [
    fields([['Topic', newsTopic(tags)], ['Published', isoDate(p.published_at)], ['Source', p.source_note], ['Tags', tags.filter((t) => t !== NEWS_TAG && !t.startsWith('news:'))]]),
    str(p.excerpt, 1000),
    plain(p.body, 6000),
  ].filter(Boolean).join('\n\n')
  return {
    type: 'news', source_id: id, tenant_id: null, visibility: 'public',
    title: str(p.title, 200) || 'Tech news', url: `/news/${encodeURIComponent(str(p.slug, 200))}`, text,
    metadata: { topic: newsTopic(tags), slug: str(p.slug, 200) },
  }
}

const SECTION: Record<string, string> = {
  hackathon: 'Hackathons', ctf: 'Capture the flag (CTF) events', datathon: 'Datathons', conference: 'Conferences and meetups', contest: 'Coding contests',
  codeathon: 'Codeathons and coding rounds', news: 'Tech news', learn: 'Learn posts', platform: 'New on CodeSpectra',
}
const ORDER = Object.keys(SECTION)
const path = (u: unknown) => str(u, 1000).replace(/^https?:\/\/[^/]+/, '') || '/'

/** Pure. */
export function digestSource(d: Doc): ExtractedSource | null {
  const id = str(d.id, 40)
  const date = str(d.date, 10)
  if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(date) || d.status !== 'published') return null
  const items = (Array.isArray(d.items) ? d.items : []) as Doc[]
  if (!items.length) return null
  const sections: string[] = []
  for (const cat of ORDER) {
    const rows = items.filter((i) => i.category === cat).sort((a, b) => Number(a.rank) - Number(b.rank))
    if (!rows.length) continue
    const lines = rows.map((i) => {
      const s = (i.summaries && typeof i.summaries === 'object' ? (i.summaries as Doc).en : null) as Doc | null
      const facts = fields([
        ['Starts', isoDate(i.starts_at)], ['Registration closes', isoDate(i.deadline)], ['Ends', isoDate(i.ends_at)], ['Prizes', i.prize_text],
        ['Mode', str(i.mode, 20).replace('_', ' ')], ['City', i.city], ['Topic', cat === 'news' || cat === 'learn' ? i.topic : ''], ['Source', i.source_name], ['Link', path(i.url)],
      ])
      return `### ${str(i.title, 200)}\n\n${str(s?.text, 400) || str(i.summary, 400)}\n${facts}`
    })
    sections.push(`## ${SECTION[cat]} (${date})\n\n${lines.join('\n\n')}`)
  }
  return {
    type: 'digest', source_id: id, tenant_id: null, visibility: 'public',
    title: `Daily digest ${date}: hackathons, contests, tech news and Learn posts`,
    url: `/digest/${date}`,
    text: `Daily digest for ${date}: the open hackathons, contests and events this week, the latest tech news and new Learn posts picked that day.\n\n${sections.join('\n\n')}`,
    metadata: { date, items: items.length },
    chunk: { splitOnSection: true },
  }
}

export async function loadNewsPost(db: Db, id: string): Promise<ExtractedSource | null> {
  const p = await db.collection('blog_posts').findOne({ id }, { projection: { _id: 0 } })
  return p ? newsPostSource(p as Doc) : null
}

export async function listNewsPostIds(db: Db, limit: number): Promise<string[]> {
  const rows = await db.collection('blog_posts').find({ status: 'published', tags: NEWS_TAG }, { projection: { _id: 0, id: 1 } }).limit(limit).toArray()
  return rows.map((r) => str(r.id, 200)).filter(Boolean)
}

export async function loadDigest(db: Db, id: string): Promise<ExtractedSource | null> {
  const d = await db.collection('daily_digests').findOne({ id }, { projection: { _id: 0 } })
  return d ? digestSource(d as Doc) : null
}

export async function listDigestIds(db: Db, limit: number): Promise<string[]> {
  const rows = await db.collection('daily_digests').find({ status: 'published' }, { projection: { _id: 0, id: 1 } }).limit(limit).toArray()
  return rows.map((r) => str(r.id, 40)).filter(Boolean)
}
