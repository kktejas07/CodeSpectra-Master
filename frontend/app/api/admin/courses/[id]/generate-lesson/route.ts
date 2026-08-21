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

    // --- Step 1: Generate Detailed Text Lesson ---
    const textPrompt = `You are an expert course instructor. Write a comprehensive, detailed textbook-style lesson on the topic: "${topic}".
Include:
- Clear headings and structured formatting
- Deep explanations of the concepts
- Practical real-world examples
- Code snippets (if applicable)
- A short quiz at the end to test understanding
Format the entire response in clean Markdown.`

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

    const textRes = await fetch(aiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${aiKey}`
      },
      body: JSON.stringify({
        model: aiModel,
        messages: [{ role: 'user', content: textPrompt }]
      })
    })

    if (!textRes.ok) {
      const err = await textRes.text()
      throw new Error(`AI Text Error: ${err}`)
    }

    const textData = await textRes.json()
    const generatedMarkdown = textData.choices[0].message.content

    // --- Step 2: Generate Video Script from Text Lesson ---
    const videoPrompt = `You are an expert course instructor. I will provide you with a detailed text lesson. 
Summarize this lesson into a high-quality video script.

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
1. Generate between 5 to 10 slides.
2. The "spokenText" for each slide MUST be very detailed, conversational, and comprehensive, containing at least 60-100 words per slide. Explain the concepts deeply as a real instructor would, using the provided text lesson as the source.
3. The "content" bullet points should be concise summaries of what is being spoken, 3-5 points per slide.
Do not include markdown blocks or any other text outside the JSON.

TEXT LESSON TO SUMMARIZE:
"""
${generatedMarkdown}
"""`

    const videoRes = await fetch(aiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${aiKey}`
      },
      body: JSON.stringify({
        model: aiModel,
        messages: [{ role: 'user', content: videoPrompt }],
        response_format: { type: 'json_object' }
      })
    })

    if (!videoRes.ok) {
      const err = await videoRes.text()
      throw new Error(`AI Video Script Error: ${err}`)
    }

    const videoData = await videoRes.json()
    const parsed = JSON.parse(videoData.choices[0].message.content)

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
      textContent: generatedMarkdown,
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
      message: `Generated text and video for "${lesson.title}"`,
    })

  } catch (e) {
    console.error('[generate-lesson] error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
