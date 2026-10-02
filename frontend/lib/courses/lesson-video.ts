import { backendComplete } from '@/lib/ai/backend'
import { platformModelOverrides } from '@/lib/ai/platform-model-overrides'
import { readServerSecrets } from '@/lib/server-secrets-cache'
import {
  durationFramesFromSpoken,
  estimateSpokenSeconds,
  synthesizeTts,
  measureAudioDurationSeconds,
  alignSlideDurationsToAudio,
} from '@/lib/courses/tts'
import { SOFTWARE_FAMILIES, familyFor } from '@/lib/courses/catalog'

export type SlideType = 'title' | 'concept' | 'code' | 'visual' | 'diagram'

export interface VideoSlide {
  id: string
  type: SlideType
  visual?: 'array' | 'sort' | 'tree' | 'flow' | 'icons' | 'compare'
  title: string
  content: string[]
  code?: string
  codeLanguage?: string
  mermaid?: string
  spokenText: string
  durationInFrames: number
}

export interface GeneratedLessonVideo {
  textContent: string
  script: VideoSlide[]
  audioBuffer: Buffer
  durationSeconds: number
  takeaways: string[]
  quickCheck: LessonQuickCheck
  nextTeaser: string
  chapters: LessonChapter[]
}

export interface LessonChapter {
  title: string
  startSec: number
}

export interface LessonQuickCheck {
  recall: string
  apply: string
  stretch: string
}

export interface LessonExtras {
  takeaways: string[]
  quickCheck: LessonQuickCheck
  nextTeaser: string
  chapters: LessonChapter[]
}

/** Where lesson N sits inside its course — lets each lesson reference its
 * neighbours instead of teaching in isolation. Every field is optional. */
export interface LessonContext {
  level?: string
  lessonIndex?: number
  lessonTotal?: number
  moduleTitle?: string
  prevTitle?: string
  prevExcerpt?: string
  nextTitle?: string
}

export const LESSON_DURATION_TIERS = [10, 15, 30, 60]

/** Snap any input to the nearest supported tier (default 10). */
export function normalizeTargetMinutes(raw: unknown): number {
  const n = Number(raw)
  if (!Number.isFinite(n)) return 10
  let best = LESSON_DURATION_TIERS[0]
  for (const t of LESSON_DURATION_TIERS) {
    if (Math.abs(t - n) < Math.abs(best - n)) best = t
  }
  return best
}

const SLIDE_TARGETS: Record<number, number> = { 10: 15, 15: 22, 30: 40, 60: 60 }

/** Slide budget ≈ minutes×1.5 (10→15, 15→22, 30→40, 60→60 capped). */
export function slidesForMinutes(minutes: number): number {
  const m = normalizeTargetMinutes(minutes)
  return SLIDE_TARGETS[m] ?? Math.min(60, Math.round(m * 1.5))
}

/** Narration word budget ≈ minutes×150wpm. */
export function wordsForMinutes(minutes: number): number {
  return normalizeTargetMinutes(minutes) * 150
}

/** Minimum acceptable slides ≈ minutes×1.2 (floor 5), never above the slide target. */
export function minSlidesForMinutes(minutes: number): number {
  const m = normalizeTargetMinutes(minutes)
  return Math.min(slidesForMinutes(m), Math.max(5, Math.round(m * 1.2)))
}

/** Per-act minimum for long-form generation (each act carries a share of the budget). */
export function actMinSlides(budget: number): number {
  return Math.max(3, Math.round((budget || 0) * 0.6))
}

/** Long-form split: single call ≤15min, 3 acts for 30min, 5 for 60min. */
export function actsForMinutes(minutes: number): number {
  const m = normalizeTargetMinutes(minutes)
  if (m <= 15) return 1
  return Math.min(5, Math.max(2, Math.ceil(m / 12)))
}

/** Best-effort JSON salvage: strip fences, cut to the outer braces, drop
 * trailing commas — so one malformed LLM reply doesn't cost a full retry. */
export function repairJson(raw: string): unknown {
  let s = String(raw || '').replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  const start = s.search(/\{|\[/)
  const end = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'))
  if (start >= 0 && end > start) s = s.slice(start, end + 1)
  s = s.replace(/,(\s*[}\]])/g, '$1')
  return JSON.parse(s)
}

/** Split lesson text into acts at H2 boundaries (preamble joins act 1).
 * Falls back to even paragraph chunks when there are no H2 sections. */
