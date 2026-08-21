import { backendComplete } from '@/lib/ai/backend'
import { platformModelOverrides } from '@/lib/ai/platform-model-overrides'
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

function extractText(res: { ok?: boolean; text?: string; json?: unknown }): string {
  if (typeof res.text === 'string' && res.text.trim()) return res.text.trim()
  if (typeof res.json === 'string' && res.json.trim()) return res.json.trim()
  if (res.json != null) return typeof res.json === 'object' ? JSON.stringify(res.json) : String(res.json)
  return ''
}

export async function generateLessonVideo(opts: {
  topic: string
  techStack?: string
}): Promise<GeneratedLessonVideo> {
  const topic = (opts.topic || '').trim()
  if (!topic) throw new Error('Topic is required')
  const techStack = opts.techStack || 'programming'
  const overrides = await platformModelOverrides()

  const textRes = await backendComplete({
    systemMessage: TEXT_SYSTEM,
    userMessage: TEXT_PROMPT(topic, techStack),
    responseFormat: 'text',
    modelRole: 'fast',
    feature: 'course-video-text',
    ...overrides,
  })
  if (!textRes.ok) throw new Error(textRes.text || 'AI text lesson failed — check LLM keys in Settings')
  const textContent = extractText(textRes)
  if (textContent.length < 400) throw new Error('AI text lesson was too short — refusing to build a stub video')

  const runScript = async () => backendComplete({
    systemMessage: VIDEO_SYSTEM,
    userMessage: VIDEO_PROMPT(topic, techStack, textContent),
    responseFormat: 'json',
    modelRole: 'fast',
    feature: 'course-video-script',
    ...overrides,
  })

  let videoRes = await runScript()
  if (!videoRes.ok) throw new Error(videoRes.text || 'AI video script failed — check LLM keys in Settings')

  let slides: VideoSlide[]
  try {
    slides = withDurations(slidesFromAiJson(videoRes.json ?? videoRes.text))
  } catch (e) {
    videoRes = await runScript()
    if (!videoRes.ok) throw new Error(videoRes.text || 'AI video script retry failed')
    slides = withDurations(slidesFromAiJson(videoRes.json ?? videoRes.text))
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
