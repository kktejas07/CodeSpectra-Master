/**
 * GET /api/courses/[id]/cover — the course's cover art.
 *
 * Public on purpose: these are catalog images, exactly like the
 * /public/courses/*.jpg they replace. Rendered per course (title, level, subject
 * palette) so two courses on the same subject no longer show the same picture;
 * a real uploaded poster stored on the course always wins.
 *
 * Immutable + ETag: the URL only changes when the course title/level changes,
 * and the validator includes those, so browsers and the Traefik cache keep it.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getMongoDb } from '@/lib/mongodb'
import { composeCourseCover } from '@/lib/courses/course-cover'
import { readCourseArt } from '@/lib/courses/course-cover-art'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Small in-process LRU: composing is ~40-80 ms and the catalog renders 20+ cards. */
const CACHE_MAX = 96
const cache = new Map<string, { body: Buffer; etag: string }>()

function remember(key: string, body: Buffer, etag: string) {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value
    if (oldest) cache.delete(oldest)
  }
  cache.set(key, { body, etag })
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const db = await getMongoDb()
    const course = await db.collection('courses').findOne({ id })
    if (!course) return NextResponse.json({ error: 'Not found', code: 'not_found' }, { status: 404 })

    // Illustrated art (generated per course) wins over the typographic poster.
    const art = await readCourseArt(id)
    const etag = `"${Buffer.from(
      [
        course.id,
        course.title,
        course.level,
        course.category,
        course.updated_at || '',
        art ? `art:${art.updatedAt || ''}` : 'poster',
        'v2',
      ].join('|'),
    ).toString('base64url')}"`
    if (request.headers.get('if-none-match') === etag) {
      return new NextResponse(null, { status: 304, headers: { ETag: etag, 'Cache-Control': 'public, max-age=31536000, immutable' } })
    }

    const cacheKey = `${id}:${etag}`
    const hit = cache.get(cacheKey)
    const body = hit ? hit.body : art ? art.bytes : await composeCourseCover(course as never)
    if (!hit) remember(cacheKey, body, etag)

    return new NextResponse(new Uint8Array(body), {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Length': String(body.length),
        'Cache-Control': 'public, max-age=31536000, immutable',
        ETag: etag,
      },
    })
  } catch (e) {
    console.error('[course-cover]', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.', code: 'server_error' }, { status: 500 })
  }
}
