import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import * as googleTTS from 'google-tts-api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/admin/courses/[id]/generate-lesson
// Generates AI video for ONE lesson. Called repeatedly by the frontend with delays.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAPIUser()
  if (!user || user.role !== 'superadmin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: courseId } = await params

  try {
    const { sectionIndex, lessonIndex } = await request.json()

    if (sectionIndex == null || lessonIndex == null) {
      return NextResponse.json({ error: 'sectionIndex and lessonIndex required' }, { status: 400 })
    }

    const db = await getMongoDb()
    const course = await db.collection('courses').findOne({ id: courseId })
    if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 })

    const sections = course.sections || []
    if (!sections[sectionIndex]) return NextResponse.json({ error: 'Section not found' }, { status: 404 })

    const lessons = sections[sectionIndex].lessons || []
    if (!lessons[lessonIndex]) return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })

    const lesson = lessons[lessonIndex]

    // Skip if already generated
    if (lesson.script && lesson.script.length > 0) {
      return NextResponse.json({ success: true, skipped: true, message: 'Already generated' })
    }

    if (!lesson.content?.trim()) {
      return NextResponse.json({ error: 'Lesson has no content/topic' }, { status: 400 })
    }

    const topic = lesson.content

    // --- Generate Script via AI ---
    const prompt = `You are an expert course instructor. Generate a detailed, highly informative script for a 3-5 minute video lesson on the topic: "${topic}".
Output valid JSON ONLY with this schema:
{
  "slides": [
    {
      "id": "unique-string",
      "title": "Slide Headline",
      "content": ["Bullet point 1", "Bullet point 2"],
      "spokenText": "The actual text the voiceover will read while this slide is on screen."
    }
  ]
}
Requirements:
1. Generate between 5 to 8 slides.
2. The "spokenText" for each slide MUST be very detailed and comprehensive, containing at least 60-100 words per slide. Do not be brief; explain the concepts deeply as a real instructor would.
3. The "content" bullet points should be concise summaries of what is being spoken, 3-5 points per slide.
Do not include markdown blocks or any other text, just raw JSON.`

    const openAiKey = process.env.OPENAI_API_KEY
    const groqKey = process.env.GROQ_API_KEY
    const nvidiaKey = process.env.NVIDIA_API_KEY

    if (!openAiKey && !groqKey && !nvidiaKey) {
      return NextResponse.json({ error: 'No AI API key configured (OPENAI_API_KEY, GROQ_API_KEY, or NVIDIA_API_KEY)' }, { status: 500 })
    }

    const aiEndpoint = nvidiaKey
      ? 'https://integrate.api.nvidia.com/v1/chat/completions'
      : groqKey
        ? 'https://api.groq.com/openai/v1/chat/completions'
        : 'https://api.openai.com/v1/chat/completions'

    const aiKey = nvidiaKey || groqKey || openAiKey

    const aiModel = nvidiaKey
      ? 'meta/llama-3.1-70b-instruct'
      : groqKey
        ? 'llama-3.3-70b-versatile'
        : 'gpt-4o-mini'

    const aiRes = await fetch(aiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${aiKey}`
      },
      body: JSON.stringify({
        model: aiModel,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' }
      })
    })

    if (!aiRes.ok) {
      const err = await aiRes.text()
      throw new Error(`AI Error: ${err}`)
    }

    const aiData = await aiRes.json()
    const parsed = JSON.parse(aiData.choices[0].message.content)

    // --- Generate Audio via TTS ---
    let fullAudioUrl: string | null = null

    try {
      const fullSpokenText = parsed.slides.map((s: any) => s.spokenText).join(' ')
      const results = await googleTTS.getAllAudioBase64(fullSpokenText, {
        lang: 'en',
        slow: false,
        host: 'https://translate.google.com',
        timeout: 10000,
      })
      const buffers = results.map((r: any) => Buffer.from(r.base64, 'base64'))
      const combinedBuffer = Buffer.concat(buffers)
      fullAudioUrl = `data:audio/mpeg;base64,${combinedBuffer.toString('base64')}`
    } catch (ttsErr) {
      console.warn('[generate-lesson] TTS failed:', ttsErr)
    }

    // --- Format Script for Remotion ---
    const finalScript = parsed.slides.map((slide: any) => {
      const wordCount = slide.spokenText.split(' ').length
      const estimatedSeconds = Math.max(3, wordCount / 2.0)
      return {
        id: slide.id,
        title: slide.title,
        content: slide.content,
        durationInFrames: Math.round(estimatedSeconds * 30)
      }
    })

    // --- Save to DB ---
    const sectionsUpdate = [...sections]
    const lessonsUpdate = [...sectionsUpdate[sectionIndex].lessons]
    lessonsUpdate[lessonIndex] = {
      ...lessonsUpdate[lessonIndex],
      script: finalScript,
      audioUrl: fullAudioUrl,
      type: 'video',
      videoType: 'ai',
      duration: finalScript.reduce((a: number, c: any) => a + (c.durationInFrames || 0), 0)
        ? Math.floor(finalScript.reduce((a: number, c: any) => a + (c.durationInFrames || 0), 0) / 30)
        : 600,
    }
    sectionsUpdate[sectionIndex] = { ...sectionsUpdate[sectionIndex], lessons: lessonsUpdate }

    await db.collection('courses').updateOne(
      { id: courseId },
      { $set: { sections: sectionsUpdate, updated_at: new Date().toISOString() } }
    )

    return NextResponse.json({
      success: true,
      script: finalScript,
      audioUrl: fullAudioUrl ? 'generated' : null,
      message: `Generated video for "${lesson.title}"`,
    })

  } catch (e) {
    console.error('[generate-lesson] error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