export function splitIntoActs(text: string, actCount: number): { title: string; text: string }[] {
  const t = String(text || '')
  const lines = t.split('\n')
  const preamble: string[] = []
  const sections: { title: string; lines: string[] }[] = []
  let cur: { title: string; lines: string[] } | null = null
  for (const line of lines) {
    const h = line.match(/^##\s+(.+?)\s*$/)
    if (h) {
      if (cur) sections.push(cur)
      cur = { title: (h[1] || '').trim(), lines: [] }
    } else if (cur) {
      cur.lines.push(line)
    } else {
      preamble.push(line)
    }
  }
  if (cur) sections.push(cur)
  if (!sections.length) {
    const paras = t.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)
    if (!paras.length) return [{ title: 'Part 1', text: t }]
    const n = Math.max(1, Math.min(actCount, paras.length))
    const per = Math.ceil(paras.length / n)
    const acts: { title: string; text: string }[] = []
    for (let i = 0; i < n; i++) {
      const chunk = paras.slice(i * per, (i + 1) * per)
      if (!chunk.length) break
      acts.push({ title: `Part ${i + 1}`, text: chunk.join('\n\n') })
    }
    return acts.length ? acts : [{ title: 'Part 1', text: t }]
  }
  const n = Math.max(1, Math.min(actCount, sections.length))
  const per = Math.ceil(sections.length / n)
  const acts: { title: string; text: string }[] = []
  for (let i = 0; i < n; i++) {
    const chunk = sections.slice(i * per, (i + 1) * per)
    if (!chunk.length) break
    const body = chunk.map(s => `## ${s.title}\n${s.lines.join('\n')}`.trim()).join('\n\n')
    const full = i === 0 ? `${preamble.join('\n').trim()}\n\n${body}`.trim() : body
    acts.push({ title: chunk[0].title || `Part ${i + 1}`, text: full })
  }
  return acts.length ? acts : [{ title: 'Part 1', text: t }]
}

/** Chapter marks from spoken-word timing (~150wpm). With act boundaries the
 * chapters start at each act; otherwise 3-4 chapters from slide groups. */
export function chaptersFromScript(
  slides: Array<{ title?: unknown; spokenText?: unknown }>,
  bounds?: { title: string; startIndex: number }[],
): LessonChapter[] {
  try {
    const list = Array.isArray(slides) ? slides : []
    const secs = list.map(s => {
      const words = String((s as { spokenText?: unknown })?.spokenText || '').split(/\s+/).filter(Boolean).length
      return Math.max(1, Math.round((words / 150) * 60))
    })
    if (!secs.length) return []
    const startAt = (idx: number) => secs.slice(0, Math.max(0, Math.min(idx, secs.length))).reduce((a, b) => a + b, 0)
    const titleAt = (idx: number, fb: string) => String((list[idx] as { title?: unknown })?.title || fb).trim() || fb
    if (bounds && bounds.length) {
      return bounds.map((b, i) => ({
        title: String(b?.title || '').trim() || titleAt(b?.startIndex || 0, `Part ${i + 1}`),
        startSec: startAt(Number(b?.startIndex) || 0),
      }))
    }
    const groups = Math.min(4, Math.max(3, Math.round(secs.length / 5)))
    const per = Math.ceil(secs.length / groups)
    const out: LessonChapter[] = []
    for (let g = 0; g < groups && g * per < secs.length; g++) {
      const idx = g * per
      out.push({ title: titleAt(idx, `Part ${g + 1}`), startSec: startAt(idx) })
    }
    return out
  } catch {
    return []
  }
}

const EMPTY_EXTRAS: LessonExtras = {
  takeaways: [],
  quickCheck: { recall: '', apply: '', stretch: '' },
  nextTeaser: '',
  chapters: [],
}

/** Parse the recap/checks/teaser slides the prompt requires. Never throws —
 * returns empty strings/arrays when the script doesn't contain them. */
export function extractLessonExtras(slides: unknown): Omit<LessonExtras, 'chapters'> {
  try {
    const list = Array.isArray(slides) ? (slides as Array<Record<string, unknown>>) : []
    if (!list.length) return { takeaways: [], quickCheck: { ...EMPTY_EXTRAS.quickCheck }, nextTeaser: '' }
    const titleOf = (s: Record<string, unknown>) => String(s?.title || '')
    const find = (re: RegExp) => list.find(s => re.test(titleOf(s)))
    const spokenOf = (s: Record<string, unknown> | undefined): string =>
      (String(s?.spokenText || '').trim() || normalizeBullets(s?.content).join(' ')).slice(0, 500)
    const takeSlide = find(/takeaway/i) || find(/key points/i) || find(/recap/i)
    const takeaways = takeSlide ? normalizeBullets(takeSlide.content).slice(0, 3) : []
    return {
      takeaways,
      quickCheck: {
        recall: spokenOf(find(/recall|remember|quick.check|check.your|warm.up/i)),
        apply: spokenOf(find(/apply|exercise|practice|try.it|hands.on|your.turn/i)),
        stretch: spokenOf(find(/stretch|challenge|bonus|go.further|extension/i)),
      },
      nextTeaser: spokenOf(find(/what.s.next|coming.up|next.lesson|teaser|up.next/i)),
    }
  } catch {
    return { takeaways: [], quickCheck: { recall: '', apply: '', stretch: '' }, nextTeaser: '' }
  }
}

