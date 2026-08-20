import { MongoClient } from 'mongodb'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import * as dotenv from 'dotenv'
import * as googleTTS from 'google-tts-api'

// Load environment variables from .env.local
dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const uri = process.env.MONGODB_URI
if (!uri) {
  console.error("MONGODB_URI is not set in .env.local")
  process.exit(1)
}

const nvidiaKey = process.env.NVIDIA_API_KEY
const groqKey = process.env.GROQ_API_KEY
if (!groqKey && !nvidiaKey) {
  console.error("Neither NVIDIA_API_KEY nor GROQ_API_KEY is set in .env.local")
  process.exit(1)
}

const client = new MongoClient(uri)

const curriculum = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'scripts/cpp-curriculum.json'), 'utf8'))

const TEMPLATE = `You are an expert course instructor. Generate a script for a 3-minute video lesson on the topic: "{topic}".
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
Do not include markdown blocks, just raw JSON. Use the teacher-style conversational format:
- Hook
- What Is It?
- Why Do We Need It?
- C++ Implementation
- Dry Run
- Complexity
- Common Mistakes
- Practice Problem
- Recap`

async function generateVideo(topic: string) {
  console.log(`Generating AI Script for: ${topic}...`)
  
  const aiEndpoint = nvidiaKey ? 'https://integrate.api.nvidia.com/v1/chat/completions' : 'https://api.groq.com/openai/v1/chat/completions'
  const aiKey = nvidiaKey || groqKey
  const aiModel = nvidiaKey ? 'meta/llama-3.1-70b-instruct' : 'llama-3.3-70b-versatile'

  const aiRes = await fetch(aiEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${aiKey}`
    },
    body: JSON.stringify({
      model: aiModel,
      messages: [{ role: 'user', content: TEMPLATE.replace('{topic}', topic) }],
      response_format: { type: 'json_object' }
    })
  })

  if (!aiRes.ok) throw new Error(`Groq Error: ${await aiRes.text()}`)
  const aiData = await aiRes.json()
  const parsed = JSON.parse(aiData.choices[0].message.content)

  // 2. TTS via Google
  console.log(`Generating TTS Audio for: ${topic}...`)
  const fullSpokenText = parsed.slides.map((s: any) => s.spokenText).join(' ')
  
  const results = await googleTTS.getAllAudioBase64(fullSpokenText, {
    lang: 'en',
    slow: false,
    host: 'https://translate.google.com',
    timeout: 20000,
  })

  const buffers = results.map((r: any) => Buffer.from(r.base64, 'base64'))
  const combinedBuffer = Buffer.concat(buffers)
  const audioUrl = `data:audio/mpeg;base64,${combinedBuffer.toString('base64')}`

  // 3. Format
  const script = parsed.slides.map((slide: any) => {
    const wordCount = slide.spokenText.split(' ').length
    const estimatedSeconds = Math.max(3, wordCount / 2.0)
    return {
      id: slide.id || crypto.randomUUID(),
      title: slide.title,
      content: slide.content,
      durationInFrames: Math.round(estimatedSeconds * 30)
    }
  })

  const duration = script.reduce((a: number, c: any) => a + (c.durationInFrames || 0), 0)
  const durationSecs = Math.floor(duration / 30)

  return { script, audioUrl, duration: durationSecs }
}

async function run() {
  try {
    await client.connect()
    const db = client.db('codespectra')
    const coursesCol = db.collection('courses')

    const course = await coursesCol.findOne({ id: 'cpp-dsa' })
    if (!course) {
      console.error("Course 'cpp-dsa' not found!")
      return
    }

    console.log("Found course 'cpp-dsa'. Seeding sections...")

    const updatedSections = []
    
    // To avoid rate limiting, we will only generate videos for the first 3 lessons as a proof of concept.
    // The rest will be populated without AI data, which the admin can generate via UI.
    let videoCount = 0
    const MAX_VIDEOS_TO_GENERATE_NOW = 3 

    for (const section of curriculum) {
      const lessons = []
      for (const lesson of section.lessons) {
        let lessonData: any = {
          id: crypto.randomUUID(),
          title: lesson.title,
          slug: lesson.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          type: 'video',
          videoType: 'ai',
          free: false,
          duration: 0,
          content: lesson.title // The AI prompt
        }

        // Only generate videos for a few to prevent 429 errors from Groq
        if (videoCount < MAX_VIDEOS_TO_GENERATE_NOW) {
          try {
            const { script, audioUrl, duration } = await generateVideo(lesson.title)
            lessonData.script = script
            lessonData.audioUrl = audioUrl
            lessonData.duration = duration
            console.log(`Successfully generated video for ${lesson.title}`)
            videoCount++
            // Delay for rate limits
            await new Promise(r => setTimeout(r, 2000))
          } catch (e) {
            console.error(`Failed to generate video for ${lesson.title}`, e)
          }
        } else {
          // Just populate structural info for the rest
          lessonData.script = null
          lessonData.audioUrl = null
        }
        
        lessons.push(lessonData)
      }
      
      updatedSections.push({
        title: section.title,
        slug: section.slug,
        lessons
      })
    }

    await coursesCol.updateOne(
      { id: 'cpp-dsa' },
      { $set: { sections: updatedSections, updated_at: new Date().toISOString() } }
    )

    console.log("Successfully seeded cpp-dsa curriculum!")
  } finally {
    await client.close()
  }
}

run().catch(console.error)
