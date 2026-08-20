import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import * as googleTTS from 'google-tts-api'

export async function POST(request: NextRequest) {
  const user = await getAPIUser()
  if (!user || user.role !== 'superadmin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { topic } = body

    if (!topic) {
      return NextResponse.json({ error: 'Topic is required' }, { status: 400 })
    }

    const openAiKey = process.env.OPENAI_API_KEY
    const groqKey = process.env.GROQ_API_KEY
    const nvidiaKey = process.env.NVIDIA_API_KEY
    if (!openAiKey && !groqKey && !nvidiaKey) {
      // Mock mode if no API key is provided
      await new Promise(resolve => setTimeout(resolve, 2000))
      return NextResponse.json({ 
        success: true, 
        script: [
          { id: '1', title: `What is ${topic}?`, content: ['Definition and basics', 'Key concepts explained'], durationInFrames: 120 },
          { id: '2', title: `Why use ${topic}?`, content: ['Performance benefits', 'Use cases'], durationInFrames: 120 },
        ],
        audioUrl: null, // No audio in mock mode
        message: 'Mock video generated. Add NVIDIA_API_KEY, GROQ_API_KEY or OPENAI_API_KEY for real AI generation.'
      })
    }

    // 1. Generate Script via OpenAI
    const prompt = `You are an expert course instructor. Generate a script for a 3-minute video lesson on the topic: "${topic}".
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
Do not include markdown blocks, just raw JSON.`

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
    
    // 2. Generate Audio via TTS
    // Use google-tts-api for a free TTS generation since no paid API is desired.
    let fullAudioUrl: string | null = null
    
    try {
      const fullSpokenText = parsed.slides.map((s: any) => s.spokenText).join(' ')
      
      const results = await googleTTS.getAllAudioBase64(fullSpokenText, {
        lang: 'en',
        slow: false,
        host: 'https://translate.google.com',
        timeout: 10000,
      })

      // Concatenate the MP3 buffers from each chunk
      const buffers = results.map(r => Buffer.from(r.base64, 'base64'))
      const combinedBuffer = Buffer.concat(buffers)
      
      fullAudioUrl = `data:audio/mpeg;base64,${combinedBuffer.toString('base64')}`
    } catch (ttsErr) {
      console.warn('Free TTS Generation failed:', ttsErr)
    }

    // 3. Format Script for Remotion
    // We estimate reading speed at ~120 words per minute (2.0 words per second).
    // At 30 FPS, that's (words / 2.0) * 30 frames.
    const finalScript = parsed.slides.map((slide: any) => {
      const wordCount = slide.spokenText.split(' ').length
      const estimatedSeconds = Math.max(3, wordCount / 2.0)
      return {
        id: slide.id,
        title: slide.title,
        content: slide.content,
        durationInFrames: Math.round(estimatedSeconds * 30) // Assuming 30fps
      }
    })

    return NextResponse.json({ 
      success: true, 
      script: finalScript,
      audioUrl: fullAudioUrl,
      message: `Successfully generated AI lesson for "${topic}"`
    })

  } catch (e) {
    console.error('Video Generation Error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
