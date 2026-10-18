/**
 * Minimal HTML parser for Open Graph tags.
 * Scrapes the target URL for og:image, og:description, and fallback description.
 */
import { safeFetch } from '@/lib/url-safety'

export interface OgData {
  image?: string
  description?: string
  title?: string
}

export async function scrapeOgData(url: string): Promise<OgData> {
  try {
    // Feed item links are untrusted: block private / metadata hosts on every hop.
    const res = await safeFetch(url, {
      headers: {
        'User-Agent': 'CodeSpectraSignalsBot/1.0 (+https://codespectra.ai)',
        'Accept': 'text/html',
      },
      signal: AbortSignal.timeout(15_000),
      next: { revalidate: 0 },
    } as RequestInit)

    if (!res.ok) {
      return {}
    }

    const html = await res.text()

    // Simple regex to find meta tags
    const getMetaContent = (propertyOrName: string) => {
      // Handles both <meta property="og:image" content="..."> and <meta content="..." property="og:image">
      // Also handles name="..." instead of property="..."
      const regex1 = new RegExp(`<meta\\s+(?:property|name)=["']${propertyOrName}["']\\s+content=["']([^"']+)["']`, 'i')
      const regex2 = new RegExp(`<meta\\s+content=["']([^"']+)["']\\s+(?:property|name)=["']${propertyOrName}["']`, 'i')
      
      let match = html.match(regex1)
      if (match) return match[1]
      
      match = html.match(regex2)
      if (match) return match[1]
      
      return undefined
    }

    const image = getMetaContent('og:image') || getMetaContent('twitter:image')
    const description = getMetaContent('og:description') || getMetaContent('twitter:description') || getMetaContent('description')
    const title = getMetaContent('og:title') || getMetaContent('twitter:title') || (html.match(/<title>([^<]+)<\/title>/i)?.[1])

    return { image, description, title }
  } catch (e) {
    console.error(`[og-scraper] failed to fetch ${url}`, e)
    return {}
  }
}
