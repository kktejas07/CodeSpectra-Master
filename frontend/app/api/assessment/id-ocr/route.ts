import { NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import Tesseract from 'tesseract.js'

async function getBackendSecrets(): Promise<{
  anthropic: string; gemini: string; openai: string; openrouter: string; opencode: string; groq: string
}> {
  const fromEnv = {
    anthropic: process.env.ANTHROPIC_API_KEY?.trim() || '',
    gemini: process.env.GEMINI_API_KEY?.trim() || '',
    openai: process.env.OPENAI_API_KEY?.trim() || '',
    openrouter: process.env.OPENROUTER_API_KEY?.trim() || '',
    opencode: process.env.OPENCODE_API_KEY?.trim() || '',
    groq: process.env.GROQ_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim() || '',
  }
  try {
    const { readServerSecrets, isMaskedSecret } = await import('@/lib/server-secrets-cache')
    const { readPlatformLlmConfig } = await import('@/lib/ai/get-user-model')
    const [secrets, platformLlm] = await Promise.all([readServerSecrets(), readPlatformLlmConfig()])
    const llmKey = platformLlm?.api_key && typeof platformLlm.api_key === 'string' && !isMaskedSecret(platformLlm.api_key) ? platformLlm.api_key.trim() : ''
    return {
      anthropic: fromEnv.anthropic || (secrets.anthropic_api_key?.trim() || llmKey),
      gemini: fromEnv.gemini || (secrets.gemini_api_key?.trim() || llmKey),
      openai: fromEnv.openai || (secrets.openai_api_key?.trim() || llmKey),
      openrouter: fromEnv.openrouter || (secrets.openrouter_api_key?.trim() || llmKey),
      opencode: fromEnv.opencode || (secrets.opencode_api_key?.trim() || llmKey),
      groq: fromEnv.groq || (secrets.groq_api_key?.trim() || llmKey),
    }
  } catch {
    return fromEnv
  }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Helper function to try fuzzy matching with regex
function isFuzzyNameMatch(text: string, userName: string): boolean {
  if (!text || !userName) return false
  const nameParts = userName.toLowerCase().split(/\s+/).filter((p: string) => p.length > 2)
  let matchCount = 0
  for (const part of nameParts) {
    if (text.toLowerCase().includes(part)) matchCount++
  }
  return matchCount > 0
}

async function performTesseractFallback(base64Data: string, userName: string) {
  try {
    console.log('Falling back to local Tesseract OCR...')
    const dataUri = `data:image/jpeg;base64,${base64Data}`
    // Use worker to run OCR
    const result = await Tesseract.recognize(dataUri, 'eng')
    const fullText = result.data.text || ''

    if (!fullText.trim()) {
      return NextResponse.json({ error: 'No readable text found on ID (Local Fallback).' }, { status: 400 })
    }

    if (isFuzzyNameMatch(fullText, userName)) {
      return NextResponse.json({ success: true, message: 'ID verified successfully via local OCR' })
    } else {
      return NextResponse.json({ 
        error: `ID name does not match account name (${userName}). Please use a valid ID or try again.` 
      }, { status: 400 })
    }
  } catch (err: any) {
    console.error('Tesseract fallback failed:', err)
    return NextResponse.json({ error: 'Both AI and local OCR processing failed.' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const user = await getAPIUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { imageBase64 } = await req.json()
    if (!imageBase64) return NextResponse.json({ error: 'Missing image' }, { status: 400 })

    const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64
    const userName = user.name || ''

    // Try Gemini API first for Structured OCR
    const secrets = await getBackendSecrets()
    const geminiKey = secrets.gemini || process.env.GEMINI_API_KEY

    if (geminiKey) {
      try {
        const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: "Extract the person's full name from this ID card. Reply ONLY with a valid JSON object in the format: { \"name\": \"extracted full name\" }. If no text can be read, return { \"name\": \"\" }." },
                  { inline_data: { mime_type: 'image/jpeg', data: base64Data } }
                ]
              }
            ],
            generationConfig: { responseMimeType: 'application/json' }
          })
        })

        if (geminiRes.ok) {
          const geminiData = await geminiRes.json()
          const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
          let extractedName = ''
          try {
            const parsed = JSON.parse(responseText)
            extractedName = parsed.name || ''
          } catch (e) {
            console.error('Failed to parse Gemini JSON:', responseText)
          }

          if (extractedName && isFuzzyNameMatch(extractedName, userName)) {
            return NextResponse.json({ success: true, message: 'ID verified successfully (AI)' })
          } else if (extractedName) {
            return NextResponse.json({ 
              error: `ID name (${extractedName}) does not match account name (${userName}). Please use a valid ID or try again.` 
            }, { status: 400 })
          }
        }
      } catch (geminiError) {
        console.error('Gemini OCR failed, proceeding to fallback', geminiError)
      }
    }

    // Fallback to Tesseract local OCR
    return await performTesseractFallback(base64Data, userName)

  } catch (error: any) {
    console.error('ID OCR Error:', error)
    return NextResponse.json({ error: 'Internal server error during ID verification' }, { status: 500 })
  }
}
