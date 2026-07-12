/**
 * Seed script: generate embeddings for existing problems and code scans,
 * storing them in the `embeddings` collection for RAG retrieval.
 *
 * Uses OpenAI embedding API directly (key configured in platform settings).
 *
 * Usage: npx tsx scripts/seed-embeddings.ts
 */
import { getMongoDb } from '@/lib/mongodb'

const EMBEDDING_MODEL = 'text-embedding-ada-002'

async function getOpenAiKey(): Promise<string> {
  // Check env first, then fall back to platform settings
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY
  const db = await getMongoDb()
  // Check main settings document
  const main = await db.collection('platform_settings').findOne({})
  const mainKey = (main?.value as Record<string, unknown>)?.secrets as Record<string, string> | undefined
  if (mainKey?.openai_api_key) return mainKey.openai_api_key
  // Check secrets document
  const sec = await db.collection('platform_settings').findOne({ key: 'secrets' })
  const secKey = sec?.value as Record<string, string> | undefined
  if (secKey?.openai_api_key) return secKey.openai_api_key
  throw new Error('OPENAI_API_KEY not configured. Set it in Settings → Integrations.')
}

async function getEmbedding(text: string, apiKey: string): Promise<number[] | null> {
  const body = { input: text.slice(0, 8000), model: EMBEDDING_MODEL }
  try {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const err = await res.text().catch(() => '')
      console.error(`[embedding] HTTP ${res.status}: ${err.slice(0, 100)}`)
      return null
    }
    const data = await res.json()
    return data.data?.[0]?.embedding as number[] | undefined ?? null
  } catch (e) {
    console.error(`[embedding] fetch failed: ${(e as Error).message}`)
    return null
  }
}

async function seed() {
  const db = await getMongoDb()
  const apiKey = await getOpenAiKey()
  const embCol = db.collection('embeddings')
  await embCol.deleteMany({})

  // 1. Index problems
  const problems = await db.collection('problems').find({ is_published: true }).toArray()
  let indexed = 0
  for (const p of problems) {
    const text = `${p.title}\n${(p.statement_md || '').slice(0, 3000)}\nTopics: ${(p.topics || []).join(', ')}`
    const emb = await getEmbedding(text, apiKey)
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
      const emb = await getEmbedding(text, apiKey)
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
    const emb = await getEmbedding(text, apiKey)
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
