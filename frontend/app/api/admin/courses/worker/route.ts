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
          // Generate video via AI
          const topic = lesson.content || lesson.title
          const techStack = course.tags?.[0] || 'programming'

          // Generate script via AI
          const openAiKey = process.env.OPENAI_API_KEY
          const groqKey = process.env.GROQ_API_KEY
          const nvidiaKey = process.env.NVIDIA_API_KEY

          let scenes: any[] = []

          if (!openAiKey && !groqKey && !nvidiaKey) {
            // Mock mode
            scenes = [
              { id: 'scene-1', type: 'concept', title: 'Introduction', content: [`Understanding ${topic}`], spokenText: `Let me explain ${topic}. ${topic} is an important concept that helps us solve problems efficiently.` },
              { id: 'scene-2', type: 'concept', title: 'Key Concepts', content: ['Core ideas'], spokenText: `The key concepts of ${topic} include understanding the problem, choosing the right approach, and implementing it correctly.` },
            ]
          } else {
            const prompt = `Generate a 5-scene video lesson script on: "${topic}". Follow WHY→WHAT→HOW→WHERE teaching. Output JSON: {"scenes":[{"id":"s1","type":"concept","title":"Why","content":["reason"],"spokenText":"explanation"},{"id":"s2","type":"concept","title":"What","content":["definition"],"spokenText":"explain"},{"id":"s3","type":"code","title":"How","code":"// code","codeLanguage":"${techStack}","content":["key point"],"spokenText":"walkthrough"},{"id":"s4","type":"diagram","title":"Visual","visual":"array-walk","content":["step"],"spokenText":"watch this"},{"id":"s5","type":"concept","title":"Where","content":["use case"],"spokenText":"real world"}]}. Rules: spokenText explains REASONING not description. No markdown.`

            const aiEndpoint = nvidiaKey ? 'https://integrate.api.nvidia.com/v1/chat/completions' : groqKey ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions'
            const aiKey = nvidiaKey || groqKey || openAiKey
            const aiModel = nvidiaKey ? 'meta/llama-3.1-70b-instruct' : groqKey ? 'llama-3.3-70b-versatile' : 'gpt-4o-mini'

            const aiRes = await fetch(aiEndpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiKey}` },
              body: JSON.stringify({ model: aiModel, messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' } })
            })

            if (!aiRes.ok) throw new Error('AI generation failed')
            const aiData = await aiRes.json()
            const parsed = JSON.parse(aiData.choices[0].message.content)
            scenes = parsed.scenes || []
          }

          // Generate audio for each scene
          let totalDurationFrames = 0
          const scenesWithAudio = []

          for (const scene of scenes) {
            let audioBase64: string | null = null
            let durationFrames = 300

            if (scene.spokenText) {
              try {
                const results = await googleTTS.getAllAudioBase64(scene.spokenText, {
                  lang: 'en', slow: false, host: 'https://translate.google.com', timeout: 15000,
                })
                const buffers = results.map((r: any) => Buffer.from(r.base64, 'base64'))
                const combined = Buffer.concat(buffers)
                audioBase64 = `data:audio/mpeg;base64,${combined.toString('base64')}`
                durationFrames = Math.round((combined.length / 16000) * 30)
              } catch (e) {
                console.warn(`TTS failed for scene ${scene.id}:`, e)
              }
            }

            scenesWithAudio.push({ ...scene, audioUrl: audioBase64, durationInFrames: durationFrames, startFrame: totalDurationFrames })
            totalDurationFrames += durationFrames
          }

          // Save to course
          const updatedSections = [...sections]
          updatedSections[sIdx].lessons[lIdx] = {
            ...updatedSections[sIdx].lessons[lIdx],
            script: scenesWithAudio,
            videoType: 'ai',
            type: 'video',
            duration: Math.round(totalDurationFrames / 30),
          }

          await db.collection('courses').updateOne(
            { id: job.courseId },
            { $set: { sections: updatedSections, updated_at: new Date().toISOString() } }
          )

          completedItems++
          await addLog(`Completed: ${lesson.title} (${scenesWithAudio.length} scenes)`, 'success')
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
