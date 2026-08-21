import { getMongoDb } from '@/lib/mongodb'
import { lessonObjectKey, readS3Config, s3DeleteObject, s3PutObject, s3SignedGetUrl } from '@/lib/s3-storage'

const COLLECTION = 'course_lesson_audio'

export function lessonAudioPath(courseId: string, lessonId: string): string {
  return `/api/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}/audio`
}

export async function saveLessonAudio(courseId: string, lessonId: string, audio: Buffer): Promise<'object' | 'mongo'> {
  const db = await getMongoDb()
  const cfg = await readS3Config()
  const objectKey = lessonObjectKey(courseId, lessonId)
  let stored: 'object' | 'mongo' = 'mongo'

  if (cfg) {
    try {
      await s3PutObject(objectKey, audio, 'audio/mpeg')
      stored = 'object'
    } catch (e) {
      console.error('[course-audio] object storage upload failed, storing in Mongo:', e)
    }
  }

  await db.collection(COLLECTION).updateOne(
    { courseId, lessonId },
    {
      $set: {
        courseId,
        lessonId,
        mime: 'audio/mpeg',
        bytes: audio.length,
        updatedAt: new Date().toISOString(),
        ...(stored === 'object'
          ? { objectKey, r2Key: objectKey, data: null }
          : { data: audio, objectKey: null, r2Key: null }),
      },
    },
    { upsert: true },
  )
  return stored
}

export async function loadLessonAudio(courseId: string, lessonId: string): Promise<{ mime: string; data: Buffer } | null> {
  const db = await getMongoDb()
  const doc = await db.collection(COLLECTION).findOne({ courseId, lessonId })
  if (!doc) return null
  const raw = doc.data
  if (raw) {
    const data = Buffer.isBuffer(raw)
      ? raw
      : Buffer.from((raw as { buffer?: ArrayBuffer }).buffer ?? raw)
    return { mime: String(doc.mime || 'audio/mpeg'), data }
  }
  const objectKey = (typeof doc.objectKey === 'string' && doc.objectKey) || (typeof doc.r2Key === 'string' ? doc.r2Key : '')
  if (objectKey && await readS3Config()) {
    const { s3GetObject } = await import('@/lib/s3-storage')
    return { mime: String(doc.mime || 'audio/mpeg'), data: await s3GetObject(objectKey) }
  }
  return null
}

export async function lessonAudioPlayback(
  courseId: string,
  lessonId: string,
): Promise<{ kind: 'redirect'; url: string } | { kind: 'buffer'; mime: string; data: Buffer } | null> {
  const db = await getMongoDb()
  const doc = await db.collection(COLLECTION).findOne({ courseId, lessonId })
  if (!doc) return null
  const objectKey = (typeof doc.objectKey === 'string' && doc.objectKey) || (typeof doc.r2Key === 'string' ? doc.r2Key : '')
  if (objectKey && await readS3Config()) {
    return { kind: 'redirect', url: await s3SignedGetUrl(objectKey) }
  }
  const raw = doc.data
  if (!raw) return null
  const data = Buffer.isBuffer(raw)
    ? raw
    : Buffer.from((raw as { buffer?: ArrayBuffer }).buffer ?? raw)
  return { mime: String(doc.mime || 'audio/mpeg'), data, kind: 'buffer' }
}

export async function deleteCourseAudio(courseId: string): Promise<void> {
  const db = await getMongoDb()
  const docs = await db.collection(COLLECTION).find({ courseId }).toArray()
  for (const doc of docs) {
    const key = (typeof doc.objectKey === 'string' && doc.objectKey) || (typeof doc.r2Key === 'string' ? doc.r2Key : '')
    if (key) {
      try { await s3DeleteObject(key) } catch { /* still drop the mongo row */ }
    }
  }
  await db.collection(COLLECTION).deleteMany({ courseId })
}
