import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { notifySuperAdmins } from '@/lib/notifications'

export async function GET(request: NextRequest) {
  const user = await getAPIUser()
  if (!user || user.role !== 'superadmin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const db = await getMongoDb()
    const courses = await db.collection('courses').find({}).sort({ created_at: -1 }).toArray()
    return NextResponse.json({ data: courses })
  } catch (e) {
    console.error('[admin/courses]', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const user = await getAPIUser()
  if (!user || user.role !== 'superadmin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const db = await getMongoDb()

    const newCourse = {
      id: body.id || crypto.randomUUID(),
      title: body.title || 'New Course',
      description: body.description || '',
      type: body.type || 'video',
      instructor: body.instructor || 'CodeSpectra',
      level: body.level || 'beginner',
      rating: body.rating || 0,
      sessions: body.sessions || 0,
      category: body.category || 'Coding',
      tags: body.tags || [],
      image: body.image || '/courses/web.jpg',
      whatYoullLearn: body.whatYoullLearn || [],
      sections: body.sections || [],
      enrolled: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    await db.collection('courses').insertOne(newCourse)
    
    // Send notification
    await notifySuperAdmins({
      type: 'content.course_generated',
      title: 'Course Generated',
      message: `A new course "${newCourse.title}" has been successfully generated.`,
      link: `/dashboard/admin/courses/${newCourse.id}`
    })

    return NextResponse.json({ data: newCourse })
  } catch (e) {
    console.error('[admin/courses]', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
