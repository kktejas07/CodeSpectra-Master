import { backendComplete } from '@/lib/ai/backend'
import { platformModelOverrides } from '@/lib/ai/platform-model-overrides'
import { readServerSecrets } from '@/lib/server-secrets-cache'
import { durationFramesFromSpoken, synthesizeTts } from '@/lib/courses/tts'

export type SlideType = 'title' | 'concept' | 'code'

export interface VideoSlide {
  id: string
  type: SlideType
  title: string
  content: string[]
  code?: string
  codeLanguage?: string
  spokenText: string
  durationInFrames: number
}

export interface GeneratedLessonVideo {
  textContent: string
  script: VideoSlide[]
  audioBuffer: Buffer
  durationSeconds: number
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
  return 'concept'
}

/** Accepts `{ slides }` or the older `{ scenes }` shape. */
export function slidesFromAiJson(raw: unknown): Omit<VideoSlide, 'durationInFrames'>[] {
  let obj = raw
  if (typeof obj === 'string') {
    const cleaned = obj.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    obj = JSON.parse(cleaned)
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
    return {
      id: String(item?.id || `slide-${i + 1}`),
      type: asSlideType(item?.type || (i === 0 ? 'title' : item?.code ? 'code' : 'concept')),
      title,
      content: content.length ? content : [title],
      code: item?.code ? String(item.code) : undefined,
      codeLanguage: item?.codeLanguage || item?.language || undefined,
      spokenText,
    }
  }).filter(s => s.spokenText)

  if (slides.length < 5) {
    throw new Error(`Need at least 5 slides with spokenText, got ${slides.length}`)
  }
  return slides
}

export function withDurations(slides: Omit<VideoSlide, 'durationInFrames'>[]): VideoSlide[] {
  return slides.map(s => ({ ...s, durationInFrames: durationFramesFromSpoken(s.spokenText) }))
}

const TEXT_SYSTEM = `You are an expert course instructor writing Unstop-style textbook lessons. Return clean Markdown only — no preamble.`

const TEXT_PROMPT = (topic: string, techStack: string) => `Write a comprehensive, detailed lesson on: "${topic}" (${techStack}).

Match this structure (use these heading styles):
- H1: lesson title
- Intro paragraph (what the student will learn by the end)
- H2 sections covering WHY → WHAT → HOW → WHERE
- Bullet lists for features/responsibilities
- At least one real-world example
- A fenced code block if the topic involves code (working code, not pseudocode)
- Two short quizzes: "Quiz 1" and "Quiz 2", each with Question / Correct Answer / Explanation
- Final Thoughts + Conclusion

The lesson should take a student 4–6 minutes to read. Be specific and educational, not generic.`

const VIDEO_SYSTEM = `You are an expert video-lesson scriptwriter. Return ONLY valid JSON, no markdown.`

const VIDEO_PROMPT = (topic: string, techStack: string, textLesson: string) => `Turn this text lesson into a 3–5 minute instructor video script.

Output JSON ONLY:
{
  "slides": [
    {
      "id": "slide-1",
      "type": "title",
      "title": "Short on-screen headline",
      "content": ["One-line subtitle"],
      "spokenText": "80-120 words the narrator speaks while this slide is on screen. Conversational, like a patient teacher."
    }
  ]
}

Rules:
- First slide type MUST be "title" (welcome + what we'll cover).
- 8 to 10 slides total. Types: "title" | "concept" | "code".
- Include at least one "code" slide with a "code" field (working ${techStack} snippet) and "codeLanguage".
- Each spokenText MUST be 80-120 words (this is what makes the video ~3 minutes, not 13 seconds).
- On-screen "content" is 3-5 short bullets, not the full narration.
- Cover the same WHY → WHAT → HOW → WHERE arc as the text lesson.
- No markdown fences around the JSON.

TEXT LESSON:
"""
${textLesson.slice(0, 12000)}
"""

Topic: ${topic}`

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
  openai: 'openai_api_key',
  opencode: 'opencode_api_key',
  openrouter: 'openrouter_api_key',
}

const NVIDIA_ENDPOINT = 'https://integrate.api.nvidia.com/v1'