/** Derive neighbour context for lesson (sIdx, lIdx): course level, position,
 * module title, previous lesson (title + ~500-char excerpt, from the snapshot
 * or from `completed` in-run generations), and the next lesson's title. */
export function buildLessonContext(
  sections: any,
  sIdx: number,
  lIdx: number,
  course?: any,
  completed?: { title?: unknown; textContent?: unknown }[],
): LessonContext {
  try {
    const secs = Array.isArray(sections) ? sections : []
    const flat: { si: number; li: number; title: string; textContent: string; module: string }[] = []
    secs.forEach((s: any, si: number) => {
      const lessons = Array.isArray(s?.lessons) ? s.lessons : []
      lessons.forEach((l: any, li: number) => {
        flat.push({
          si, li,
          title: String(l?.title || ''),
          textContent: String(l?.textContent || ''),
          module: String(s?.title || ''),
        })
      })
    })
    if (!flat.length) return {}
    let idx = flat.findIndex(f => f.si === sIdx && f.li === lIdx)
    if (idx < 0) idx = 0
    const done = (Array.isArray(completed) ? completed : []).filter(c => String(c?.textContent || ''))
    let prevTitle = ''
    let prevText = ''
    const lastDone = done.length ? done[done.length - 1] : null
    if (lastDone && String(lastDone?.title || '')) {
      prevTitle = String(lastDone.title)
      prevText = String(lastDone.textContent || '')
    } else {
      for (let i = idx - 1; i >= 0; i--) {
        if (flat[i].textContent) {
          prevTitle = flat[i].title
          prevText = flat[i].textContent
          break
        }
      }
    }
    const next = flat[idx + 1]
    const ctx: LessonContext = {}
    const level = String((course as any)?.level || (course as any)?.difficulty || '')
    if (level) ctx.level = level
    ctx.lessonIndex = idx + 1
    ctx.lessonTotal = flat.length
    if (flat[idx].module) ctx.moduleTitle = flat[idx].module
    if (prevTitle) {
      ctx.prevTitle = prevTitle
      if (prevText) ctx.prevExcerpt = prevText.slice(0, 500)
    }
    if (next && next.title) ctx.nextTitle = next.title
    return ctx
  } catch {
    return {}
  }
}

export function normalizeBullets(content: unknown): string[] {
  if (Array.isArray(content)) return content.map(c => String(c || '').trim()).filter(Boolean)
  if (typeof content === 'string' && content.trim()) return [content.trim()]
  return []
}

function asSlideType(raw: unknown): SlideType {
  const t = String(raw || '').toLowerCase()
  if (t === 'code') return 'code'
  if (t === 'title') return 'title'
  if (t === 'diagram') return 'diagram'
  if (t === 'visual' || t === 'animation') return 'visual'
  return 'concept'
}

type VisualHint = { title?: unknown; content?: unknown; spokenText?: unknown; narration?: unknown }

function asVisual(
  raw: unknown,
  titleOrSlide: string | VisualHint,
  extraHaystack?: unknown,
): VideoSlide['visual'] | undefined {
  const v = String(raw || '').toLowerCase()
  if (v === 'array' || v === 'sort' || v === 'tree' || v === 'flow' || v === 'icons' || v === 'compare') return v
  // Guess ONLY from the slide's own text — never the course topic. Accepts the
  // legacy (raw, title) call shape or (raw, slideLike, extra) for full context.
  const slide = (typeof titleOrSlide === 'object' && titleOrSlide !== null) ? titleOrSlide as VisualHint : null
  const title = slide ? String(slide.title || '') : String(titleOrSlide || '')
  const extra = slide
    ? [slide.content, slide.spokenText, slide.narration].map(c => Array.isArray(c) ? c.join('\n') : String(c || '')).join('\n')
    : String(extraHaystack || '')
  const t = `${title}\n${extra}`.toLowerCase()
  if (/\btree\b|\btrees\b|\bbst\b|\bheap\b|nodes?|binary tree|travers|\bdfs\b|\bbfs\b/.test(t)) return 'tree'
  if (/\bsort(?:s|ed|ing)?\b|bubble|merge ?sort|quick ?sort|selection sort|insertion sort/.test(t)) return 'sort'
  if (/array|lists?|linked list|binary search|linear search|\bindex\b|indices|travers/.test(t)) return 'array'
  return undefined
}

