/**
 * Minimal RSS item extractor (no new dependency).
 * Ceiling: imperfect XML edge cases — swap to a real parser if feeds break.
 */
export interface RssItem {
  title: string
  link: string
  summary: string
  publishedAt?: string
}

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function tag(block: string, name: string): string {
  const re = new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i')
  const m = block.match(re)
  return m ? decodeEntities(m[1].trim()) : ''
}

export function parseRssItems(xml: string, limit = 8): RssItem[] {
  const chunks = xml.split(/<item[\s>]/i).slice(1)
  const items: RssItem[] = []
  for (const raw of chunks) {
    const block = raw.split(/<\/item>/i)[0] || ''
    const title = tag(block, 'title').replace(/<[^>]+>/g, '').trim()
    const link = tag(block, 'link').replace(/<[^>]+>/g, '').trim() ||
      (block.match(/<link[^>]+href=["']([^"']+)["']/i)?.[1] || '')
    const summary = (tag(block, 'description') || tag(block, 'summary') || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 600)
    const publishedAt = tag(block, 'pubDate') || tag(block, 'published') || undefined
    if (!title || !link) continue
    items.push({ title, link, summary, publishedAt })
    if (items.length >= limit) break
  }
  return items
}

export async function fetchFeedItems(url: string, limit = 5): Promise<RssItem[]> {
  const { readTextCapped, safeFetch } = await import('@/lib/url-safety')
  // Admin-managed feed URLs: SSRF-checked on every hop, body capped at 5 MB.
  const res = await safeFetch(url, {
    headers: { 'User-Agent': 'CodeSpectraSignals/1.0 (+https://codespectra.ai)' },
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`Feed ${url} → ${res.status}`)
  const xml = await readTextCapped(res, 5 * 1024 * 1024)
  return parseRssItems(xml, limit)
}
