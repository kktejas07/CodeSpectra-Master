import { NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { parseIdOcrPayload, type IdOcrResult } from '@/lib/assessment/id-ocr-parse'
import { getApiKey } from '@/lib/ai/get-api-key'
import { compareNames, namesAgree } from '@/lib/assessment/name-match'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const OCR_PROMPT =
  'Look at this photo. Reply ONLY with JSON: { "is_id_card": boolean, "name": "full name printed on the ID" }. ' +
  'Set is_id_card true ONLY if a physical government ID (passport, driver license, Aadhaar, national ID) is clearly visible with printed text. ' +
  'A selfie or face with no ID card is NOT an ID: return { "is_id_card": false, "name": "" }. ' +
  'Never invent or guess a name from a face. If an ID is present but the name is unreadable, return { "is_id_card": true, "name": "" }.'

/**
 * 'match' → accepted. 'partial' (e.g. initials only, one name part missing) →
 * accepted but flagged: the client passes nameMatch:'partial' to
 * /api/exams/[id]/identity, which sets needs_manual_review (A-005).
 */
function verifiedResponse(verdict: 'match' | 'partial') {
  return NextResponse.json({
    success: true,
    nameMatch: verdict,
    needsReview: verdict === 'partial',
    message: verdict === 'match'
      ? 'ID verified successfully (AI)'
      : 'ID accepted. The name only partly matches your account, so a reviewer will check it.',
  })
}

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

    // Names read but NOT matching the account. Only treated as a genuine
    // mismatch when two providers independently agree; otherwise the card
    // was simply unreadable (hallucination risk) → ask for a retake.
    const mismatchNames: string[] = []
    for (const attempt of attempts) {
      try {
        const extracted = await attempt.run()
        if (!extracted) continue
        if (!extracted.isIdCard) {
          return NextResponse.json({ error: NO_ID_ERROR }, { status: 422 })
        }
        if (extracted.name) {
          const verdict = compareNames(extracted.name, userName)
          if (verdict !== 'mismatch') return verifiedResponse(verdict)
          // ponytail: vision models hallucinate plausible names (e.g. invented
          // names on blurry cards) — NEVER treat one provider's reading as fact.
          // Collect it and let a second provider confirm before crying mismatch.
          mismatchNames.push(extracted.name)
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
            const verdict = compareNames(extracted.name, userName)
            if (verdict !== 'mismatch') return verifiedResponse(verdict)
            mismatchNames.push(extracted.name)
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
    //
    // Resolve collected mismatches: two providers agreeing with each other but
    // not the account = genuine wrong-ID (400). A single unconfirmed reading
    // (or providers disagreeing) = unreadable card, ask for a retake (422) —
    // never present one model's guess as ground truth.
    if (mismatchNames.length >= 2) {
      const [m0, m1] = mismatchNames
      const agree = namesAgree(m0, m1)
      if (agree) {
        return NextResponse.json({
          error: `The name on this ID does not match your account name (${userName}). Two independent reads both saw "${m0}". Please use your own valid government ID.`,
          readName: m0,
          mismatch: true,
        }, { status: 400 })
      }
    }
    if (mismatchNames.length >= 1) {
      return NextResponse.json({
        error: `We couldn't clearly read the name on this ID (account: ${userName}). Hold it steady in good light with all text visible, then try again.`,
        readName: mismatchNames[0],
        uncertain: true,
      }, { status: 422 })
    }
    return NextResponse.json({ error: 'ID verification service could not read the ID. Please try again.' }, { status: 422 })

  } catch (error: any) {
    console.error('ID OCR Error:', error)
    return NextResponse.json({ error: 'Internal server error during ID verification' }, { status: 500 })
  }
}