/**
 * Rewrite a public news item into CodeSpectra Signals voice via platform LLM.
 */
import { backendComplete } from '@/lib/ai/backend'
import type { BlogCategoryId } from '@/lib/blog-categories'

export async function rewriteSignal(args: {
  title: string
  summary: string
  sourceUrl: string
  category: BlogCategoryId
}): Promise<{ title: string; excerpt: string; body: string } | null> {
  const systemMessage = `You are CodeSpectra Editorial. Rewrite industry news for builders (students, engineers, hiring teams).
Rules:
- Original wording only — never copy sentences from the source.
- Focus on skills, careers, and what to practice next.
- HTML body with 2–4 <h2> sections and short <p>/<ul> content.
- Return strict JSON: {"title":"...","excerpt":"...","body":"<h2>...</h2><p>...</p>"}
- excerpt ≤ 220 chars. No markdown fences.`

  const userMessage = `Category: ${args.category}
Source URL: ${args.sourceUrl}
Headline: ${args.title}
Summary: ${args.summary || '(none)'}

Rewrite as a CodeSpectra Signal.`

  const res = await backendComplete({
    systemMessage,
    userMessage,
    modelRole: 'fast',
    responseFormat: 'json',
    feature: 'signals-rewrite',
  })

  if (!res.ok) return null

  let raw: Record<string, unknown> = {}
  if (res.json && typeof res.json === 'object') {
    raw = res.json as Record<string, unknown>
  } else {
    try {
      raw = JSON.parse(String(res.text || res.raw || '{}')) as Record<string, unknown>
    } catch {
      raw = {}
    }
  }

  const title = String(raw.title || args.title).trim().slice(0, 160)
  const excerpt = String(raw.excerpt || args.summary || title).trim().slice(0, 400)
  const body = String(raw.body || `<p>${excerpt}</p>`).trim()
  if (!title || !body) return null
  return { title, excerpt, body }
}
