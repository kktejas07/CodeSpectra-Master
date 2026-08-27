import { NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { parseIdOcrPayload, type IdOcrResult } from '@/lib/assessment/id-ocr-parse'
import { getApiKey } from '@/lib/ai/get-api-key'

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
  'Look at this photo. Reply ONLY with JSON: { "is_id_card": boolean, "name": "full name printed on the ID" }. ' +
  'Set is_id_card true ONLY if a physical government ID (passport, driver license, Aadhaar, national ID) is clearly visible with printed text. ' +
  'A selfie or face with no ID card is NOT an ID: return { "is_id_card": false, "name": "" }. ' +
  'Never invent or guess a name from a face. If an ID is present but the name is unreadable, return { "is_id_card": true, "name": "" }.'

const PROVIDER_TIMEOUT_MS = 15000
const NO_ID_ERROR = 'No ID card detected. Hold up your government ID (Aadhaar, passport, or driver license) so the text is readable.'

function imageContent(dataUrl: string) {
  return [
    { type: 'text', text: OCR_PROMPT },
    { type: 'image_url', image_url: { url: dataUrl } },
  ]
}

/** OpenAI-compatible chat completions vision call (OpenRouter / NVIDIA NIM). */
async function openAICompatOCR(dataUrl: string, key: string, base: string, model: string, label: string): Promise<IdOcrResult | null> {
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
    return null
  }
  const data = await res.json()
  let content = data?.choices?.[0]?.message?.content ?? ''
  if (Array.isArray(content)) {
    content = content.map((p: any) => (typeof p === 'string' ? p : p?.text || '')).join('')
  }
  if (typeof content !== 'string' || !content.includes('{')) return null
  return parseIdOcrPayload(content)
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

    // Get API keys using unified utility with round-robin support
    const [openrouterKey, nvidiaKey, geminiKey] = await Promise.all([
      getApiKey('openrouter'),
      getApiKey('nvidia'),
      getApiKey('gemini'),
    ])

    // Try working vision providers in reliability order, each hard-capped so
    // the route always answers before Cloudflare's origin timeout (~100s).
    const attempts: Array<{ label: string; run: () => Promise<IdOcrResult | null> }> = []
    if (openrouterKey) {
      attempts.push({
        label: 'openrouter',
        run: () => openAICompatOCR(dataUrl, openrouterKey.key, 'https://openrouter.ai/api/v1', 'openai/gpt-4o-mini', 'openrouter'),
      })
    }
    if (nvidiaKey) {
      attempts.push({
        label: 'nvidia',
        run: () => openAICompatOCR(dataUrl, nvidiaKey.key, 'https://integrate.api.nvidia.com/v1', 'meta/llama-3.2-11b-vision-instruct', 'nvidia'),
      })
    }

    for (const attempt of attempts) {
      try {
        const extracted = await attempt.run()
        if (!extracted) continue
        if (!extracted.isIdCard) {
          return NextResponse.json({ error: NO_ID_ERROR }, { status: 422 })
        }
        if (extracted.name) {
          if (isFuzzyNameMatch(extracted.name, userName)) {
            return NextResponse.json({ success: true, message: 'ID verified successfully (AI)' })
          }
          return NextResponse.json({
            error: `ID name (${extracted.name}) does not match account name (${userName}). Please use a valid ID or try again.`,
          }, { status: 400 })
        }
      } catch (e) {
        console.error(`[id-ocr] ${attempt.label} failed:`, e)
      }
    }

    if (geminiKey) {
      try {
        const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey.key}`, {
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
          const extracted = parseIdOcrPayload(responseText)
          if (!extracted.isIdCard) {
            return NextResponse.json({ error: NO_ID_ERROR }, { status: 422 })
          }
          if (extracted.name) {
            if (isFuzzyNameMatch(extracted.name, userName)) {
              return NextResponse.json({ success: true, message: 'ID verified successfully (AI)' })
            }
            return NextResponse.json({
              error: `ID name (${extracted.name}) does not match account name (${userName}). Please use a valid ID or try again.`,
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