/**
 * Core auto-draft pipeline — shared by:
 *   - POST /api/admin/blog/auto-draft   (superadmin HTTP route)
 *   - POST /api/cron/signals-ingest      (fires after new signal items are ingested)
 *
 * ponytail: extracted from the route so the cron can call it without
 * auth-gating. The route still keeps its own requireSuperAdmin guard.
 */
import 'server-only'
import { sanitizeArticleHtml, safeHttpUrl } from '@/lib/safe-html'
import { backendComplete } from '@/lib/ai/backend'
import { performWebSearch } from '@/lib/ai/web-search'
import { gatherSourceTexts } from '@/lib/signals/research'
import { blogPosts, newBlogId } from '@/lib/db/blog-posts'
import type { BlogCategoryId } from '@/lib/blog-categories'

export interface AutoDraftResult {
  ok: boolean
  slug?: string
  title?: string
  excerpt?: string
  facts?: number
  sources?: number
  error?: string
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function parseJsonObject(res: { ok: boolean; json?: unknown; text?: string; raw?: string }): Record<string, unknown> | null {
  if (!res.ok) return null
  if (res.json && typeof res.json === 'object') return res.json as Record<string, unknown>
  try {
    const t = String(res.text || res.raw || '').trim()
    const start = t.indexOf('{')
    const end = t.lastIndexOf('}')
    if (start >= 0 && end > start) return JSON.parse(t.slice(start, end + 1)) as Record<string, unknown>
  } catch {}
  return null
}

async function rewriteTitle(originalTitle: string): Promise<string> {
  try {
    const res = await backendComplete({
      cache: false,
      systemMessage: `You are an expert editor. Rewrite the given title to be unique, engaging, and completely different from the original.
Rules:
- Keep the core topic/meaning
- Make it sound original and fresh
- Use different words and structure
- Make it engaging for developers/students
- Return ONLY the new title text, nothing else`,
      userMessage: `Original title: "${originalTitle}"\n\nRewrite this title to be unique:`,
      modelRole: 'fast',
      feature: 'blog-title-rewrite',
    })
    if (res.ok && res.text) {
      const rewritten = res.text.trim().replace(/^["']|["']$/g, '').slice(0, 160)
      if (rewritten.length > 10) return rewritten
    }
  } catch (e) {
    console.warn('[auto-draft] Title rewrite failed, using original:', e)
  }
  return `${originalTitle} — What Developers Need to Know`
}

async function deepResearch(topic: string): Promise<{
  pages: { url: string; text: string; title?: string }[]
  snippets: string
}> {
  const snippets = await performWebSearch(topic)
  const urls: string[] = []
  const urlRegex = /https?:\/\/[^\s<>"')]+/g
  let m: RegExpExecArray | null
  while ((m = urlRegex.exec(snippets)) !== null && urls.length < 3) {
    const url = m[0].replace(/[.,;:!?)]+$/, '')
    if (!urls.includes(url)) urls.push(url)
  }
  const pages: { url: string; text: string; title?: string }[] = []
  for (const url of urls.slice(0, 3)) {
    try {
      const result = await gatherSourceTexts(url)
      pages.push(...result)
    } catch {}
  }
  return { pages, snippets }
}

async function extractFacts(args: {
  title: string
  category: string
  snippets: string
  pages: { url: string; text: string; title?: string }[]
}): Promise<{ facts: Array<{ claim: string; source_url: string; date?: string }>; angle: string; source_urls: string[] }> {
  const corpus = args.pages
    .map((p, i) => `--- SOURCE ${i + 1}: ${p.url}\nTitle: ${p.title || '(none)'}\n${p.text.slice(0, 3500)}`)
    .join('\n\n')

  try {
    const res = await backendComplete({
      cache: false,
      systemMessage: `You are a research desk. Extract ONLY verifiable facts. Return strict JSON:
{
  "angle": "one-line angle for students/builders",
  "facts": [{"claim":"...","source_url":"https://...","date":""}],
  "source_urls": ["https://..."]
}
Rules: 4-10 facts, include source_url, no invented info.`,
      userMessage: `Title: ${args.title}\nCategory: ${args.category}\n\nSNIPPETS:\n${args.snippets || '(none)'}\n\nPAGES:\n${corpus || '(none)'}`,
      modelRole: 'reasoning',
      responseFormat: 'json',
      feature: 'blog-auto-facts',
    })

    const raw = parseJsonObject(res)
    const facts = Array.isArray(raw?.facts) ? (raw!.facts as any[]).filter((f) => f?.claim && f?.source_url) : []
    const source_urls = Array.isArray(raw?.source_urls)
      ? (raw!.source_urls as string[]).filter((u) => u?.startsWith('http'))
      : []
    return {
      facts: facts.slice(0, 10),
      angle: String(raw?.angle || '').slice(0, 200),
      source_urls: source_urls.slice(0, 6),
    }
  } catch (e) {
    console.warn('[auto-draft] Fact extraction failed, returning empty:', e)
    return { facts: [], angle: '', source_urls: [] }
  }
}

async function writePost(args: {
  title: string
  category: string
  angle: string
  facts: Array<{ claim: string; source_url: string; date?: string }>
  snippets: string
}): Promise<{ title: string; excerpt: string; body: string } | null> {
  const factBlock = args.facts
    .map((f, i) => `${i + 1}. ${f.claim}${f.date ? ` (${f.date})` : ''} [${f.source_url}]`)
    .join('\n')

  const res = await backendComplete({
    cache: false,
    systemMessage: `You are a CodeSpectra staff writer. Write ONLY from facts. Do not invent.
Audience: Indian students + early-career engineers.
Structure: <h2>What happened</h2><p>...</p><h2>Why builders should care</h2><p>...</p><h2>What to practice this week</h2><ul><li>...</li></ul><h2>Sources</h2><ul><li><a href="URL">label</a></li></ul>
Rules: Short sentences, no AI fluff, unique title, concrete examples.
Return JSON: {"title":"...","excerpt":"...","body":"<h2>..."}`,
    userMessage: `Title: ${args.title}\nCategory: ${args.category}\nAngle: ${args.angle}\n\nFACTS:\n${factBlock}\n\n${args.snippets ? `RESEARCH:\n${args.snippets}\n` : ''}Write the post.`,
    modelRole: 'fast',
    responseFormat: 'json',
    feature: 'blog-auto-write',
  })

  const raw = parseJsonObject(res)
  if (!raw || !raw.body) return null
  return {
    title: String(raw.title || args.title).trim().slice(0, 160),
    excerpt: String(raw.excerpt || args.angle).trim().slice(0, 400),
    body: String(raw.body || '').trim(),
  }
}

/**
 * Run the full auto-draft pipeline for a given topic.
 * Always saves as `status: 'draft'` — never auto-publishes.
 */
export async function runAutoDraft(topic: string, category: BlogCategoryId = 'signals'): Promise<AutoDraftResult> {
  try {
    console.log('[auto-draft] Starting pipeline for:', topic)

    const uniqueTitle = await rewriteTitle(topic)
    const { pages, snippets } = await deepResearch(topic)
    const { facts, angle, source_urls } = await extractFacts({ title: uniqueTitle, category, snippets, pages })

    let post = await writePost({ title: uniqueTitle, category, angle, facts, snippets })
    if (!post) {
      console.warn('[auto-draft] AI write failed, using fallback draft')
      const factBlock = facts
        .map((f) => `<li>${f.claim} <a href="${f.source_url}" rel="noopener noreferrer">source</a></li>`)
        .join('\n')
      const sourceLinks = source_urls.map((u) => `<li><a href="${u}" rel="noopener noreferrer">${u}</a></li>`).join('\n')
      post = {
        title: uniqueTitle,
        excerpt: angle || `What developers need to know about ${topic}`,
        body: `<h2>What happened</h2>\n<p>${angle || topic}</p>\n<h2>Key facts</h2>\n<ul>\n${factBlock || '<li>Research in progress</li>'}</ul>\n<h2>Sources</h2>\n<ul>\n${sourceLinks || '<li>Links pending</li>'}</ul>`,
      }
    }

    const slug = slugify(post.title)
    const col = await blogPosts()
    await col.insertOne({
      id: newBlogId(),
      slug,
      title: post.title,
      excerpt: post.excerpt,
      body: sanitizeArticleHtml(post.body),
      category,
      tags: [],
      author_name: 'CodeSpectra Editorial',
      status: 'draft',
      read_minutes: Math.ceil(post.body.replace(/<[^>]*>/g, '').split(/\s+/).length / 200),
      cover_image: undefined,
      source_urls:
        source_urls.length > 0
          ? source_urls.map((u) => safeHttpUrl(u)).filter((u): u is string => !!u && /^https?:/i.test(u))
          : undefined,
      published_at: undefined,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: 'auto-draft',
    })

    console.log('[auto-draft] Done —', facts.length, 'facts,', source_urls.length, 'sources')
    return { ok: true, slug, title: post.title, excerpt: post.excerpt, facts: facts.length, sources: source_urls.length }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[auto-draft] Pipeline error:', msg)
    return { ok: false, error: msg }
  }
}