/** Own keys from SuperAdmin. NVIDIA first (user request), then the rest. */
const PROVIDER_MODELS: { provider: string; model: string; endpoint?: string }[] = [
  { provider: 'nvidia', model: 'meta/llama-3.1-70b-instruct', endpoint: NVIDIA_ENDPOINT },
  { provider: 'nvidia', model: 'meta/llama-3.1-8b-instruct', endpoint: NVIDIA_ENDPOINT },
  { provider: 'groq', model: 'llama-3.1-8b-instant', endpoint: 'https://api.groq.com/openai/v1' },
  { provider: 'gemini', model: 'gemini-2.0-flash' },
  { provider: 'openai', model: 'gpt-4o-mini' },
  { provider: 'opencode', model: 'deepseek-v4-flash-free' },
  { provider: 'openrouter', model: 'google/gemini-2.0-flash-lite-001:free' },
]

let rr = 0

/** Fail over across configured keys. No proxy / limit-bypass. */
async function completeWithFallback(args: Parameters<typeof backendComplete>[0]) {
  const primary = await platformModelOverrides()
  const secrets = await readServerSecrets() as Record<string, unknown>
  const nvidia = PROVIDER_MODELS.filter(p => p.provider === 'nvidia')
  const rest = [
    ...(primary.providerOverride && primary.modelOverride && primary.providerOverride !== 'openrouter' && primary.providerOverride !== 'nvidia'
      ? [{ provider: primary.providerOverride, model: primary.modelOverride, endpoint: primary.endpointOverride }]
      : []),
    ...PROVIDER_MODELS.filter(p => p.provider !== 'nvidia'),
  ]
  const start = rest.length ? (rr++ % rest.length) : 0
  const chain = [...nvidia, ...rest.slice(start), ...rest.slice(0, start)]
  const seen = new Set<string>()
  let last = 'No LLM provider with a key is configured'
  for (const p of chain) {
    if (!p.provider || !p.model) continue
    const id = `${p.provider}:${p.model}`
    if (seen.has(id)) continue
    seen.add(id)
    const secretField = PROVIDER_SECRET[p.provider]
    const fromPrimary = p.provider === primary.providerOverride ? primary.apiKeyOverride : ''
    const apiKey = fromPrimary || (secretField && typeof secrets[secretField] === 'string' ? String(secrets[secretField]).trim() : '')
    if (!apiKey) continue
    console.log('[course-worker] trying', p.provider, p.model)
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
      continue
    }
    return res
  }
  throw new Error(`All LLM providers failed. Last: ${last}`)
}

export async function generateLessonVideo(opts: {
  topic: string
  techStack?: string
}): Promise<GeneratedLessonVideo> {
  const topic = (opts.topic || '').trim()
  if (!topic) throw new Error('Topic is required')
  const techStack = opts.techStack || 'programming'

  const textRes = await completeWithFallback({
    systemMessage: TEXT_SYSTEM,
    userMessage: TEXT_PROMPT(topic, techStack),
    responseFormat: 'text',
    modelRole: 'fast',
    feature: 'course-video-text',
  })
  const textContent = extractText(textRes)
  if (textContent.length < 400) throw new Error('AI text lesson was too short — refusing to build a stub video')

  const runScript = async () => completeWithFallback({
    systemMessage: VIDEO_SYSTEM,
    userMessage: VIDEO_PROMPT(topic, techStack, textContent),
    responseFormat: 'json',
    modelRole: 'fast',
    feature: 'course-video-script',
  })

  let videoRes = await runScript()

  let slides: VideoSlide[]
  try {
    slides = withDurations(slidesFromAiJson(videoRes.json ?? videoRes.raw ?? videoRes.text))
  } catch {
    videoRes = await runScript()
    slides = withDurations(slidesFromAiJson(videoRes.json ?? videoRes.raw ?? videoRes.text))
  }

  const fullSpoken = slides.map(s => s.spokenText).join(' ')
  const audioBuffer = await synthesizeTts(fullSpoken)
  const durationSeconds = slides.reduce((n, s) => n + s.durationInFrames, 0) / 30

  return {
    textContent,
    script: slides,
    audioBuffer,
    durationSeconds: Math.max(60, Math.round(durationSeconds)),
  }
}
