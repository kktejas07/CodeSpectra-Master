import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { MongoClient } from 'mongodb'

// Check environment variable
const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017'
const client = new MongoClient(uri)

const PROVIDER_MAP = {
  'aistudio.google.com': 'gemini',
  'console.groq.com': 'groq',
  'openrouter.ai/keys': 'openrouter',
  'github.com/marketplace/models': 'github', // We don't have github natively but we'll try to map it, wait, skip or map to something? Let's just skip unknown providers
  'platform.deepseek.com': 'deepseek',
  'platform.openai.com': 'openai',
  'console.anthropic.com': 'anthropic',
  'opencode.ai': 'opencode',
  'console.x.ai': 'xai' // not supported natively, will skip
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length === 0) {
    console.error('Usage: node import-csv-keys.mjs <path-to-csv1> <path-to-csv2> ...')
    process.exit(1)
  }

  const keysToAdd = {}

  for (const file of args) {
    const content = fs.readFileSync(path.resolve(file), 'utf8')
    const lines = content.split('\n').map(l => l.trim()).filter(Boolean)
    
    // Skip header
    for (let i = 1; i < lines.length; i++) {
      const [rawProvider, key] = lines[i].split(',')
      if (!rawProvider || !key) continue
      
      const providerId = PROVIDER_MAP[rawProvider.trim()]
      if (!providerId) {
        console.warn(`Skipping unknown provider URL: ${rawProvider}`)
        continue
      }
      
      if (!keysToAdd[providerId]) keysToAdd[providerId] = []
      
      keysToAdd[providerId].push({
        id: randomUUID(),
        key: key.trim(),
        added_at: new Date().toISOString(),
        usage_count: 0,
        rate_limited_until: null
      })
    }
  }

  try {
    await client.connect()
    const db = client.db('codespectra') // adjust if db name differs, usually from uri or default
    const col = db.collection('platform_settings')
    
    const doc = await col.findOne({ key: 'llm' })
    const cfg = doc?.value || { provider: 'gemini', model: 'gemini-2.0-flash', endpoint: '', api_key: '', keys: {} }
    
    if (!cfg.keys) cfg.keys = {}
    
    let addedCount = 0
    for (const [provider, newKeys] of Object.entries(keysToAdd)) {
      if (!cfg.keys[provider]) cfg.keys[provider] = []
      
      // Deduplicate
      const existingKeys = new Set(cfg.keys[provider].map(k => k.key))
      for (const nk of newKeys) {
        if (!existingKeys.has(nk.key)) {
          cfg.keys[provider].push(nk)
          addedCount++
        }
      }
    }
    
    await col.updateOne(
      { key: 'llm' },
      { $set: { value: cfg, updated_at: new Date().toISOString() } },
      { upsert: true }
    )
    
    console.log(`Successfully added ${addedCount} new API keys to the database.`)
    
  } catch (err) {
    console.error('Database error:', err)
  } finally {
    await client.close()
  }
}

main().catch(console.error)
