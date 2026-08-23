/**
 * Multi-pass Signals drafting:
 * 1) Gather public page text from seed + linked pages (free HTTP)
 * 2) Extract fact pack (LLM)
 * 3) Draft from facts only (LLM)
 * 4) Humanize pass (LLM)
 *
 * Cost: RSS/fetch = free. LLM = your existing platform AI keys (usage-based).
 */
import { backendComplete } from '@/lib/ai/backend'
import type { BlogCategoryId } from '@/lib/blog-categories'
import { gatherSourceTexts } from '@/lib/signals/research'

export interface SignalFact {
  claim: string
  source_url: string
  date?: string
}

export interface SignalDraftResult {
  title: string
  excerpt: string
  body: string
  facts: SignalFact[]
  source_urls: string[]
  angle: string
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
  } catch {
    /* ignore */
  }
  return null
}

async function extractFacts(args: {
  title: string
  summary: string
  pages: { url: string; text: string; title?: string }[]
}): Promise<{ facts: SignalFact[]; angle: string; source_urls: string[] }> {
  const corpus = args.pages
    .map((p, i) => `--- SOURCE ${i + 1}: ${p.url}\nTitle: ${p.title || '(none)'}\n${p.text.slice(0, 3500)}`)
    .join('\n\n')

  const systemMessage = `You are a research desk for CodeSpectra Signals.
Extract ONLY verifiable facts from the provided source texts. Do not invent.
Return strict JSON:
{
  "angle": "one-line CodeSpectra angle for students/builders",
  "facts": [{"claim":"...","source_url":"https://...","date":"YYYY-MM-DD or empty"}],
  "source_urls": ["https://..."]
}
Rules:
- 4–10 facts max. Prefer names, numbers, dates, product/company actions.
- Every fact must include the source_url it came from (must be one of the provided URLs).
- If sources conflict, prefer the more primary/company source and skip the weaker claim.
- Never quote long passages; paraphrase claims in your own short words.`

  const userMessage = `Seed headline: ${args.title}
Feed summary: ${args.summary || '(none)'}

${corpus || '(no page text — use headline/summary only, mark low confidence facts sparingly)'}`

  const res = await backendComplete({
    systemMessage,
    userMessage,
    modelRole: 'reasoning',
    responseFormat: 'json',
    feature: 'signals-research',
  })

  const raw = parseJsonObject(res)
  const allowed = new Set(args.pages.map((p) => p.url))
  if (args.pages.length === 0 && args.summary) {
    // allow empty; facts may be thin
  }

  const factsRaw = Array.isArray(raw?.facts) ? raw!.facts : []
  const facts: SignalFact[] = []
  for (const f of factsRaw) {
    if (!f || typeof f !== 'object') continue
    const claim = String((f as SignalFact).claim || '').trim()
    let source_url = String((f as SignalFact).source_url || '').trim()
    if (!claim) continue
    if (allowed.size && !allowed.has(source_url)) {
      source_url = args.pages[0]?.url || source_url
    }
    if (!source_url) continue
    facts.push({
      claim: claim.slice(0, 280),
      source_url,
      date: String((f as SignalFact).date || '').trim() || undefined,
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

async function draftFromFacts(args: {
  category: BlogCategoryId
  angle: string
  facts: SignalFact[]
  titleHint: string
}): Promise<{ title: string; excerpt: string; body: string } | null> {
  const factBlock = args.facts
    .map((f, i) => `${i + 1}. ${f.claim}${f.date ? ` (${f.date})` : ''} [${f.source_url}]`)
    .join('\n')

  const systemMessage = `You are a CodeSpectra staff writer (Signals).
Write ONLY from the fact list. Do not invent companies, dates, or numbers.
Audience: Indian students + early-career engineers.
Structure HTML exactly:
<h2>What happened</h2>
<p>...</p>
<h2>Why builders should care</h2>
<p>...</p>
<h2>What to practice this week</h2>
<ul><li>...</li></ul>
<h2>Sources</h2>
<ul><li><a href="URL">label</a></li></ul>
Voice rules (sound human):
- Short and medium sentences. No corporate fluff.
- Write in a deeply human, conversational tone. Do not sound like an AI.
- MUST create a completely unique, catchy title that is different from the seed title. Do NOT copy the seed title.
- Ban: "delve", "landscape", "unlock", "in today's rapidly", "moreover", "furthermore", "it is important to note".
- One concrete skill or tool name in the practice section.
- One direct line to the reader ("If you're in ECE…").
Return JSON: {"title":"...","excerpt":"...","body":"<h2>..."}`

  const userMessage = `Category: ${args.category}
Angle: ${args.angle}
Seed title hint: ${args.titleHint}

FACTS:
${factBlock || '(thin facts — be conservative, say what is known vs unknown)'}

Write the Signal.`

  const res = await backendComplete({
    systemMessage,
    userMessage,
    modelRole: 'fast',
    responseFormat: 'json',
    feature: 'signals-draft',
  })
  const raw = parseJsonObject(res)
  if (!raw) return null
  const title = String(raw.title || args.titleHint).trim().slice(0, 160)
  const excerpt = String(raw.excerpt || args.angle).trim().slice(0, 400)
  const body = String(raw.body || '').trim()
  if (!title || !body) return null
  return { title, excerpt, body }
}

async function humanize(args: {
  title: string
  excerpt: string
  body: string
}): Promise<{ title: string; excerpt: string; body: string }> {
  const systemMessage = `You are a sharp tech editor. Improve clarity and human rhythm so it reads like a real human wrote it.
Do NOT add new facts or claims. Keep all <a href> source links.
Ensure the title is catchy, unique, and completely different from the original source title.
Cut clichés. Prefer concrete verbs. Keep HTML structure.
Return JSON: {"title":"...","excerpt":"...","body":"..."}`

  const res = await backendComplete({
    systemMessage,
    userMessage: `Title: ${args.title}\nExcerpt: ${args.excerpt}\n\nBody HTML:\n${args.body}`,
    modelRole: 'fast',
    responseFormat: 'json',
    feature: 'signals-humanize',
  })
  const raw = parseJsonObject(res)
  if (!raw) return args
  return {
    title: String(raw.title || args.title).trim().slice(0, 160),
    excerpt: String(raw.excerpt || args.excerpt).trim().slice(0, 400),
    body: String(raw.body || args.body).trim(),
  }
}

function ensureSourcesFooter(body: string, sourceUrls: string[]): string {
  if (/<h2[^>]*>\s*Sources\s*<\/h2>/i.test(body)) return body
  if (!sourceUrls.length) return body
  const lis = sourceUrls
    .map((u) => {
      let label = u
      try {
        label = new URL(u).hostname.replace(/^www\./, '')
      } catch {
        /* keep */
      }
      return `<li><a href="${u}" rel="noopener noreferrer" target="_blank">${label}</a></li>`
    })
    .join('')
  return `${body}\n<h2>Sources</h2>\n<ul>${lis}</ul>`
}

/** Full pipeline used by cron ingest. */
export async function researchThenDraft(args: {
  title: string
  summary: string
  sourceUrl: string
  category: BlogCategoryId
}): Promise<SignalDraftResult | null> {
  const pages = await gatherSourceTexts(args.sourceUrl)
  // Always keep seed URL in the set even if fetch failed
  if (!pages.some((p) => p.url === args.sourceUrl) && args.summary) {
    pages.unshift({
      url: args.sourceUrl,
      text: `${args.title}\n\n${args.summary}`.slice(0, MAX_SAFE),
      title: args.title,
    })
  }

  const { facts, angle, source_urls } = await extractFacts({
    title: args.title,
    summary: args.summary,
    pages,
  })

  const sourceUrls = source_urls.length ? source_urls : [args.sourceUrl]

  // If research found nothing usable, fall back to thin draft from headline/summary
  const usableFacts =
    facts.length > 0
      ? facts
      : [
          {
            claim: args.summary?.slice(0, 240) || args.title,
            source_url: args.sourceUrl,
          },
        ]

  const drafted = await draftFromFacts({
    category: args.category,
    angle,
    facts: usableFacts,
    titleHint: args.title,
  })
  if (!drafted) return null

  const polished = await humanize(drafted)
  const body = ensureSourcesFooter(polished.body, sourceUrls)

  return {
    title: polished.title,
    excerpt: polished.excerpt,
    body,
    facts: usableFacts,
    source_urls: sourceUrls,
    angle,
  }
}

const MAX_SAFE = 4_000

/** Cron / admin ingest entrypoint — full research → fact pack → draft → humanize. */
export async function rewriteSignal(args: {
  title: string
  summary: string
  sourceUrl: string
  category: BlogCategoryId
}): Promise<SignalDraftResult | null> {
  return researchThenDraft(args)
}
