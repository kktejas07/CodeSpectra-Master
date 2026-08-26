/**
 * Lightweight server-side web scraper to fetch live context from DuckDuckGo Lite.
 * Does not require any API keys.
 */
export async function performWebSearch(query: string): Promise<string> {
  try {
    const res = await fetch('https://lite.duckduckgo.com/lite/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      body: new URLSearchParams({ q: query, kl: 'us-en' }),
      next: { revalidate: 300 } // Cache results for 5 minutes
    })
    
    if (!res.ok) {
      console.warn('[web-search] DuckDuckGo returned status:', res.status)
      return ''
    }

    const html = await res.text()
    
    // DuckDuckGo Lite returns search snippets inside <td class='result-snippet'>
    const results: string[] = []
    const snippetRegex = /<td class='result-snippet'>([\s\S]*?)<\/td>/g
    
    let match;
    while ((match = snippetRegex.exec(html)) !== null && results.length < 5) {
      // Strip HTML tags and decode basic entities manually
      let text = match[1]
        .replace(/<[^>]*>?/gm, '')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .trim()
      
      if (text) {
        results.push(`- ${text}`)
      }
    }
    
    return results.join('\n\n')
  } catch (e) {
    console.warn('[web-search] Error performing web search:', e)
    return ''
  }
}
