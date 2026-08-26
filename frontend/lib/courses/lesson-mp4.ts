import { getMongoDb } from '@/lib/mongodb'
import { lessonVideoKey, readS3Config, s3DeleteObject, s3GetObject, s3ListPrefix, s3PutObject } from '@/lib/s3-storage'

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
    try {
      await s3PutObject(objectKey, video, 'video/mp4')
      stored = 'object'
    } catch (e) {
      console.warn('[lesson-mp4] S3 upload failed, falling back to MongoDB:', (e as Error).message?.slice(0, 120))
      if (video.length > MONGO_MAX) {
        throw new Error(`S3 upload failed AND MP4 (${(video.length / 1e6).toFixed(1)}MB) exceeds MongoDB limit. Fix S3 or reduce video size.`)
      }
      stored = 'mongo'
    }
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
  const deleted = new Set<string>()
  for (const doc of docs) {
    if (typeof doc.objectKey === 'string' && doc.objectKey) {
      try { await s3DeleteObject(doc.objectKey) } catch { /* still drop the mongo row */ }
      deleted.add(doc.objectKey)
    }
  }
  // Wipe any orphan R2 keys for this course (old regenerations / stray uploads)
  try {
    const orphans = await s3ListPrefix(`courses/${courseId}/`)
    for (const key of orphans) {
      if (deleted.has(key)) continue
      try { await s3DeleteObject(key) } catch { /* best-effort */ }
    }
  } catch { /* list may fail on some providers; mongo rows still cleared */ }
  await db.collection(COLLECTION).deleteMany({ courseId })
}
