import type { EbookDoc, EbookPage } from '@/lib/db/ebooks'
import { COVER_THEMES, newEbookId, nowIso, slugifyEbook } from '@/lib/db/ebooks'

function portfolioPages(): EbookPage[] {
  return [
    {
      type: 'cover',
      title: 'Understanding Portfolio Basics',
      subtitle: 'A complete guide for students & early-career professionals',
    },
    {
      type: 'toc',
      title: 'Table of contents',
      items: [
        { label: '01', text: 'What is a portfolio, and why do you need one?', color: 'violet' },
        { label: '02', text: 'Core components of a portfolio', color: 'rose' },
        { label: '03', text: 'Frameworks for building a winning portfolio', color: 'amber' },
        { label: '04', text: 'Structuring the right portfolio', color: 'orange' },
        { label: '05', text: 'Using CodeSpectra to build portfolio-worthy credentials', color: 'teal' },
        { label: '06', text: 'Common mistakes to avoid', color: 'red' },
      ],
    },
    {
      type: 'section',
      title: 'What is a portfolio, and why do you need one?',
      quote: 'Start where you are. Use what you have. Do what you can.',
      quoteBy: 'Arthur Ashe',
      body: 'A portfolio is living proof of your skills — projects, write-ups, and outcomes — not just a list of courses.',
    },
    {
      type: 'compare',
      title: 'Resume vs Portfolio',
      left: {
        title: 'Resume',
        points: ['Tells what you studied', 'One or two pages', 'Keywords for ATS', 'Static snapshot'],
      },
      right: {
        title: 'Portfolio',
        points: ['Shows what you actually did', 'Links + demos', 'Story of impact', 'Living document'],
      },
    },
    {
      type: 'stats',
      title: 'Why do you need a portfolio?',
      items: [
        { label: '1', text: 'Your resume gets you noticed; your portfolio gets you hired.', color: 'teal' },
        { label: '2', text: 'Hiring managers want proof of shipping, not just certificates.', color: 'rose' },
        { label: '3', text: 'A strong portfolio compounds — each project raises your bar.', color: 'violet' },
      ],
      stats: [
        { value: '70%', label: 'of recruiters review work samples when available' },
        { value: '2×', label: 'more interview callbacks with a public project link' },
      ],
    },
    {
      type: 'journey',
      title: 'Your journey to success',
      steps: [
        { n: '01', title: 'Learn skills', text: 'Pick a stack and go deep for 4–6 weeks.' },
        { n: '02', title: 'Build a project', text: 'Ship something end-to-end you can demo.' },
        { n: '03', title: 'Add to portfolio', text: 'Write the problem, approach, and outcome.' },
        { n: '04', title: 'Get opportunities', text: 'Share links on applications and CodeSpectra profile.' },
      ],
    },
    {
      type: 'tips',
      title: 'Common mistakes to avoid',
      bullets: [
        'Listing unfinished repos with no README',
        'No screenshots or live demo',
        'Skipping the “what I learned” section',
        'Copying tutorial apps without a twist',
        'Never updating after your first version',
      ],
    },
  ]
}

function dsaPages(): EbookPage[] {
  return [
    {
      type: 'cover',
      title: 'DSA Warm-up in 7 Days',
      subtitle: 'A practical starter for coding interviews',
    },
    {
      type: 'toc',
      title: 'Table of contents',
      items: [
        { label: '01', text: 'Mindset & daily plan', color: 'teal' },
        { label: '02', text: 'Arrays & hashing', color: 'violet' },
        { label: '03', text: 'Two pointers & sliding window', color: 'amber' },
        { label: '04', text: 'Trees & recursion basics', color: 'rose' },
        { label: '05', text: 'How to review with CodeSpectra', color: 'slate' },
      ],
    },
    {
      type: 'section',
      title: 'Mindset & daily plan',
      body: 'Consistency beats intensity. Forty focused minutes daily beats weekend marathons.',
      bullets: [
        'Day 1–2: arrays + hash maps',
        'Day 3–4: two pointers / window',
        'Day 5–6: binary trees',
        'Day 7: mixed review + bookmarks',
      ],
    },
    {
      type: 'tips',
      title: 'Interview-ready habits',
      bullets: [
        'Say the brute force first, then optimize',
        'Write complexity out loud',
        'Bookmark tricky quiz questions from modules',
        'Re-solve bookmarked problems after 48 hours',
      ],
    },
    {
      type: 'stats',
      title: 'Power facts',
      stats: [
        { value: '80%', label: 'of warm-up problems reuse 5 patterns' },
        { value: '3×', label: 'retention when you revisit bookmarked questions' },
      ],
      items: [
        { label: 'Tip', text: 'Use CodeSpectra module quizzes as spaced repetition.', color: 'teal' },
      ],
    },
  ]
}

