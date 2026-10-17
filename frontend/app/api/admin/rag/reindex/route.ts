import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { getApiKey } from '@/lib/ai/get-api-key'

export const dynamic = 'force-dynamic'

export async function POST() {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  try {
    const db = await getMongoDb()
    const embCol = db.collection('embeddings')

    // Resolve API key using unified utility with round-robin support
    const keyResult = await getApiKey('openai') || await getApiKey('openrouter') || await getApiKey('opencode')
    if (!keyResult) {
      return NextResponse.json({ ok: false, error: 'AI API key not configured in Superadmin settings' }, { status: 503 })
    }
    const apiKey = keyResult.key
    const isOr = keyResult.provider === 'openrouter' || keyResult.provider === 'opencode'

    // Clear old embeddings
    await embCol.deleteMany({})
    const embedUrl = isOr ? 'https://openrouter.ai/api/v1/embeddings' : 'https://api.openai.com/v1/embeddings'
    const embedModel = isOr ? 'openai/text-embedding-3-small' : 'text-embedding-ada-002'

    const embed = async (text: string): Promise<number[] | null> => {
      try {
        const res = await fetch(embedUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({ input: text.slice(0, 8000), model: embedModel }),
        })
        if (!res.ok) {
          // Fallback if model requires standard ada-002 on openrouter
          if (isOr && embedModel !== 'text-embedding-ada-002') {
            const res2 = await fetch(embedUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
              body: JSON.stringify({ input: text.slice(0, 8000), model: 'text-embedding-ada-002' }),
            })
            if (res2.ok) {
              const d2 = await res2.json()
              return d2.data?.[0]?.embedding || null
            }
          }
          return null
        }
        const d = await res.json()
        return d.data?.[0]?.embedding || null
      } catch {
        return null
      }
    }

    let total = 0

    // Index problems
    const problems = await db.collection('problems').find({ is_published: true }).toArray()
    for (const p of problems) {
      const text = `${p.title}\n${(p.statement_md || '').slice(0, 3000)}\nTopics: ${(p.topics || []).join(', ')}`
      const vec = await embed(text)
      if (vec) { await embCol.insertOne({ embedding: vec, text, source: `problem:${p.slug}`, created_at: new Date().toISOString() }); total++ }
    }

    // Index hackathon tasks
    const hackathons = await db.collection('hackathons').find({ status: { $ne: 'draft' } }).toArray()
    for (const h of hackathons) {
      if (!h.tasks) continue
      for (const task of h.tasks) {
        const text = `${task.problem_title}\nDifficulty: ${task.difficulty}\nPoints: ${task.points || 100}`
        const vec = await embed(text)
        if (vec) { await embCol.insertOne({ embedding: vec, text, source: `hackathon:${h.slug}/${task.problem_slug}`, created_at: new Date().toISOString() }); total++ }
      }
    }

    // Index doc files
    try {
      const fs = await import('fs')
      const path = await import('path')
      const docsDir = path.join(process.cwd(), '..', 'docs', 'public')
      if (fs.existsSync(docsDir)) {
        const files = fs.readdirSync(docsDir).filter((f: string) => f.endsWith('.md'))
        for (const file of files) {
          const content = fs.readFileSync(path.join(docsDir, file), 'utf-8')
          const text = content.replace(/^---[\s\S]*?---\n/, '').slice(0, 5000)
          const vec = await embed(text)
          if (vec) { await embCol.insertOne({ embedding: vec, text, source: `docs:${file}`, created_at: new Date().toISOString() }); total++ }
        }
      }
    } catch { /* docs dir not available */ }

    return NextResponse.json({ ok: true, count: total })
  } catch (e) {
    console.error('[CodeSpectra] admin/rag/reindex:', e)
    return NextResponse.json({ ok: false, error: 'Reindex failed' }, { status: 500 })
  }
}
