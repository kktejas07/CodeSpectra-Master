import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST - Generate certificate for completed course
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: courseId } = await params

  try {
    const db = await getMongoDb()

    // Check progress
    const progress = await db.collection('course_progress').findOne({
      courseId,
      userId: user.id,
    })

    if (!progress) {
      return NextResponse.json({ error: 'Not enrolled in this course' }, { status: 400 })
    }

    // Check if all modules completed
    const course = await db.collection('courses').findOne({ id: courseId })
    if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 })

    const totalModules = course.sections?.length || 0
    const completedModules = progress.completedModules || []

    if (completedModules.length < totalModules) {
      return NextResponse.json({
        error: `Complete all ${totalModules} modules first (${completedModules.length}/${totalModules} done)`,
      }, { status: 400 })
    }

    // Check if final exam passed (optional - if course has final exam)
    const finalExamScore = progress.finalExamScore
    if (finalExamScore !== undefined && finalExamScore < 80) {
      return NextResponse.json({
        error: `Final exam score ${finalExamScore}% — 80% required for certificate`,
      }, { status: 400 })
    }

    // Calculate overall score from quiz scores
    const quizScores = progress.quizScores || {}
    const scores = Object.values(quizScores) as number[]
    const overallScore = scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 100

    // Generate certificate ID
    const certId = `cert-${courseId}-${user.id}-${Date.now()}`

    // Create certificate record
    const certificate = {
      id: certId,
      courseId,
      courseTitle: course.title,
      userId: user.id,
      userName: user.email?.split('@')[0] || 'Student',
      userEmail: user.email,
      score: overallScore,
      completedAt: progress.completedAt || new Date().toISOString(),
      issuedAt: new Date().toISOString(),
      // In production, this would generate a PDF/image
      verificationUrl: `https://codespectra.ai/certificate/${certId}`,
    }

    await db.collection('certificates').insertOne(certificate)

    // Update progress with certificate
    await db.collection('course_progress').updateOne(
      { courseId, userId: user.id },
      { $set: { certificateUrl: certificate.verificationUrl } }
    )

    return NextResponse.json({
      success: true,
      certificate,
      message: `Certificate generated for "${course.title}"`,
    })
  } catch (e) {
    console.error('[certificate] error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
