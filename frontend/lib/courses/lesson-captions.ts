import { getMongoDb } from '@/lib/mongodb'

const COLLECTION = 'course_lesson_captions'
const FPS = 30

export function lessonCaptionsPath(courseId: string, lessonId: string): string {
  return `/api/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}/captions`
}

export function vttTimestamp(seconds: number): string {
  const s = Math.max(0, seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const whole = Math.floor(sec)
  const ms = Math.round((sec - whole) * 1000)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(whole).padStart(2, '0')}.${String(ms).padStart(3, '0')}`
}

/** ponytail: captions from the TTS script, not Whisper. Upgrade to ASR if we need off-script audio. */
export function vttFromSlides(slides: Array<{ spokenText?: string; durationInFrames?: number }>, fps = FPS): string {
  let t = 0
  const cues = ['WEBVTT', '']
  slides.forEach((slide, i) => {
    const text = (slide.spokenText || '').trim()
    const dur = (slide.durationInFrames || 0) / fps
    if (!text || dur <= 0) {
      t += Math.max(0, dur)
      return
    }
    const start = t
    const end = t + dur
    cues.push(String(i + 1), `${vttTimestamp(start)} --> ${vttTimestamp(end)}`, text, '')
    t = end
  })
  return cues.join('\n')
}

export async function saveLessonCaptions(courseId: string, lessonId: string, vtt: string): Promise<void> {
  const db = await getMongoDb()
  await db.collection(COLLECTION).updateOne(
    { courseId, lessonId },
    { $set: { courseId, lessonId, mime: 'text/vtt', vtt, updatedAt: new Date().toISOString() } },
    { upsert: true },
  )
}

export async function loadLessonCaptions(courseId: string, lessonId: string): Promise<string | null> {
  const db = await getMongoDb()
  const doc = await db.collection(COLLECTION).findOne({ courseId, lessonId })
  const vtt = typeof doc?.vtt === 'string' ? doc.vtt.trim() : ''
  return vtt || null
}

export async function deleteCourseCaptions(courseId: string): Promise<void> {
  const db = await getMongoDb()
  await db.collection(COLLECTION).deleteMany({ courseId })
}
