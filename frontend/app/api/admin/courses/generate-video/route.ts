import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import * as googleTTS from 'google-tts-api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const user = await getAPIUser()
  if (!user || user.role !== 'superadmin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { topic, courseId, sectionIndex, lessonIndex, techStack } = await request.json()

    if (!topic) {
      return NextResponse.json({ error: 'Topic is required' }, { status: 400 })
    }

    // 1. Generate Scene-Based Script via AI
    const prompt = `You are an expert course instructor creating an animated video lesson. Generate a script for a lesson on: "${topic}".

Follow the WHY → WHAT → HOW → WHERE teaching methodology.

Output valid JSON ONLY:
{
  "scenes": [
    {
      "id": "scene-1",
      "type": "concept",
      "title": "Why Do We Need This?",
      "content": ["Real-world analogy that makes the concept click"],
      "spokenText": "Teach like a patient teacher. Explain WHY this matters before HOW it works. Be specific and educational."
    },
    {
      "id": "scene-2",
      "type": "concept",
      "title": "What Is It?",
      "content": ["Core definition in simple terms"],
      "spokenText": "Explain the WHAT clearly. What is this concept? How would you describe it to a friend?"
    },
    {
      "id": "scene-3",
      "type": "code",
      "title": "How Does It Work?",
      "code": "// actual working code here - not pseudocode",
      "codeLanguage": "${techStack || 'cpp'}",
      "content": ["Key line explained"],
      "spokenText": "Walk through the code line by line. WHY each line exists, not just what it does. Explain the reasoning."
    },
    {
      "id": "scene-4",
      "type": "diagram",
      "title": "Visual Walkthrough",
      "visual": "array-walk|bar-sort|tree-build|pointer-move",
      "visualData": {},
      "content": ["Step-by-step explanation"],
      "spokenText": "Now watch it in action. Explain what's happening at each step. Connect visual to concept."
    },
    {
      "id": "scene-5",
      "type": "concept",
      "title": "Where Is It Used?",
      "content": ["Real-world use case 1", "Real-world use case 2"],
      "spokenText": "Connect to real-world. WHERE do engineers use this? WHY does it matter in practice?"
    }
  ]
}

Rules:
- Each spokenText should teach like a patient teacher: WHY → WHAT → HOW → WHERE
- Include actual working code for code-type scenes (not pseudocode)
- For diagram scenes, specify visual type: array-walk, bar-sort, tree-build, pointer-move
- spokenText should explain REASONING, not just describe what's on screen
- Include at least one code scene and one diagram scene
- 5-7 scenes per lesson (each scene is ~30-60 seconds of video)
- Do NOT include markdown blocks, just raw JSON`

    const openAiKey = process.env.OPENAI_API_KEY
    const groqKey = process.env.GROQ_API_KEY
    const nvidiaKey = process.env.NVIDIA_API_KEY

    let scenes: any[] = []

    if (!openAiKey && !groqKey && !nvidiaKey) {
      // Mock mode for development
      scenes = [
        { id: 'scene-1', type: 'concept', title: 'Why Do We Need This?', content: [`Understanding ${topic} is fundamental`], spokenText: `Let me explain why ${topic} matters. Think of a real-world scenario where this concept solves a problem.` },
        { id: 'scene-2', type: 'concept', title: 'What Is It?', content: [`${topic} is a core concept`], spokenText: `${topic} is a technique that helps us solve problems efficiently. Let me break it down.` },
        { id: 'scene-3', type: 'code', title: 'Implementation', code: `// ${topic} implementation\nconsole.log("${topic}");`, codeLanguage: techStack || 'javascript', content: ['Basic implementation'], spokenText: `Here's how we implement ${topic} in code. Each line serves a specific purpose.` },
        { id: 'scene-4', type: 'concept', title: 'Key Takeaways', content: ['Remember the WHY', 'Practice the HOW'], spokenText: `Remember: ${topic} is about understanding the problem first, then applying the right solution.` },
      ]
    } else {
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
        throw new Error(`AI Generation Error: ${err}`)
      }

      const aiData = await aiRes.json()
      const parsed = JSON.parse(aiData.choices[0].message.content)
      scenes = parsed.scenes || []
    }

    // 2. Generate Audio for Each Scene
    const scenesWithAudio = []
    let totalDurationFrames = 0

    for (const scene of scenes) {
      let audioBase64: string | null = null
      let durationFrames = 300 // Default 10 seconds at 30fps

      if (scene.spokenText) {
        try {
          const results = await googleTTS.getAllAudioBase64(scene.spokenText, {
            lang: 'en',
            slow: false,
            host: 'https://translate.google.com',
            timeout: 15000,
          })
          const buffers = results.map((r: any) => Buffer.from(r.base64, 'base64'))
          const combined = Buffer.concat(buffers)
          audioBase64 = `data:audio/mpeg;base64,${combined.toString('base64')}`
          
          // Estimate duration from audio size (rough: ~16KB/s for 64kbps MP3)
          const estimatedSeconds = combined.length / 16000
          durationFrames = Math.round(estimatedSeconds * 30)
        } catch (e) {
          console.warn(`TTS failed for scene ${scene.id}:`, e)
        }
      }

      scenesWithAudio.push({
        ...scene,
        audioUrl: audioBase64,
        durationInFrames: durationFrames,
        startFrame: totalDurationFrames,
      })

      totalDurationFrames += durationFrames
    }

    // 3. Save to course if courseId provided
    if (courseId && sectionIndex != null && lessonIndex != null) {
      const db = await getMongoDb()
      const course = await db.collection('courses').findOne({ id: courseId })
      
      if (course) {
        const sections = [...(course.sections || [])]
        if (sections[sectionIndex]?.lessons?.[lessonIndex]) {
          sections[sectionIndex].lessons[lessonIndex] = {
            ...sections[sectionIndex].lessons[lessonIndex],
            script: scenesWithAudio,
            videoType: 'ai',
            type: 'video',
            duration: Math.round(totalDurationFrames / 30),
          }
          
          await db.collection('courses').updateOne(
            { id: courseId },
            { $set: { sections, updated_at: new Date().toISOString() } }
          )
        }
      }
    }

    return NextResponse.json({
      success: true,
      script: scenesWithAudio,
      totalDurationFrames,
      totalDurationSeconds: Math.round(totalDurationFrames / 30),
      message: `Generated ${scenesWithAudio.length} scenes for "${topic}"`,
    })

  } catch (e) {
    console.error('[generate-video] error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
