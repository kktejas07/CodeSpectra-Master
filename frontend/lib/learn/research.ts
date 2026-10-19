/**
 * Optional research step for the generator: fetch a few reference pages, ONLY
 * from the admin-managed source allowlist, through the SSRF-safe fetcher
 * (lib/url-safety safeFetch, every redirect hop re-checked). Page text is
 * used as untrusted context for the model and to check for copying; only the
 * URLs are stored (as citations), never the text.
 */
import { readTextCapped, safeFetch } from '@/lib/url-safety'
import { htmlToText } from '@/lib/signals/research'
import { scanPrompt } from '@/lib/ai/prompt-guard'
import { hostAllowed } from './quality'

export interface ReferencePage {
  url: string
  title: string
  text: string
}

const MAX_PAGES = 3
const MAX_TEXT = 6000
const MAX_HTML = 600_000

/** Candidate reference URLs: the topic's own refs, then a Wikipedia article guess. */
export function candidateUrls(title: string, refs: readonly string[] = []): string[] {
  const wikiTitle = title.replace(/\s*\(.*?\)\s*/g, ' ').replace(/[:]/g, ' ').trim().replace(/\s+/g, '_')
  const wiki = wikiTitle ? `https://en.wikipedia.org/wiki/${encodeURIComponent(wikiTitle.charAt(0).toUpperCase() + wikiTitle.slice(1))}` : ''
  return [...new Set([...refs, wiki].filter(Boolean))]
}

export async function fetchReferences(title: string, refs: readonly string[], domains: readonly string[]): Promise<{ pages: ReferencePage[]; flags: string[] }> {
  const flags: string[] = []
  const pages: ReferencePage[] = []
  const urls = candidateUrls(title, refs).filter((u) => {
    try {
      const h = new URL(u)
      return h.protocol === 'https:' && hostAllowed(h.hostname, domains)
    } catch {
      return false
    }
  })
  for (const url of urls.slice(0, MAX_PAGES + 2)) {
    if (pages.length >= MAX_PAGES) break
    try {
      const res = await safeFetch(url, {
        headers: { 'User-Agent': 'CodeSpectraLearn/1.0 (+https://codespectra.ai; educational research bot)', Accept: 'text/html' },
        signal: AbortSignal.timeout(10_000),
      })
      if (!res.ok) continue
      // Redirects may land off the allowlist: re-check the final host.
      const finalHost = (() => { try { return new URL(res.url || url).hostname } catch { return '' } })()
      if (finalHost && !hostAllowed(finalHost, domains)) continue
      const ctype = (res.headers.get('content-type') || '').toLowerCase()
      if (!ctype.includes('html') && !ctype.includes('text')) continue
      // Streamed and cut at MAX_HTML bytes — the rest is never downloaded.
      const html = await readTextCapped(res, MAX_HTML, { truncate: true })
      const pageTitle = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 200)
      const text = htmlToText(html).slice(0, MAX_TEXT)
      if (text.length < 200) continue
      // Fetched text is data, never instructions. A page that looks like a prompt
      // injection is dropped entirely (its URL is not cited either).
      const scan = scanPrompt(text)
      if (scan.flagged) {
        flags.push(`research:injection(${new URL(url).hostname})`)
        continue
      }
      pages.push({ url, title: pageTitle || title, text })
    } catch {
      // Unreachable / blocked / timed out: skip quietly.
    }
  }
  return { pages, flags }
}