/** Accepts `{ slides }` or the older `{ scenes }` shape. `minSlides` scales with
 * lesson duration (see minSlidesForMinutes); default 5 keeps legacy callers. */
export function slidesFromAiJson(raw: unknown, minSlides = 5): Omit<VideoSlide, 'durationInFrames'>[] {
  let obj = raw
  if (typeof obj === 'string') {
    const cleaned = obj.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    try {
      obj = JSON.parse(cleaned)
    } catch {
      obj = repairJson(cleaned) // trailing-comma/brace salvage before spending another LLM retry
    }
  }
  if (Array.isArray(obj)) obj = { slides: obj }
  const record = (obj && typeof obj === 'object') ? obj as Record<string, unknown> : {}
  if (record.error) {
    const err = record.error
    const msg = (err && typeof err === 'object' && 'message' in err) ? String((err as { message: unknown }).message) : String(err)
    throw new Error(`LLM provider error: ${msg}`)
  }
  const list = (record.slides || record.scenes) as unknown
  if (!Array.isArray(list)) throw new Error('AI video script missing slides/scenes array')

  const slides = list.map((item: any, i: number) => {
    const spokenText = String(item?.spokenText || item?.narration || '').trim()
    const title = String(item?.title || `Slide ${i + 1}`).trim()
    const content = normalizeBullets(item?.content)
    const type = asSlideType(item?.type || (i === 0 ? 'title' : item?.code ? 'code' : 'concept'))
    const mermaidRaw = item?.mermaid ? String(item.mermaid).trim() : ''
    return {
      id: String(item?.id || `slide-${i + 1}`),
      type,
      visual: (type === 'visual' || type === 'diagram') ? asVisual(item?.visual, title) : undefined,
      title,
      content: content.length ? content : [title],
      code: item?.code ? String(item.code) : undefined,
      codeLanguage: item?.codeLanguage || item?.language || undefined,
      mermaid: mermaidRaw && mermaidRaw.length <= 800 ? mermaidRaw : undefined,
      spokenText,
    }
  }).filter(s => s.spokenText)

  if (slides.length < minSlides) {
    throw new Error(`Need at least ${minSlides} slides with spokenText, got ${slides.length}`)
  }
  return slides
}

export function withDurations(slides: Omit<VideoSlide, 'durationInFrames'>[]): VideoSlide[] {
  return slides.map(s => ({ ...s, durationInFrames: durationFramesFromSpoken(s.spokenText) }))
}

const TEXT_SYSTEM = `You are an expert course instructor writing Unstop-style textbook lessons. Return clean Markdown only — no preamble.`

function contextBlock(ctx: LessonContext, techStack: string): string {
  const lines: string[] = []
  if (ctx.lessonIndex && ctx.lessonTotal) {
    lines.push(`This is lesson ${ctx.lessonIndex} of ${ctx.lessonTotal}${ctx.moduleTitle ? ` in module "${ctx.moduleTitle}"` : ''}${ctx.level ? ` (level: ${ctx.level})` : ''} of a ${techStack} course.`)
  }
  if (ctx.prevTitle) {
    lines.push(`Previously covered in "${ctx.prevTitle}": ${(ctx.prevExcerpt || '').slice(0, 500)} — REFERENCE it by name to bridge; do NOT re-teach it.`)
  }
  if (ctx.nextTitle) {
    lines.push(`Next lesson: "${ctx.nextTitle}" — close with a 1-2 sentence teaser naming it (no content spoilers).`)
  }
  if (!lines.length) return ''
  return `COURSE CONTEXT:\n${lines.join('\n')}\n`
}

