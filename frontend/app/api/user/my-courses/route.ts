import { NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET — courses the user is enrolled in. */
export async function GET() {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const db = await getMongoDb()
    const enrollments = await db
      .collection('course_enrollments')
      .find({ userId: user.id })
      .sort({ enrolledAt: -1 })
      .toArray()
    const ids = enrollments.map((e) => String(e.courseId)).filter(Boolean)
    if (!ids.length) return NextResponse.json({ courses: [] })

    const courses = await db
      .collection('courses')
      .find({ id: { $in: ids } })
      .project({ id: 1, title: 1, description: 1, category: 1, level: 1, thumbnail: 1, image: 1 })
      .toArray()
    const byId = new Map(courses.map((c) => [String(c.id), c]))
    const ordered = ids
      .map((id) => {
        const c = byId.get(id)
        const en = enrollments.find((e) => String(e.courseId) === id)
        if (!c) return null
        return {
          id: String(c.id),
          title: c.title || id,
          description: c.description || '',
          category: c.category || '',
          level: c.level || '',
          thumbnail: c.thumbnail || c.image || null,
          enrolledAt: en?.enrolledAt || null,
        }
      })
      .filter(Boolean)

    return NextResponse.json({ courses: ordered })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
