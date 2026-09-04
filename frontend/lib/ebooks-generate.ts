import type { EbookDoc, EbookPage } from '@/lib/db/ebooks'
import { buildEbookFromOutline } from '@/lib/ebooks-seed'
import { backendComplete } from '@/lib/ai/backend'

/** Rotating topics for daily draft cron — original CodeSpectra content only. */
export const DAILY_EBOOK_TOPICS = [
  'Resume ATS basics',
  'Git for beginners',
  'SQL interview warm-up',
  'Behavioral interview STAR stories',
  'Networking without awkwardness',
  'Open source first PR',
  'Time management for builders',
  'Debugging like a pro',
  'API design cheatsheet',
  'Cloud fundamentals in one sitting',
  'Writing a tech blog post',
  'Mock interview checklist',
] as const

function templatePages(topic: string): EbookPage[] {
  return [
    {
      type: 'cover',
      title: topic,
      subtitle: 'A CodeSpectra pocket guide',
    },
    {
      type: 'toc',
      title: 'What you will learn',
      items: [
        { label: '01', text: 'Why this topic matters', color: 'violet' },
        { label: '02', text: 'Core ideas', color: 'teal' },
        { label: '03', text: 'Practice checklist', color: 'amber' },
        { label: '04', text: 'Common mistakes', color: 'rose' },
      ],
    },
    {
      type: 'section',
      title: `Why ${topic} matters`,
      body: `${topic} shows up constantly in interviews, internships, and day-one jobs. Treat this as a focused warm-up — not a textbook.`,
      quote: 'Clarity beats complexity.',
      quoteBy: 'CodeSpectra editorial',
    },
    {
      type: 'journey',
      title: 'A simple path',
      steps: [
        { n: '01', title: 'Learn the vocabulary', text: 'Name 5–8 terms you must say confidently.' },
        { n: '02', title: 'Do one small exercise', text: 'Ship a tiny demo or write a one-page note.' },
        { n: '03', title: 'Teach it once', text: 'Explain it to a peer or in a short post.' },
        { n: '04', title: 'Bookmark gaps', text: 'Save quiz questions you miss for spaced review.' },
      ],
    },
    {
      type: 'tips',
      title: 'Practice checklist',
      bullets: [
        `Write three interview questions about ${topic}`,
        'Answer them out loud in under two minutes each',
        'Link one related CodeSpectra course or problem set',
        'Revisit bookmarked mistakes after 48 hours',
      ],
    },
    {
      type: 'tips',
      title: 'Common mistakes',
      bullets: [
        'Memorizing jargon without a worked example',
        'Skipping the “why” and jumping to tools',
        'Never revisiting notes after the first read',
        'Copying templates without adapting to your stack',
      ],
    },
  ]
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

function pagesFromAi(obj: Record<string, unknown> | null, topic: string): EbookPage[] | null {
  if (!obj || !Array.isArray(obj.pages)) return null
  const pages: EbookPage[] = []
  for (const raw of obj.pages) {
    if (!raw || typeof raw !== 'object') continue
    const p = raw as Record<string, unknown>
    const type = String(p.type || 'section') as EbookPage['type']
    const validTypes = ['cover', 'toc', 'section', 'compare', 'stats', 'journey', 'tips', 'infographic', 'code', 'quiz', 'timeline', 'callout']
    pages.push({
      type: validTypes.includes(type) ? type : 'section',
      title: p.title ? String(p.title) : undefined,
      subtitle: p.subtitle ? String(p.subtitle) : undefined,
      body: p.body ? String(p.body) : undefined,
      bullets: Array.isArray(p.bullets) ? p.bullets.map(String) : undefined,
      items: Array.isArray(p.items)
        ? p.items.map((it: unknown) => {
            const x = (it || {}) as Record<string, unknown>
            return {
              label: String(x.label || ''),
              text: String(x.text || ''),
              color: x.color ? String(x.color) : undefined,
            }
          })
        : undefined,
      left:
        p.left && typeof p.left === 'object'
          ? {
              title: String((p.left as Record<string, unknown>).title || ''),
              points: Array.isArray((p.left as Record<string, unknown>).points)
                ? ((p.left as Record<string, unknown>).points as unknown[]).map(String)
                : [],
            }
          : undefined,
      right:
        p.right && typeof p.right === 'object'
          ? {
              title: String((p.right as Record<string, unknown>).title || ''),
              points: Array.isArray((p.right as Record<string, unknown>).points)
                ? ((p.right as Record<string, unknown>).points as unknown[]).map(String)
                : [],
            }
          : undefined,
      stats: Array.isArray(p.stats)
        ? p.stats.map((s: unknown) => {
            const x = (s || {}) as Record<string, unknown>
            return { value: String(x.value || ''), label: String(x.label || '') }
          })
        : undefined,
      steps: Array.isArray(p.steps)
        ? p.steps.map((s: unknown) => {
            const x = (s || {}) as Record<string, unknown>
            return { n: String(x.n || ''), title: String(x.title || ''), text: String(x.text || '') }
          })
        : undefined,
      quote: p.quote ? String(p.quote) : undefined,
      quoteBy: p.quoteBy ? String(p.quoteBy) : undefined,
      // New page types
      code: p.code ? String(p.code) : undefined,
      language: p.language ? String(p.language) : undefined,
      questions: Array.isArray(p.questions)
        ? p.questions.map((q: unknown) => {
            const x = (q || {}) as Record<string, unknown>
            return {
              question: String(x.question || ''),
              options: Array.isArray(x.options) ? x.options.map(String) : [],
              correct: typeof x.correct === 'number' ? x.correct : 0,
              explanation: String(x.explanation || ''),
            }
          })
        : undefined,
      timeline: Array.isArray(p.timeline)
        ? p.timeline.map((t: unknown) => {
            const x = (t || {}) as Record<string, unknown>
            return {
              year: String(x.year || ''),
              title: String(x.title || ''),
              description: String(x.description || ''),
            }
          })
        : undefined,
      calloutType: p.calloutType ? String(p.calloutType) as EbookPage['calloutType'] : undefined,
    })
  }
  if (pages.length < 3) return null
  if (pages[0]?.type !== 'cover') {
    pages.unshift({ type: 'cover', title: topic, subtitle: 'A CodeSpectra pocket guide' })
  }
  return pages
}

/**
 * Build an ebook draft. Tries LLM once; falls back to deterministic templates.
 * Never scrapes third-party copyrighted books.
 */
export async function generateEbookDraft(opts: {
  topic: string
  title?: string
  status?: EbookDoc['status']
  createdBy: string
  useAi?: boolean
  pageCount?: number
}): Promise<{ ebook: EbookDoc; usedAi: boolean }> {
  const topic = opts.topic.trim() || 'Career essentials'
  const targetPages = opts.pageCount || 12
  let pages = templatePages(topic)
  let usedAi = false

  if (opts.useAi !== false) {
    try {
      const res = await backendComplete({
        systemMessage: `You write original educational flipbook pages for CodeSpectra (students & early-career).
Return strict JSON only:
{
  "title": "...",
  "subtitle": "...",
  "description": "...",
  "pages": [
    {"type":"cover","title":"...","subtitle":"..."},
    {"type":"toc","title":"...","items":[{"label":"01","text":"...","color":"violet"}]},
    {"type":"section","title":"...","body":"...","quote":"...","quoteBy":"..."},
    {"type":"journey","title":"...","steps":[{"n":"01","title":"...","text":"..."}]},
    {"type":"tips","title":"...","bullets":["..."]},
    {"type":"compare","title":"...","left":{"title":"...","points":["..."]},"right":{"title":"...","points":["..."]}},
    {"type":"stats","title":"...","stats":[{"value":"...","label":"..."}],"items":[{"label":"...","text":"...","color":"teal"}]},
    {"type":"infographic","title":"...","body":"...","stats":[{"value":"...","label":"..."}],"bullets":["..."]},
    {"type":"code","title":"...","body":"...","code":"...","language":"..."},
    {"type":"quiz","title":"...","questions":[{"question":"...","options":["A","B","C","D"],"correct":0,"explanation":"..."}]},
    {"type":"timeline","title":"...","timeline":[{"year":"...","title":"...","description":"..."}]},
    {"type":"callout","title":"...","body":"...","calloutType":"tip","bullets":["..."]}
  ]
}
Rules:
- Generate exactly ${targetPages} pages of high-quality content.
- Use a MIX of page types: sections, infographics, code examples, quizzes, timelines, callouts, tips, compares, stats, journeys.
- Each page should have an imagePrompt field (for AI illustration).
- Provide comprehensive, in-depth information with concrete examples.
- Ensure original wording, no copyrighted book text.
- Make it engaging with visual variety — don't use the same type twice in a row.`,
        userMessage: `Topic: ${topic}\nSuggested title: ${opts.title || topic}\nTarget pages: ${targetPages}`,
        modelRole: 'reasoning',
        responseFormat: 'json',
      })
      const obj = parseJsonObject(res)
      const aiPages = pagesFromAi(obj, topic)
      if (aiPages) {
        pages = aiPages
        usedAi = true
        return {
          ebook: buildEbookFromOutline({
            title: String(obj?.title || opts.title || topic),
            subtitle: obj?.subtitle ? String(obj.subtitle) : undefined,
            description: obj?.description ? String(obj.description) : undefined,
            topic,
            pages,
            status: opts.status || 'draft',
            createdBy: opts.createdBy,
          }),
          usedAi,
        }
      }
    } catch {
      /* template fallback */
    }
  }

  return {
    ebook: buildEbookFromOutline({
      title: opts.title || topic,
      topic,
      pages,
      status: opts.status || 'draft',
      createdBy: opts.createdBy,
    }),
    usedAi,
  }
}

export function topicForDay(d = new Date()): string {
  const day = Math.floor(d.getTime() / 86_400_000)
  return DAILY_EBOOK_TOPICS[day % DAILY_EBOOK_TOPICS.length]
}