const TEXT_PROMPT = (topic: string, techStack: string, minutes = 10, ctx: LessonContext = {}) => {
  const m = normalizeTargetMinutes(minutes)
  const words = wordsForMinutes(m)
  const software = SOFTWARE_FAMILIES.has(familyFor(techStack))
  const exampleRule = software
    ? '- At least one real-world example\n- A fenced code block if the topic involves code (working code, not pseudocode)'
    : '- At least one realistic workplace example from this field\n- Prefer checklists, workflows, or short case tables over code blocks unless the topic is truly technical tooling\n- Do NOT invent programming code for non-software topics'
  const bridgeLine = ctx.prevTitle
    ? `H2 "Where we are" — one short paragraph recalling "${ctx.prevTitle}" BY NAME and how this lesson builds on it. REFERENCE it; do NOT re-teach it.`
    : `H2 "Where we are" — one short paragraph bridging from what a ${ctx.level || 'beginner'}-level student already knows into this lesson.`
  return `Write a ~${words}-word textbook lesson (~${m} minutes of reading at ~150 words/min) on: "${topic}" (${techStack}).

${contextBlock(ctx, techStack)}Follow this exact 8-part anatomy (use these H2 headings):
1. Open with a hook paragraph: a concrete real-world payoff, readable in 45 seconds or less — no greetings, no "welcome to this lesson".
2. H2 "What you will learn" — 2-4 outcome bullets starting "By the end you will…".
3. ${bridgeLine}
4. Core, one H2 per stage — "Why it matters" → "What it is" → "How it works" → "Where it is used" — with edge cases. Teach every subtopic. Do not skip details. Do not assume prior knowledge of this lesson.
5. H2 "Worked examples" — graduated trivial → realistic → tricky, plus one counter-example: show the common wrong way first, then the fix.
6. H2 "Common misconceptions" — at least one "Most people think X — actually Y".
7. H2 "Key takeaways" — exactly 3 bullets.
8. H2 "Check yourself" — exactly three unanswered practice prompts: one recall question, one apply exercise, one stretch challenge (prompts ONLY — never answers or solutions; graded quizzes are a separate step). Then H2 "What's next" — a 1-2 sentence teaser for the next lesson by name.
${exampleRule}
- Do NOT embed quiz questions with answers, answer keys, or "Quiz N" blocks — quizzes are a separate interactive step after the module videos.`
}

const VIDEO_SYSTEM = `You are an expert video-lesson scriptwriter. Return ONLY valid JSON, no markdown.`

interface ActInfo {
  index: number
  total: number
  slides: number
  isLast: boolean
  actTitle: string
}

const VIDEO_PROMPT = (topic: string, techStack: string, textLesson: string, minutes = 10, ctx: LessonContext = {}, act?: ActInfo) => {
  const m = normalizeTargetMinutes(minutes)
  const software = SOFTWARE_FAMILIES.has(familyFor(techStack))
  const slideRules = software
    ? `- Include at least two "code" slides with a "code" field (working ${techStack} snippet) and "codeLanguage".
- Include one "visual" slide with "visual": "array" | "sort" | "tree" when the topic is data/algorithms.
- Include one "diagram" slide with "visual": "flow" | "icons" | "compare", 2–4 short "content" labels for on-screen boxes (e.g. Client → Server → Database), and a "mermaid" field containing valid Mermaid code (graph TD or sequenceDiagram only, max 800 chars, simple: 4-8 nodes, max 6 edges). Always pair with 'content' labels as fallback.`
    : `- Do NOT invent programming code for non-software topics.
- Prefer concept slides with workplace workflows, checklists, and scenarios.
- Include one "diagram" slide with "visual": "flow" | "icons" | "compare", 2–4 short "content" labels for on-screen boxes, and a "mermaid" field containing valid Mermaid code (graph TD or sequenceDiagram only, max 800 chars, simple: 4-8 nodes, max 6 edges). Always pair with 'content' labels as fallback.`
  const position = ctx.lessonIndex && ctx.lessonTotal
    ? `This is lesson ${ctx.lessonIndex} of ${ctx.lessonTotal}${ctx.moduleTitle ? ` in module "${ctx.moduleTitle}"` : ''}.`
    : ''
  const prevRule = ctx.prevTitle
    ? `The bridge slide must name the previous lesson ("${ctx.prevTitle}") in one line and build on it — NEVER re-teach it.`
    : `The bridge slide connects from course-level prerequisites (this is lesson 1 or no previous lesson is known).`
  const opener = !act
    ? `Turn this text lesson into a ~${m}-minute instructor video script. Cover the topic in full. Do not skip or summarize-away details.`
    : `You are writing ACT ${act.index} of ${act.total} ("${act.actTitle}") of a ~${m}-minute lesson on "${topic}". Teach ONLY the act text below — fully, no skimming — but keep continuity.`
  const countRule = !act
    ? `Write ${slidesForMinutes(m)} slides total (at least ${minSlidesForMinutes(m)}).`
    : `Write ${act.slides} slides total (at least ${actMinSlides(act.slides)}).`
  const openRules = !act || act.index === 1
    ? `- First slide type MUST be "title": hook headline + payoff subtitle — no greetings, no "welcome".
- Second slide: on-screen outcomes ("By the end you will…" bullets, same points the narrator speaks).
- Third slide: bridge — ${prevRule}`
    : `- First slide: one spoken line recapping where the lesson stands so far, then into this act's content.`
  const closeRules = !act || act.isLast
    ? `- The takeaways slide MUST be titled exactly "Key takeaways" with exactly 3 short content bullets.
- Then exactly three check slides, prompts ONLY, never answers or solutions: titled "Quick check — recall" (one recall question), "Apply it" (one hands-on exercise), "Stretch challenge" (one hard extension).
- Final slide titled "What's next": spoken teaser naming the next lesson${ctx.nextTitle ? ` ("${ctx.nextTitle}")` : ''} in 1-2 sentences, no spoilers.`
    : `- Close the act with one mini-recap slide titled "Act recap" (2-3 bullets). Do NOT write takeaways, check, or whats-next slides — those belong to the final act.`
  return `${opener}
${position}

Output JSON ONLY:
{
  "slides": [
    {
      "id": "slide-1",
      "type": "title",
      "title": "Short on-screen headline",
      "content": ["One-line subtitle"],
      "spokenText": "140-180 words the narrator speaks while this slide is on screen. Conversational, like a patient teacher. Teach, do not tease."
    }
  ]
}

Rules:
${countRule}
${openRules}
- Core slides: WHY → WHAT → HOW → WHERE, then edge cases and graduated examples (trivial → realistic → tricky) plus one wrong-way/counter-example slide (show the mistake, then the fix).
- One "Myth vs reality" misconceptions slide ("Most people think X — actually Y").
${closeRules}
${slideRules}
- Each spokenText MUST be 140-180 words (this is what makes the video hit its target length).
- On-screen "content" is 3-5 short bullets that summarize THE SAME points the narrator is speaking — never put unrelated bullets while spokenText teaches something else.
- spokenText must teach the slide title + those bullets (same topic); do not digress to a different concept mid-slide.
- Do not say "we will skip" or "as you already know".
- Do NOT include quiz questions with answers, answer keys, "Quiz 1", or knowledge-check-with-answers slides — quizzes are a separate interactive step after the module.
- No markdown fences around the JSON.

TEXT LESSON${act ? ` (ACT ${act.index} TEXT)` : ''}:
"""
${textLesson.slice(0, 16000)}
"""

Topic: ${topic}`
}

