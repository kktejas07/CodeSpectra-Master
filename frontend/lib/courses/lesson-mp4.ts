import { getMongoDb } from '@/lib/mongodb'
import { lessonVideoKey, readS3Config, s3DeleteObject, s3GetObject, s3PutObject } from '@/lib/s3-storage'

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

/**
 * Always return bytes through our API (same-origin).
 * ponytail: avoid 302 → R2 signed URL — Vidstack HEAD/fetch hits CORS/403 on private R2.
 * Ceiling: full object buffered in Node (~15–40MB/lesson). Upgrade: ranged S3 proxy.
 */
export async function lessonVideoPlayback(
  courseId: string,
  lessonId: string,
): Promise<{ kind: 'buffer'; mime: string; data: Buffer; bytes: number } | null> {
  const db = await getMongoDb()
  const doc = await db.collection(COLLECTION).findOne({ courseId, lessonId })
  if (!doc) return null
  const objectKey = typeof doc.objectKey === 'string' ? doc.objectKey : ''
  if (objectKey && await readS3Config()) {
    const data = await s3GetObject(objectKey)
    return { kind: 'buffer', mime: 'video/mp4', data, bytes: data.length }
  }
  const raw = doc.data
  if (!raw) return null
  const data = Buffer.isBuffer(raw)
    ? raw
    : Buffer.from((raw as { buffer?: ArrayBuffer }).buffer ?? raw)
  return { mime: 'video/mp4', data, kind: 'buffer', bytes: data.length }
}

export async function lessonVideoMeta(
  courseId: string,
  lessonId: string,
): Promise<{ mime: string; bytes: number } | null> {
  const db = await getMongoDb()
  const doc = await db.collection(COLLECTION).findOne(
    { courseId, lessonId },
    { projection: { mime: 1, bytes: 1, objectKey: 1, data: 1 } },
  )
  if (!doc) return null
  const bytes = typeof doc.bytes === 'number'
    ? doc.bytes
    : Buffer.isBuffer(doc.data)
      ? doc.data.length
      : 0
  if (!bytes && !doc.objectKey && !doc.data) return null
  return { mime: String(doc.mime || 'video/mp4'), bytes }
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