function systemDesignPages(): EbookPage[] {
  return [
    {
      type: 'cover',
      title: 'System Design Lite',
      subtitle: 'From whiteboard anxiety to structured answers',
    },
    {
      type: 'toc',
      title: 'Table of contents',
      items: [
        { label: '01', text: 'Clarify requirements', color: 'violet' },
        { label: '02', text: 'Capacity & APIs', color: 'teal' },
        { label: '03', text: 'Data model sketch', color: 'amber' },
        { label: '04', text: 'Scale path', color: 'rose' },
      ],
    },
    {
      type: 'journey',
      title: 'A 20-minute answer arc',
      steps: [
        { n: '01', title: 'Clarify', text: 'Users, scale, latency, consistency.' },
        { n: '02', title: 'API', text: 'Write 3–5 endpoints first.' },
        { n: '03', title: 'Data', text: 'Entities + keys + hot paths.' },
        { n: '04', title: 'Scale', text: 'Cache, queue, shard — only where needed.' },
      ],
    },
    {
      type: 'tips',
      title: 'Avoid these traps',
      bullets: [
        'Jumping to Kubernetes before requirements',
        'Ignoring write vs read ratios',
        'No back-of-envelope numbers',
        'Designing for billions when the prompt says 10k users',
      ],
    },
  ]
}

export const SEED_EBOOKS: Omit<EbookDoc, 'id' | 'createdAt' | 'updatedAt' | 'publishedAt' | 'createdBy'>[] = [
  {
    slug: 'understanding-portfolio-basics',
    title: 'Understanding Portfolio Basics',
    subtitle: 'A complete guide for students & early-career professionals',
    description: 'Learn how a portfolio differs from a resume and how to structure projects that get you hired.',
    topic: 'Career',
    coverTheme: 'violet',
    readMinutes: 8,
    pages: portfolioPages(),
    status: 'published',
    sourceNote: 'Original CodeSpectra guide',
  },
  {
    slug: 'dsa-warmup-7-days',
    title: 'DSA Warm-up in 7 Days',
    subtitle: 'A practical starter for coding interviews',
    description: 'A one-week plan covering the patterns that show up in most entry interviews.',
    topic: 'DSA',
    coverTheme: 'teal',
    readMinutes: 6,
    pages: dsaPages(),
    status: 'published',
    sourceNote: 'Original CodeSpectra guide',
  },
  {
    slug: 'system-design-lite',
    title: 'System Design Lite',
    subtitle: 'From whiteboard anxiety to structured answers',
    description: 'A lightweight framework for junior/mid system design interviews.',
    topic: 'System Design',
    coverTheme: 'amber',
    readMinutes: 7,
    pages: systemDesignPages(),
    status: 'published',
    sourceNote: 'Original CodeSpectra guide',
  },
]

export async function ensureEbookSeed(createdBy = 'system'): Promise<number> {
  const { ebooksCol } = await import('@/lib/db/ebooks')
  const col = await ebooksCol()
  let n = 0
  const now = nowIso()
  for (const seed of SEED_EBOOKS) {
    const existing = await col.findOne({ slug: seed.slug })
    if (existing) continue
    await col.insertOne({
      ...seed,
      id: newEbookId(),
      createdAt: now,
      updatedAt: now,
      publishedAt: now,
      createdBy,
    })
    n++
  }
  return n
}

export function pickCoverTheme(topic: string): EbookDoc['coverTheme'] {
  const i = Math.abs([...topic].reduce((a, c) => a + c.charCodeAt(0), 0)) % COVER_THEMES.length
  return COVER_THEMES[i]
}

export function buildEbookFromOutline(opts: {
  title: string
  subtitle?: string
  description?: string
  topic: string
  pages: EbookPage[]
  status?: EbookDoc['status']
  createdBy: string
}): EbookDoc {
  const now = nowIso()
  const title = opts.title.trim() || `${opts.topic} Essentials`
  return {
    id: newEbookId(),
    slug: slugifyEbook(title) || `ebook-${Date.now()}`,
    title,
    subtitle: opts.subtitle || `A CodeSpectra guide on ${opts.topic}`,
    description: opts.description || `Practical notes on ${opts.topic} for builders and job seekers.`,
    topic: opts.topic,
    coverTheme: pickCoverTheme(opts.topic),
    readMinutes: Math.max(4, Math.min(20, Math.ceil(opts.pages.length * 1.2))),
    pages: opts.pages,
    status: opts.status || 'draft',
    sourceNote: 'Generated by CodeSpectra',
    createdAt: now,
    updatedAt: now,
    publishedAt: opts.status === 'published' ? now : null,
    createdBy: opts.createdBy,
  }
}
