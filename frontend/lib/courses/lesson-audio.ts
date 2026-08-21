import { getMongoDb } from '@/lib/mongodb'

const COLLECTION = 'course_lesson_audio'

export function lessonAudioPath(courseId: string, lessonId: string): string {
  return `/api/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}/audio`
}

export async function saveLessonAudio(courseId: string, lessonId: string, audio: Buffer): Promise<void> {
  const db = await getMongoDb()
  await db.collection(COLLECTION).updateOne(
    { courseId, lessonId },
    {
      $set: {
        courseId,
        lessonId,
        mime: 'audio/mpeg',
        data: audio,
        bytes: audio.length,
        updatedAt: new Date().toISOString(),
      },
    },
    { upsert: true },
  )
}

export async function loadLessonAudio(courseId: string, lessonId: string): Promise<{ mime: string; data: Buffer } | null> {
  const db = await getMongoDb()
  const doc = await db.collection(COLLECTION).findOne({ courseId, lessonId })
  if (!doc?.data) return null
  const raw = doc.data
  const data = Buffer.isBuffer(raw)
    ? raw
    : Buffer.from((raw as { buffer?: ArrayBuffer }).buffer ?? raw)
  return { mime: String(doc.mime || 'audio/mpeg'), data }
}
