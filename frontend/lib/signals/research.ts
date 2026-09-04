/**
 * Fetch public pages and strip to plain text for fact extraction.
 * Free (no search API). Only pages the seed item already points at / links to.
 */
const MAX_CHARS = 7_000
const FETCH_TIMEOUT_MS = 12_000

export async function fetchPageText(url: string): Promise<{ url: string; text: string; title?: string } | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'CodeSpectraSignals/1.0 (+https://codespectra.ai; editorial research bot)',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'follow',
    })
    if (!res.ok) return null
    const ctype = (res.headers.get('content-type') || '').toLowerCase()
    if (ctype.includes('pdf') || ctype.includes('image')) return null
    const html = await res.text()
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
      ?.replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    const text = htmlToText(html).slice(0, MAX_CHARS)
    if (text.length < 80) return null
    return { url, text, title }
  } catch {
    return null
  }
}

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|h[1-6]|li|br|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

/** Collect absolute http(s) links from HTML, preferring article-ish paths. */
export function extractOutboundLinks(html: string, baseUrl: string, limit = 4): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  let base: URL
  try {
    base = new URL(baseUrl)
  } catch {
    return []
  }
  const re = /href=["']([^"']+)["']/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    try {
      const abs = new URL(m[1], base).toString()
      if (!/^https?:/i.test(abs)) continue
      if (abs === baseUrl || abs.startsWith(baseUrl + '#')) continue
      const host = new URL(abs).hostname
      // Skip pure social/share noise
      if (/(twitter|x\.com|facebook|linkedin|instagram|youtube)\./i.test(host)) continue
      if (seen.has(abs)) continue
      seen.add(abs)
      out.push(abs)
      if (out.length >= limit * 3) break
    } catch {
      /* skip */
    }
  }
  // Prefer same-host deep links, then others
  const same = out.filter((u) => {
    try {
      return new URL(u).hostname === base.hostname
    } catch {
      return false
    }
  })
  const other = out.filter((u) => !same.includes(u))
  return [...same, ...other].slice(0, limit)
}

export async function gatherSourceTexts(seedUrl: string): Promise<{ url: string; text: string; title?: string }[]> {
  const pages: { url: string; text: string; title?: string }[] = []
  try {
    const res = await fetch(seedUrl, {
      headers: { 'User-Agent': 'CodeSpectraSignals/1.0 (+https://codespectra.ai)' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'follow',
    })
    if (res.ok) {
      const html = await res.text()
      const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
        ?.replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim()
      const text = htmlToText(html).slice(0, MAX_CHARS)
      if (text.length >= 80) pages.push({ url: seedUrl, text, title })
      const links = extractOutboundLinks(html, seedUrl, 3)
      for (const link of links) {
        if (pages.some((p) => p.url === link)) continue
        const extra = await fetchPageText(link)
        if (extra) pages.push(extra)
        if (pages.length >= 4) break
      }
    } else {
      const fallback = await fetchPageText(seedUrl)
      if (fallback) pages.push(fallback)
    }
  } catch {
    const fallback = await fetchPageText(seedUrl)
    if (fallback) pages.push(fallback)
  }
  return pages
}
