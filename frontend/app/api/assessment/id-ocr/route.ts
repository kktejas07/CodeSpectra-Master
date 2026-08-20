import { NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import type { ServerSecretsRecord } from '@/lib/server-secrets-cache'

async function getBackendSecrets(): Promise<{ gemini: string; openrouter: string; nvidia: string }> {
  const fromEnv = {
    gemini: process.env.GEMINI_API_KEY?.trim() || '',
    openrouter: process.env.OPENROUTER_API_KEY?.trim() || '',
    nvidia: process.env.NVIDIA_API_KEY?.trim() || '',
  }
  try {
    const { readServerSecrets } = await import('@/lib/server-secrets-cache')
    const secrets = await readServerSecrets() as ServerSecretsRecord
    return {
      gemini: fromEnv.gemini || secrets.gemini_api_key?.trim() || '',
      openrouter: fromEnv.openrouter || secrets.openrouter_api_key?.trim() || '',
      nvidia: fromEnv.nvidia || secrets.nvidia_api_key?.trim() || '',
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

const OCR_PROMPT =
  "Extract the person's full name from this ID card. Reply ONLY with a valid JSON object in the format: { \"name\": \"extracted full name\" }. If no text can be read or it is not an ID card, return { \"name\": \"\" }."

const PROVIDER_TIMEOUT_MS = 15000

function imageContent(dataUrl: string) {
  return [
    { type: 'text', text: OCR_PROMPT },
    { type: 'image_url', image_url: { url: dataUrl } },
  ]
}

/** OpenAI-compatible chat completions vision call (OpenRouter / NVIDIA NIM). */
async function openAICompatOCR(dataUrl: string, key: string, base: string, model: string, label: string): Promise<string> {
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: imageContent(dataUrl) }],
      max_tokens: 300,
    }),
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  })
  if (!res.ok) {
    console.error(`[id-ocr] ${label} HTTP ${res.status}`)
    return ''
  }
  const data = await res.json()
  let content = data?.choices?.[0]?.message?.content ?? ''
  if (Array.isArray(content)) {
    content = content.map((p: any) => (typeof p === 'string' ? p : p?.text || '')).join('')
  }
  if (typeof content !== 'string') return ''
  const m = content.match(/\{[^{}]*\}/)
  if (!m) return ''
  try {
    const parsed = JSON.parse(m[0])
    return typeof parsed.name === 'string' ? parsed.name.trim() : ''
  } catch {
    return ''
  }
}

export async function POST(req: Request) {
  try {
    const user = await getAPIUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { imageBase64 } = await req.json()
    if (!imageBase64) return NextResponse.json({ error: 'Missing image' }, { status: 400 })

    const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64
    const dataUrl = `data:image/jpeg;base64,${base64Data}`
    const userName = user.name || ''

    const keys = await getBackendSecrets()

    // Try working vision providers in reliability order, each hard-capped so
    // the route always answers before Cloudflare's origin timeout (~100s).
    const attempts: Array<{ label: string; run: () => Promise<string> }> = []
    if (keys.openrouter) {
      attempts.push({
        label: 'openrouter',
        run: () => openAICompatOCR(dataUrl, keys.openrouter, 'https://openrouter.ai/api/v1', 'openai/gpt-4o-mini', 'openrouter'),
      })
    }
    if (keys.nvidia) {
      attempts.push({
        label: 'nvidia',
        run: () => openAICompatOCR(dataUrl, keys.nvidia, 'https://integrate.api.nvidia.com/v1', 'meta/llama-3.2-11b-vision-instruct', 'nvidia'),
      })
    }

    for (const attempt of attempts) {
      try {
        const extractedName = await attempt.run()
        if (extractedName) {
          if (isFuzzyNameMatch(extractedName, userName)) {
            return NextResponse.json({ success: true, message: 'ID verified successfully (AI)' })
          }
          return NextResponse.json({
            error: `ID name (${extractedName}) does not match account name (${userName}). Please use a valid ID or try again.`,
          }, { status: 400 })
        }
      } catch (e) {
        console.error(`[id-ocr] ${attempt.label} failed:`, e)
      }
    }

    if (keys.gemini) {
      try {
        const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${keys.gemini}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: OCR_PROMPT },
                  { inline_data: { mime_type: 'image/jpeg', data: base64Data } },
                ],
              },
            ],
            generationConfig: { responseMimeType: 'application/json' },
          }),
          signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
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
          if (extractedName) {
            if (isFuzzyNameMatch(extractedName, userName)) {
              return NextResponse.json({ success: true, message: 'ID verified successfully (AI)' })
            }
            return NextResponse.json({
              error: `ID name (${extractedName}) does not match account name (${userName}). Please use a valid ID or try again.`,
            }, { status: 400 })
          }
        } else {
          console.error(`[id-ocr] gemini HTTP ${geminiRes.status}`)
        }
      } catch (geminiError) {
        console.error('Gemini OCR failed', geminiError)
      }
    }

    // ponytail: the previous local-Tesseract fallback crashed this route in the
    // Next.js server bundle (missing worker-script module → uncaughtException →
    // no response → Cloudflare 524). All AI providers failed, so answer fast
    // with a clean error instead of hanging. Re-add Tesseract only if we make
    // tesseract.js ship its worker core:true with the bundle.
    return NextResponse.json({ error: 'ID verification service could not read the ID. Please try again.' }, { status: 422 })

  } catch (error: any) {
    console.error('ID OCR Error:', error)
    return NextResponse.json({ error: 'Internal server error during ID verification' }, { status: 500 })
  }
}