function extractText(res: { ok?: boolean; text?: string; json?: unknown; raw?: string }): string {
  if (typeof res.text === 'string' && res.text.trim()) return res.text.trim()
  if (typeof res.raw === 'string' && res.raw.trim()) return res.raw.trim()
  if (typeof res.json === 'string' && res.json.trim()) return res.json.trim()
  if (res.json != null) return typeof res.json === 'object' ? JSON.stringify(res.json) : String(res.json)
  return ''
}

function isDeadProviderOutput(res: { ok?: boolean; json?: unknown; text?: string; raw?: string }): string | null {
  const blob = extractText(res)
  if (!res.ok) return (res.text || blob || 'request failed').slice(0, 180)
  if (/insufficient credits|API Error \(\d+\)/i.test(blob)) return blob.slice(0, 180)
  if (res.json && typeof res.json === 'object' && res.json !== null && 'error' in res.json && !('slides' in res.json) && !('scenes' in res.json)) {
    return JSON.stringify(res.json).slice(0, 180)
  }
  return null
}

const PROVIDER_SECRET: Record<string, string> = {
  nvidia: 'nvidia_api_key',
  groq: 'groq_api_key',
  gemini: 'gemini_api_key',
  cerebras: 'cerebras_api_key',
  mistral: 'mistral_api_key',
  openai: 'openai_api_key',
  opencode: 'opencode_api_key',
  openrouter: 'openrouter_api_key',
  deepseek: 'deepseek_api_key',
  anthropic: 'anthropic_api_key',
}

const NVIDIA_ENDPOINT = 'https://integrate.api.nvidia.com/v1'

/** Own keys from SuperAdmin. Free megamodels first, paid backstops last.
 *  ponytail: model IDs verified 2026-09-21 against prod failures
 *  (groq llama-3.1-8b-instant 404, gemini-2.0-flash 404, Zen
 *  deepseek-v4-flash-free upstream-unavailable) + Google Zen catalogs.
 *  Keep in sync with PROVIDER_FALLBACK_CHAIN in lib/ai/provider-fallback.ts
 *  (the shared layer tries an explicit override first, then that chain). */
