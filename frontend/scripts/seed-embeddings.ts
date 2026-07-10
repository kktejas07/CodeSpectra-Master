/**
 * Seed script: generate embeddings for existing problems and code scans,
 * storing them in the `embeddings` collection for RAG retrieval.
 *
 * Usage: npx tsx scripts/seed-embeddings.ts
 */
import { getMongoDb } from '@/lib/mongodb'

const BACKEND_URL = process.env.INTERNAL_BACKEND_URL || 'http://codespectra-backend-cd7lq6:8000/internal/ai'

async function getEmbedding(text: string): Promise<number[] | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/rag/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.slice(0, 8000) }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.embedding as number[]
  } catch {
    return null
  }
}

async function seed() {
  const db = await getMongoDb()
  const embCol = db.collection('embeddings')

  // Clean old embeddings
  await embCol.deleteMany({})

  // 1. Index problems
  const problems = await db.collection('problems').find({ is_published: true }).toArray()
  let indexed = 0
  for (const p of problems) {
    const text = `${p.title}\n${(p.statement_md || '').slice(0, 3000)}\nTopics: ${(p.topics || []).join(', ')}`
    const emb = await getEmbedding(text)
    if (emb) {
      await embCol.insertOne({ embedding: emb, text, source: `problem:${p.slug}`, created_at: new Date().toISOString() })
      indexed++
    }
  }
  console.log(`✓ Indexed ${indexed} problems`)

  // 2. Index hackathon problems
  const hackathons = await db.collection('hackathons').find({ status: { $ne: 'draft' } }).toArray()
  let hIndexed = 0
  for (const h of hackathons) {
    if (!h.tasks) continue
    for (const task of h.tasks) {
      const text = `${task.problem_title}\nDifficulty: ${task.difficulty}\nPoints: ${task.points || 100}`
      const emb = await getEmbedding(text)
      if (emb) {
        await embCol.insertOne({ embedding: emb, text, source: `hackathon:${h.slug}/${task.problem_slug}`, created_at: new Date().toISOString() })
        hIndexed++
      }
    }
  }
  console.log(`✓ Indexed ${hIndexed} hackathon tasks`)

  // 3. Index docs
  try {
    const fs = await import('fs')
    const path = await import('path')
    const docsDir = path.join(process.cwd(), '..', 'docs', 'public')
    if (fs.existsSync(docsDir)) {
      const files = fs.readdirSync(docsDir).filter((f: string) => f.endsWith('.md'))
      let dIndexed = 0
      for (const file of files) {
        const content = fs.readFileSync(path.join(docsDir, file), 'utf-8')
        const text = content.replace(/^---[\s\S]*?---\n/, '').slice(0, 5000)
        const emb = await getEmbedding(text)
        if (emb) {
          await embCol.insertOne({ embedding: emb, text, source: `docs:${file}`, created_at: new Date().toISOString() })
          dIndexed++
        }
      }
      console.log(`✓ Indexed ${dIndexed} docs`)
    }
  } catch { /* docs dir not available */ }

  console.log(`\n✅ Total embeddings indexed: ${indexed + hIndexed}`)
  await db.client.close()
}

seed().catch((e) => { console.error('Seed failed:', e); process.exit(1) })
