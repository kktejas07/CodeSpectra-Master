import { getMongoDb } from '@/lib/mongodb'
import { lessonVideoKey, readS3Config, s3DeleteObject, s3PutObject, s3SignedGetUrl } from '@/lib/s3-storage'

const COLLECTION = 'course_lesson_video'
const MONGO_MAX = 15_000_000

export function lessonVideoPath(courseId: string, lessonId: string): string {
  return `/api/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}/video`
}

export async function saveLessonMp4(courseId: string, lessonId: string, video: Buffer): Promise<'object' | 'mongo'> {
  const db = await getMongoDb()
  const cfg = await readS3Config()
  const objectKey = lessonVideoKey(courseId, lessonId)
  let stored: 'object' | 'mongo' = 'mongo'

  if (cfg) {
    await s3PutObject(objectKey, video, 'video/mp4')
    stored = 'object'
  } else if (video.length > MONGO_MAX) {
    throw new Error('Configure object storage (Settings → Cloudflare) — MP4 is too large for Mongo')
  }

  await db.collection(COLLECTION).updateOne(
    { courseId, lessonId },
    {
      $set: {
        courseId,
        lessonId,
        mime: 'video/mp4',
        bytes: video.length,
        updatedAt: new Date().toISOString(),
        ...(stored === 'object'
          ? { objectKey, data: null }
          : { data: video, objectKey: null }),
      },
    },
    { upsert: true },
  )
  return stored
}

export async function lessonVideoPlayback(
  courseId: string,
  lessonId: string,
): Promise<{ kind: 'redirect'; url: string } | { kind: 'buffer'; mime: string; data: Buffer } | null> {
  const db = await getMongoDb()
  const doc = await db.collection(COLLECTION).findOne({ courseId, lessonId })
  if (!doc) return null
  const objectKey = typeof doc.objectKey === 'string' ? doc.objectKey : ''
  if (objectKey && await readS3Config()) {
    return { kind: 'redirect', url: await s3SignedGetUrl(objectKey) }
  }
  const raw = doc.data
  if (!raw) return null
  const data = Buffer.isBuffer(raw)
    ? raw
    : Buffer.from((raw as { buffer?: ArrayBuffer }).buffer ?? raw)
  return { mime: 'video/mp4', data, kind: 'buffer' }
}

export async function deleteCourseVideos(courseId: string): Promise<void> {
  const db = await getMongoDb()
  const docs = await db.collection(COLLECTION).find({ courseId }).toArray()
  for (const doc of docs) {
    if (typeof doc.objectKey === 'string' && doc.objectKey) {
      try { await s3DeleteObject(doc.objectKey) } catch { /* still drop the mongo row */ }
    }
  }
  await db.collection(COLLECTION).deleteMany({ courseId })
}
