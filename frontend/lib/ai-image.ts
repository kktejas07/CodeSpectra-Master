/**
 * AI cover image generation for blog posts and ebooks.
 *
 * ponytail: single keyless provider (Pollinations/flux, CDN-cached URLs) with a
 * verified-fetch so the persisted URL is warm before we store it. Upgrade path:
 * add OpenAI/gemini image calls ahead of it and upload bytes to R2 when a
 * public base URL is configured. Callers fall back to SVG/CSS covers on null.
 */
import { readServerSecrets } from '@/lib/server-secrets-cache'

const TIMEOUT_MS = 45_000

export function buildNewsCoverPrompt(opts: {
  title: string
  excerpt?: string
  category?: string
}): string {
  const cat = (opts.category || '').toLowerCase()
  const topic = opts.title || ''

  // Category-specific visual styles for realistic, relevant covers
  const categoryStyles: Record<string, string> = {
    signals: `Professional editorial photograph with dramatic lighting, abstract data visualization overlays, modern tech aesthetic, shallow depth of field, cinematic color grading`,
    product: `Sleek product photography with clean studio lighting, minimalist composition, premium tech device showcase, soft gradient background, professional commercial style`,
    engineering: `Abstract code visualization with glowing terminal screens, dark moody developer workspace, neon accent lights, bokeh background, hacker aesthetic photography`,
    careers: `Professional workspace photography, modern office environment, diverse team collaboration, natural lighting, corporate lifestyle photography`,
    campus: `Vibrant campus life photography, students in modern learning environment, bright natural lighting, educational technology, candid documentary style`,
    playbook: `Strategic business photography, abstract network visualization, modern dashboard interface, clean data presentation, professional infographic style`,
  }

  const style = categoryStyles[cat] || `Professional editorial photography with modern tech aesthetic, clean composition, dramatic lighting, shallow depth of field`

  // Build a prompt that generates realistic, topic-relevant imagery
  return (
    `Professional photograph representing "${topic}", ${style}, ` +
    `high resolution, magazine quality, editorial cover image, ` +
    `no text, no words, no letters, no logos, no watermarks`
  )
}

export function buildEbookCoverPrompt(opts: { topic?: string; title?: string }): string {
  const subject = opts.topic || opts.title || 'software engineering guide'
  return (
    `Isometric 3D illustration representing "${subject}", featuring a cute 3D tech mascot character, glowing technological symbols, floating glossy 3D objects, ` +
    `clean gradient studio background, soft shadows, vibrant modern colors, playful but professional, ` +
    `high detail render, no text, no words, no letters`
  )
}

/** Deterministic seed from prompt so the same topic always regenerates the same art. */
function seedFor(prompt: string): number {
  let h = 0
  for (let i = 0; i < prompt.length; i++) h = (h * 31 + prompt.charCodeAt(i)) >>> 0
  return h % 100000
}

async function pollinationsCover(prompt: string, width: number, height: number): Promise<string | null> {
  const url =
    `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt.slice(0, 900))}` +
    `?width=${width}&height=${height}&nologo=true&model=flux&seed=${seedFor(prompt)}`
  try {
    // Warm + verify once before persisting — pollinations renders on first
    // request (slow), then serves the cached image from their CDN.
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!res.ok) return null
    const type = res.headers.get('content-type') || ''
    if (!type.startsWith('image/')) return null
    await res.arrayBuffer() // drain so the CDN has the full render cached
    return url
  } catch {
    return null
  }
}

/**
 * Generate cover art for a prompt. Returns a persistent image URL, or null if
 * every provider fails (caller keeps its existing fallback).
 */
export async function generateCoverImage(
  prompt: string,
  opts: { width?: number; height?: number } = {},
): Promise<string | null> {
  const width = opts.width || 1280
  const height = opts.height || 720

  const openaiKey = (await readServerSecrets()).openai_api_key
  if (openaiKey && !openaiKey.includes('*')) {
    try {
      const res = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: 'dall-e-3',
          prompt: prompt.slice(0, 3800),
          size: width > height ? '1792x1024' : '1024x1792',
          n: 1,
          response_format: 'b64_json',
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (res.ok) {
        const data = (await res.json()) as { data?: { b64_json?: string }[] }
        const b64 = data.data?.[0]?.b64_json
        if (b64) return `data:image/png;base64,${b64}`
      }
    } catch {
      /* fall through to pollinations */
    }
  }

  return pollinationsCover(prompt, width, height)
}