export const PROVIDER_MODELS: { provider: string; model: string; endpoint?: string }[] = [
  { provider: 'nvidia', model: 'nvidia/llama-3.1-nemotron-70b-instruct', endpoint: NVIDIA_ENDPOINT },
  { provider: 'nvidia', model: 'deepseek-ai/deepseek-v4-flash-0731', endpoint: NVIDIA_ENDPOINT },
  { provider: 'groq', model: 'openai/gpt-oss-120b', endpoint: 'https://api.groq.com/openai/v1' },
  { provider: 'groq', model: 'openai/gpt-oss-20b', endpoint: 'https://api.groq.com/openai/v1' },
  { provider: 'groq', model: 'llama-3.3-70b-versatile', endpoint: 'https://api.groq.com/openai/v1' },
  { provider: 'gemini', model: 'gemini-3-flash-preview' },
  { provider: 'cerebras', model: 'gpt-oss-120b', endpoint: 'https://api.cerebras.ai/v1' },
  { provider: 'mistral', model: 'mistral-small-latest', endpoint: 'https://api.mistral.ai/v1' },
  { provider: 'openai', model: 'gpt-4o-mini' },
  { provider: 'opencode', model: 'mimo-v2.5-free' },
  { provider: 'opencode', model: 'minimax-m3-free' },
  // ponytail: openrouter/auto never 404s — the router picks a live free
  // model. Pinned :free IDs rot constantly (gemini-2.0-flash 404 2026-09-21).
  { provider: 'openrouter', model: 'openrouter/auto' },
  { provider: 'deepseek', model: 'deepseek-chat', endpoint: 'https://api.deepseek.com/v1' },
  { provider: 'anthropic', model: 'claude-3-5-haiku-20241022' },
]

let rr = 0

// ponytail: free-tier provider keys are SHARED across every lesson of a job.
// A 429 on any lesson means the keys are hot for all of them, so a lesson
// that hits a rate limit parks a global cooldown that every subsequent
// lesson waits out — otherwise each of the 72 lessons burns its own 60s
// wait and hammers on, and the whole job fails in lockstep.
let globalCooldownUntil = 0

function noteGlobalRateLimit(waitMs: number) {
  globalCooldownUntil = Math.max(globalCooldownUntil, Date.now() + waitMs)
}

async function waitForGlobalCooldown() {
  const ms = globalCooldownUntil - Date.now()
  if (ms > 0) {
    console.log('[course-worker] global rate-limit cooldown, waiting', Math.ceil(ms / 1000), 's')
    await new Promise((r) => setTimeout(r, ms))
  }
}

/** Fail over across configured keys. Uses unified getApiKey() with round-robin. */
async function completeWithFallback(args: Parameters<typeof backendComplete>[0]) {
  const primary = await platformModelOverrides()
  const nvidia = PROVIDER_MODELS.filter(p => p.provider === 'nvidia')
  // ponytail: the shared fallback layer tries this explicit override first,
  // then its own chain — so each entry here gets exactly one targeted shot
  // (plus round-robin key rotation) instead of a full chain re-walk.
  const rest = [
    ...PROVIDER_MODELS.filter(p => p.provider !== 'nvidia'),
  ]
  const start = rest.length ? (rr++ % rest.length) : 0
  const chain = [...nvidia, ...rest.slice(start), ...rest.slice(0, start)]
  const seen = new Set<string>()
  let last = 'No LLM provider with a key is configured'
  let waitedRateLimit = false

  // Import the unified getApiKey utility
  const { getApiKey } = await import('@/lib/ai/get-api-key')

  // Honor a cooldown parked by an earlier lesson's 429 before trying at all.
  await waitForGlobalCooldown()

  for (const p of chain) {
    if (!p.provider || !p.model) continue
    const id = `${p.provider}:${p.model}`
    if (seen.has(id)) continue
    seen.add(id)

    // Get API key using unified utility (supports round-robin)
    const fromPrimary = p.provider === primary.providerOverride ? primary.apiKeyOverride : ''
    let apiKey = fromPrimary
    if (!apiKey) {
      const keyResult = await getApiKey(p.provider as any)
      apiKey = keyResult?.key || ''
    }
    if (!apiKey) continue

    console.log('[course-worker] trying', p.provider, p.model)
    try {
      const res = await backendComplete({
        ...args,
        providerOverride: p.provider,
        modelOverride: p.model,
        endpointOverride: p.endpoint,
        apiKeyOverride: apiKey,
      })
      const dead = isDeadProviderOutput(res)
      if (dead) {
        last = `${id}: ${dead}`
        const waitSec = Number((dead.match(/Try again in (\d+)s/i) || [])[1] || 0)
        // ponytail: one wait then retry same provider; spraying every key in 1s burns the shared 60/min
        if (waitSec && !waitedRateLimit) {
          waitedRateLimit = true
          noteGlobalRateLimit((waitSec + 2) * 1000)
          console.log('[course-worker] rate limited, waiting', waitSec, 's then retry', id)
          await new Promise(r => setTimeout(r, (waitSec + 2) * 1000))
          seen.delete(id)
        } else if (waitSec) {
          // Already waited once this lesson — still park the cooldown so the
          // NEXT lessons back off instead of burning their own waits.
          noteGlobalRateLimit((waitSec + 2) * 1000)
        }
        continue
      }
      return res
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      last = `${id}: ${msg}`
      // ponytail: 429s now propagate as thrown errors (backend no longer
      // masks them as 500s) — park the global cooldown for those too.
      const m = msg.match(/Try again in (\d+)s|rate limit[^a-z]|429/i)
      if (m) noteGlobalRateLimit(((Number(m[1]) || 60) + 2) * 1000)
    }
  }
  throw new Error(`All LLM providers failed. Last: ${last}`)
}

