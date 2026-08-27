import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { getApiKey } from '@/lib/ai/get-api-key'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  let query = ''
  try {
    const body = await request.json()
    query = String(body.query || '').trim()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  if (!query) return NextResponse.json({ error: 'Query is required' }, { status: 400 })

  try {
    // Resolve API key using unified utility with round-robin support
    const keyResult = await getApiKey('openai') || await getApiKey('openrouter') || await getApiKey('opencode')
    if (!keyResult) {
      return NextResponse.json({ error: 'AI API key not configured in Superadmin settings' }, { status: 503 })
    }
    const apiKey = keyResult.key
    const isOr = keyResult.provider === 'openrouter' || keyResult.provider === 'opencode'

    const db = await getMongoDb()
    const embedUrl = isOr ? 'https://openrouter.ai/api/v1/embeddings' : 'https://api.openai.com/v1/embeddings'
    const embedModel = isOr ? 'openai/text-embedding-3-small' : 'text-embedding-ada-002'

    let embRes = await fetch(embedUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ input: query.slice(0, 8000), model: embedModel }),
    })
    if (!embRes.ok && isOr && embedModel !== 'text-embedding-ada-002') {
      embRes = await fetch(embedUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ input: query.slice(0, 8000), model: 'text-embedding-ada-002' }),
      })
    }
    if (!embRes.ok) {
      return NextResponse.json({ error: 'Embedding API failed' }, { status: 502 })
    }
    const embData = await embRes.json()
    const queryVec = embData.data?.[0]?.embedding as number[]
    if (!queryVec) return NextResponse.json({ error: 'No embedding returned' }, { status: 502 })

    // Search via cosine similarity
    const allDocs = await db.collection('embeddings').find({}, {
      projection: { text: 1, source: 1, embedding: 1 },
    }).toArray()

    type C = { text: string; source: string; score: number }
    const candidates: C[] = []
    for (const doc of allDocs) {
      const vec = doc.embedding as number[]
      if (!vec || vec.length !== 1536) continue
      const dot = queryVec.reduce((s, v, i) => s + v * (vec[i] || 0), 0)
      const nq = Math.sqrt(queryVec.reduce((s, v) => s + v * v, 0))
      const nd = Math.sqrt(vec.reduce((s, v) => s + v * v, 0))
      const sim = nq && nd ? dot / (nq * nd) : 0
      if (sim > 0.6) {
        candidates.push({ text: (doc.text as string).slice(0, 300), source: doc.source as string, score: sim })
      }
    }
    candidates.sort((a, b) => b.score - a.score)

    return NextResponse.json({ results: candidates.slice(0, 10) })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
