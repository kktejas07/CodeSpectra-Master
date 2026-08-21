import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import * as googleTTS from 'google-tts-api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST - Start background processing for a job
export async function POST(request: NextRequest) {
  const user = await getAPIUser()
  if (!user || user.role !== 'superadmin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { jobId } = await request.json()
    if (!jobId) return NextResponse.json({ error: 'jobId required' }, { status: 400 })

    const db = await getMongoDb()
    const job = await db.collection('generation_jobs').findOne({ id: jobId })
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

    if (job.status === 'running') {
      return NextResponse.json({ error: 'Job already running' }, { status: 409 })
    }

    // Start processing in background (non-blocking)
    processJob(jobId).catch(e => console.error('[worker] Fatal:', e))

    return NextResponse.json({ success: true, message: 'Job processing started' })
  } catch (e) {
    console.error('[worker] POST error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

async function processJob(jobId: string) {
  const db = await getMongoDb()
  const job = await db.collection('generation_jobs').findOne({ id: jobId })
  if (!job) return

  // Mark as running
  await db.collection('generation_jobs').updateOne(
    { id: jobId },
    { $set: { status: 'running', startedAt: new Date().toISOString() } }
  )

  const addLog = async (message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') => {
    const logEntry = { timestamp: new Date().toISOString(), message, type }
    await db.collection('generation_jobs').updateOne(
      { id: jobId },
      { $push: { logs: logEntry } } as any
    )
  }

  try {
    const course = await db.collection('courses').findOne({ id: job.courseId })
    if (!course) {
      await addLog('Course not found', 'error')
      await db.collection('generation_jobs').updateOne({ id: jobId }, { $set: { status: 'failed' } })
      return
    }

    const sections = course.sections || []
    let completedItems = 0
    let failedItems = 0
    const totalItems = sections.reduce((sum: number, s: any) => sum + (s.lessons?.length || 0), 0)

    await addLog(`Starting video generation for ${totalItems} lessons`)

    for (let sIdx = 0; sIdx < sections.length; sIdx++) {
      const section = sections[sIdx]
      for (let lIdx = 0; lIdx < (section.lessons?.length || 0); lIdx++) {
        const lesson = section.lessons[lIdx]

        // Skip if already has script
        if (lesson.script && lesson.script.length > 0) {
          completedItems++
          await addLog(`Skipped (already has video): ${lesson.title}`, 'info')
          continue
        }

        await addLog(`Generating: ${section.title} > ${lesson.title}`)

        try {
          const topic = lesson.content || lesson.title
          const techStack = course.tags?.[0] || 'programming'

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
            throw new Error('No AI API key configured')
          }

          const aiEndpoint = nvidiaKey ? 'https://integrate.api.nvidia.com/v1/chat/completions' : groqKey ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions'
          const aiKey = nvidiaKey || groqKey || openAiKey
          const aiModel = nvidiaKey ? 'meta/llama-3.1-70b-instruct' : groqKey ? 'llama-3.3-70b-versatile' : 'gpt-4o-mini'

          const textRes = await fetch(aiEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiKey}` },
            body: JSON.stringify({ model: aiModel, messages: [{ role: 'user', content: textPrompt }] })
          })

          if (!textRes.ok) throw new Error('AI Text Error')
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
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiKey}` },
            body: JSON.stringify({ model: aiModel, messages: [{ role: 'user', content: videoPrompt }], response_format: { type: 'json_object' } })
          })

          if (!videoRes.ok) throw new Error('AI Video Script Error')
          const videoData = await videoRes.json()
          const parsed = JSON.parse(videoData.choices[0].message.content)

          // --- Generate Audio via TTS ---
          let fullAudioUrl: string | null = null
          try {
            const fullSpokenText = parsed.slides.map((s: any) => s.spokenText).join(' ')
            const results = await googleTTS.getAllAudioBase64(fullSpokenText, {
              lang: 'en', slow: false, host: 'https://translate.google.com', timeout: 15000,
            })
            const buffers = results.map((r: any) => Buffer.from(r.base64, 'base64'))
            const combinedBuffer = Buffer.concat(buffers)
            fullAudioUrl = `data:audio/mpeg;base64,${combinedBuffer.toString('base64')}`
          } catch (ttsErr) {
            console.warn('[worker] TTS failed:', ttsErr)
          }

          // --- Format Script for Remotion ---
          const finalScript = parsed.slides.map((slide: any) => {
            const wordCount = (slide.spokenText || '').split(' ').length
            const estimatedSeconds = Math.max(3, wordCount / 2.0)
            return {
              id: slide.id,
              title: slide.title,
              content: slide.content,
              durationInFrames: Math.round(estimatedSeconds * 30)
            }
          })

          // Save to course
          const updatedSections = [...sections]
          updatedSections[sIdx].lessons[lIdx] = {
            ...updatedSections[sIdx].lessons[lIdx],
            textContent: generatedMarkdown,
            script: finalScript,
            audioUrl: fullAudioUrl,
            videoType: 'ai',
            type: 'video',
            duration: finalScript.reduce((a: number, c: any) => a + (c.durationInFrames || 0), 0)
              ? Math.floor(finalScript.reduce((a: number, c: any) => a + (c.durationInFrames || 0), 0) / 30)
              : 600,
          }

          await db.collection('courses').updateOne(
            { id: job.courseId },
            { $set: { sections: updatedSections, updated_at: new Date().toISOString() } }
          )

          completedItems++
          await addLog(`Completed: ${lesson.title} (${finalScript.length} slides)`, 'success')
        } catch (e: any) {
          failedItems++
          await addLog(`Failed: ${lesson.title} — ${e.message}`, 'error')
        }

        // Update progress
        await db.collection('generation_jobs').updateOne(
          { id: jobId },
          { $set: { completedItems, failedItems, progress: Math.round((completedItems / totalItems) * 100) } }
        )

        // Small delay to avoid rate limits
        await new Promise(r => setTimeout(r, 500))
      }
    }

    // Complete job
    await db.collection('generation_jobs').updateOne(
      { id: jobId },
      { $set: { status: 'completed', progress: 100, completedAt: new Date().toISOString() } }
    )
    await addLog(`Job completed: ${completedItems} videos generated, ${failedItems} failed`, failedItems > 0 ? 'warning' : 'success')

  } catch (e: any) {
    await db.collection('generation_jobs').updateOne(
      { id: jobId },
      { $set: { status: 'failed', error: e.message } }
    )
    await addLog(`Job failed: ${e.message}`, 'error')
  }
}