export async function generateLessonVideo(opts: {
  topic: string
  techStack?: string
  targetMinutes?: number
  context?: LessonContext
}): Promise<GeneratedLessonVideo> {
  const topic = (opts.topic || '').trim()
  if (!topic) throw new Error('Topic is required')
  const minutes = normalizeTargetMinutes(opts.targetMinutes ?? 10)
  const ctx = opts.context ?? {}
  const techStack = opts.techStack || 'programming'
  const minTotal = minSlidesForMinutes(minutes)

  const textRes = await completeWithFallback({
    systemMessage: TEXT_SYSTEM,
    userMessage: TEXT_PROMPT(topic, techStack, minutes, ctx),
    responseFormat: 'text',
    modelRole: 'fast',
    feature: 'course-video-text',
  })
  const textContent = extractText(textRes)
  if (textContent.length < 400) throw new Error('AI text lesson was too short — refusing to build a stub video')

  const parseSlides = (payload: unknown, min: number): VideoSlide[] =>
    withDurations(slidesFromAiJson(payload, min))

  const runScriptCall = (userMessage: string) => completeWithFallback({
    systemMessage: VIDEO_SYSTEM,
    userMessage,
    responseFormat: 'json',
    modelRole: 'fast',
    feature: 'course-video-script',
  })

  let slides: VideoSlide[]
  let chapters: LessonChapter[]
  if (minutes <= 15) {
    const runScript = async () => runScriptCall(VIDEO_PROMPT(topic, techStack, textContent, minutes, ctx))
    let videoRes = await runScript()

    try {
      slides = parseSlides(videoRes.json ?? videoRes.raw ?? videoRes.text, minTotal)
    } catch {
      videoRes = await runScript()
      slides = parseSlides(videoRes.json ?? videoRes.raw ?? videoRes.text, minTotal)
    }
    chapters = chaptersFromScript(slides)
  } else {
    // Long-form: one VIDEO_PROMPT call per act (each a mini-arc), then concatenate.
    const acts = splitIntoActs(textContent, actsForMinutes(minutes))
    const target = slidesForMinutes(minutes)
    const per = Math.floor(target / acts.length)
    let rem = target - per * acts.length
    slides = []
    const bounds: { title: string; startIndex: number }[] = []
    for (let i = 0; i < acts.length; i++) {
      const budget = per + (rem > 0 ? 1 : 0)
      if (rem > 0) rem--
      const info: ActInfo = { index: i + 1, total: acts.length, slides: budget, isLast: i === acts.length - 1, actTitle: acts[i].title }
      const floor = actMinSlides(budget)
      const runAct = async () => runScriptCall(VIDEO_PROMPT(topic, techStack, acts[i].text, minutes, ctx, info))
      let actRes = await runAct()
      let actSlides: VideoSlide[]
      try {
        actSlides = parseSlides(actRes.json ?? actRes.raw ?? actRes.text, floor)
      } catch {
        actRes = await runAct()
        actSlides = parseSlides(actRes.json ?? actRes.raw ?? actRes.text, floor)
      }
      bounds.push({ title: acts[i].title, startIndex: slides.length })
      slides.push(...actSlides)
    }
    if (slides.length < minTotal) {
      throw new Error(`Need at least ${minTotal} slides for a ${minutes}-min lesson, got ${slides.length}`)
    }
    slides = slides.map((s, i) => ({ ...s, id: `slide-${i + 1}` }))
    chapters = chaptersFromScript(slides, bounds)
  }

  const extras = extractLessonExtras(slides)
  const fullSpoken = slides.map(s => s.spokenText).join(' ')
  const audioBuffer = await synthesizeTts(fullSpoken)
  // Word-count frame estimates drift from real Google TTS length — align visuals to the MP3.
  const measured = await measureAudioDurationSeconds(audioBuffer)
  const audioSeconds = measured > 0 ? measured : estimateSpokenSeconds(fullSpoken)
  slides = alignSlideDurationsToAudio(slides, audioSeconds, 30)
  const durationSeconds = slides.reduce((n, s) => n + s.durationInFrames, 0) / 30

  return {
    textContent,
    script: slides,
    audioBuffer,
    durationSeconds: Math.max(60, Math.round(durationSeconds || audioSeconds)),
    takeaways: extras.takeaways,
    quickCheck: extras.quickCheck,
    nextTeaser: extras.nextTeaser,
    chapters,
  }
}
