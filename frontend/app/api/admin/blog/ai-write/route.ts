/**
 * POST /api/admin/blog/ai-write
 * Body: { title, excerpt, category, research } → generate a blog post body.
 *
 * Multi-pass pipeline (adopted from Signals):
 * 1) Web research — DuckDuckGo search + full page scraping of top results
 * 2) Fact extraction — LLM extracts verifiable facts with source URLs
 * 3) Draft from facts — LLM writes HTML blog post from facts only
 * 4) Humanize — LLM polishes for clarity and human tone
 * 5) Source attribution — Footer with linked sources
 */
import { NextRequest, NextResponse } from 'next/server'
import { sanitizeArticleHtml, sourcesListHtml } from '@/lib/safe-html'
import { requireSuperAdmin } from '@/lib/route-auth'
import { backendComplete } from '@/lib/ai/backend'
import { performWebSearch } from '@/lib/ai/web-search'
import { gatherSourceTexts } from '@/lib/signals/research'
import type { BlogCategoryId } from '@/lib/blog-categories'

export const runtime = 'nodejs'
export const maxDuration = 180

interface BlogFact {
  claim: string
  source_url: string
  date?: string
}

function parseJsonObject(res: {
  ok: boolean
  json?: unknown
  text?: string
  raw?: string
}): Record<string, unknown> | null {
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

/**
 * Step 1: Deep web research — search + scrape full article pages
 */
async function deepWebResearch(title: string): Promise<{
  pages: { url: string; text: string; title?: string }[]
  snippets: string
}> {
  // Get DuckDuckGo search snippets
  const snippets = await performWebSearch(title)

  // Extract URLs from snippets to scrape full pages
  const urls: string[] = []
  const urlRegex = /https?:\/\/[^\s<>"')]+/g
  let m: RegExpExecArray | null
  while ((m = urlRegex.exec(snippets)) !== null && urls.length < 3) {
    const url = m[0].replace(/[.,;:!?)]+$/, '')
    if (!urls.includes(url)) urls.push(url)
  }

  // Scrape full page text from found URLs
  const pages: { url: string; text: string; title?: string }[] = []
  for (const url of urls.slice(0, 3)) {
    try {
      const result = await gatherSourceTexts(url)
      pages.push(...result)
    } catch {}
  }

  return { pages, snippets }
}

/**
 * Step 2: Extract verifiable facts from research
 */
async function extractFacts(args: {
  title: string
  category: string
  snippets: string
  pages: { url: string; text: string; title?: string }[]
}): Promise<{ facts: BlogFact[]; angle: string; source_urls: string[] }> {
  const corpus = args.pages
    .map((p, i) => `--- SOURCE ${i + 1}: ${p.url}\nTitle: ${p.title || '(none)'}\n${p.text.slice(0, 3500)}`)
    .join('\n\n')

  const systemMessage = `You are a research desk for the CodeSpectra engineering blog.
Extract ONLY verifiable facts from the provided source texts and search snippets. Do not invent.
Return strict JSON:
{
  "angle": "one-line CodeSpectra angle for students/builders — why this matters for learning engineers",
  "facts": [{"claim":"...","source_url":"https://...","date":"YYYY-MM-DD or empty"}],
  "source_urls": ["https://..."]
}
Rules:
- 4–10 facts max. Prefer names, numbers, dates, product/company actions, technical details.
- Every fact must include the source_url it came from.
- If sources conflict, prefer the more primary/company source.
- Never quote long passages; paraphrase claims in your own short words.`

  const userMessage = `Title: ${args.title}
Category: ${args.category}

SEARCH SNIPPETS:
${args.snippets || '(none)'}

FULL PAGE TEXTS:
${corpus || '(no page text — use title only, mark low confidence facts sparingly)'}`

  const res = await backendComplete({
    systemMessage,
    userMessage,
    modelRole: 'reasoning',
    responseFormat: 'json',
    feature: 'blog-research',
  })

  const raw = parseJsonObject(res)
  const allowed = new Set(args.pages.map((p) => p.url))

  const factsRaw = Array.isArray(raw?.facts) ? raw!.facts : []
  const facts: BlogFact[] = []
  for (const f of factsRaw) {
    if (!f || typeof f !== 'object') continue
    const claim = String((f as BlogFact).claim || '').trim()
    let source_url = String((f as BlogFact).source_url || '').trim()
    if (!claim) continue
    if (allowed.size && !allowed.has(source_url)) {
      source_url = args.pages[0]?.url || source_url
    }
    if (!source_url) continue
    facts.push({
      claim: claim.slice(0, 280),
      source_url,
      date: String((f as BlogFact).date || '').trim() || undefined,
    })
  }

  const source_urls = Array.isArray(raw?.source_urls)
    ? (raw!.source_urls as unknown[]).map(String).filter((u) => /^https?:/i.test(u))
    : args.pages.map((p) => p.url)

  const uniq = [...new Set(source_urls.length ? source_urls : args.pages.map((p) => p.url))]

  return {
    facts: facts.slice(0, 10),
    angle: String(raw?.angle || 'What builders should learn from this').trim().slice(0, 200),
    source_urls: uniq.slice(0, 6),
  }
}

/**
 * Step 3: Draft blog post from extracted facts
 */
async function draftFromFacts(args: {
  title: string
  excerpt: string
  category: BlogCategoryId
  angle: string
  facts: BlogFact[]
  researchContext: string
}): Promise<{ title: string; excerpt: string; body: string } | null> {
  const factBlock = args.facts
    .map((f, i) => `${i + 1}. ${f.claim}${f.date ? ` (${f.date})` : ''} [${f.source_url}]`)
    .join('\n')

  const systemMessage = `You are a Senior Staff Engineer and expert technical writer for the CodeSpectra engineering blog.
Write ONLY from the fact list and research context below. Do not invent companies, dates, or numbers.
Audience: Indian students + early-career engineers learning to build.

Structure HTML exactly:
<h2>What happened</h2>
<p>...</p>
<h2>Why builders should care</h2>
<p>...</p>
<h2>What to practice this week</h2>
<ul><li>...</li></ul>

CRITICAL RULES:
1. **Output Format**: Output ONLY valid, clean HTML for the body content. Do not include <h1> title. Do NOT output wrapper text or markdown blocks. Just raw HTML.
2. **Key Takeaways**: After the intro, include:
   <blockquote><strong>Key Takeaways</strong><ul><li>[Core finding]</li><li>[Actionable recommendation]</li><li>[Strategic implication]</li></ul></blockquote>
3. **BANNED WORDS**: "delve", "tapestry", "robust", "seamlessly", "game-changer", "landscape", "crucial", "testament", "revolutionize", "multifaceted", "embark", "in today's rapidly", "moreover", "furthermore".
4. **Internal Linking Zones**: Create 3-5 opportunities: [INTERNAL-LINK: anchor text → description]
5. **Visual Media**: Include 2-3 inline images using topic-relevant photographic styles (NOT cartoon illustrations):
   <img src="https://image.pollinations.ai/prompt/[YOUR_URL_ENCODED_TOPIC_RELEVANT_PHOTOGRAPHIC_PROMPT],%20professional%20photography,%20editorial%20quality,%20dramatic%20lighting,%20no%20text?width=800&height=400&nologo=true&seed=[RANDOM_5_DIGIT_NUMBER]" alt="Description" class="my-6 rounded-xl border border-border object-cover w-full shadow-sm" />
   Example prompts per category:
   - signals: "abstract data visualization, glowing network nodes, dark tech background"
   - engineering: "code on screen, developer workspace, neon terminal lights"
   - product: "modern tech device, clean studio photography, minimalist"
   - careers: "professional workspace, modern office, natural lighting"
   - campus: "students learning technology, modern classroom, bright lighting"
6. **Length**: 800-1500 words. Professional, opinionated, practical tone.
7. **Voice**: Write like a real human engineer sharing insights. Short sentences. Concrete examples.
Return JSON: {"title":"...","excerpt":"...","body":"<h2>..."}`

  const userMessage = `Title: ${args.title}
Category: ${args.category}
Angle: ${args.angle}
Excerpt: ${args.excerpt || 'Write a comprehensive guide.'}

FACTS:
${factBlock || '(thin facts — be conservative, say what is known vs unknown)'}

${args.researchContext ? `\nADDITIONAL WEB RESEARCH:\n${args.researchContext}\n` : ''}
Write the blog post.`

  const res = await backendComplete({
    systemMessage,
    userMessage,
    modelRole: 'reasoning',
    responseFormat: 'json',
    feature: 'blog-draft',
  })

  const raw = parseJsonObject(res)
  if (!raw) return null
  const title = String(raw.title || args.title).trim().slice(0, 160)
  const excerpt = String(raw.excerpt || args.angle).trim().slice(0, 400)
  const body = String(raw.body || '').trim()
  if (!title || !body) return null
  return { title, excerpt, body }
}

/**
 * Step 4: Humanize — polish for clarity and human tone
 */
async function humanize(args: {
  title: string
  excerpt: string
  body: string
}): Promise<{ title: string; excerpt: string; body: string }> {
  const systemMessage = `You are a sharp tech editor at CodeSpectra. Improve clarity and human rhythm so it reads like a real engineer wrote it.
Do NOT add new facts or claims. Keep all <a href> source links, <img> tags, and [INTERNAL-LINK] markers.
Ensure the title is catchy, unique, and completely different from any source title.
Cut clichés. Prefer concrete verbs. Keep HTML structure.
Return JSON: {"title":"...","excerpt":"...","body":"..."}`

  const res = await backendComplete({
    systemMessage,
    userMessage: `Title: ${args.title}\nExcerpt: ${args.excerpt}\n\nBody HTML:\n${args.body}`,
    modelRole: 'fast',
    responseFormat: 'json',
    feature: 'blog-humanize',
  })
  const raw = parseJsonObject(res)
  if (!raw) return args
  return {
    title: String(raw.title || args.title).trim().slice(0, 160),
    excerpt: String(raw.excerpt || args.excerpt).trim().slice(0, 400),
    body: String(raw.body || args.body).trim(),
  }
}

/**
 * Step 5: Add source attribution footer
 */
function ensureSourcesFooter(body: string, sourceUrls: string[]): string {
  if (/<h2[^>]*>\s*Sources\s*<\/h2>/i.test(body)) return body
  if (!sourceUrls.length) return body
  // Validated http(s) hrefs, escaped labels (E13).
  const list = sourcesListHtml(sourceUrls)
  return sanitizeArticleHtml(list ? `${body}\n${list}` : body)
}

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const body = (await req.json().catch(() => ({}))) as {
    title?: string
    excerpt?: string
    category?: string
    research?: boolean
  }

  if (!body.title) {
    return NextResponse.json({ error: 'Title required' }, { status: 400 })
  }

  const category = (body.category || 'signals') as BlogCategoryId

  try {
    // Step 1: Deep web research
    console.log('[blog/ai-write] Step 1: Deep web research for', body.title)
    const { pages, snippets } = await deepWebResearch(body.title)

    // Step 2: Extract facts
    console.log('[blog/ai-write] Step 2: Extracting facts from', pages.length, 'sources')
    const { facts, angle, source_urls } = await extractFacts({
      title: body.title,
      category,
      snippets,
      pages,
    })

    // Step 3: Draft from facts
    console.log('[blog/ai-write] Step 3: Drafting from', facts.length, 'facts')
    const drafted = await draftFromFacts({
      title: body.title,
      excerpt: body.excerpt || '',
      category,
      angle,
      facts,
      researchContext: snippets,
    })
    if (!drafted) {
      return NextResponse.json({ error: 'Draft generation failed' }, { status: 502 })
    }

    // Step 4: Humanize
    console.log('[blog/ai-write] Step 4: Humanizing draft')
    const polished = await humanize(drafted)

    // Step 5: Add sources footer
    const bodyWithSources = ensureSourcesFooter(polished.body, source_urls)

    console.log('[blog/ai-write] Done —', facts.length, 'facts,', source_urls.length, 'sources')
    return NextResponse.json({
      ok: true,
      html: bodyWithSources,
      title: polished.title,
      excerpt: polished.excerpt,
      facts: facts.length,
      sources: source_urls.length,
    })
  } catch (e) {
    console.error('[blog/ai-write] Pipeline error:', e)
    return NextResponse.json(
      { error: 'Content generation failed. Try again.' },
      { status: 502 }
    )
  }
}
