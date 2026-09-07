// Neutral module — safe to import anywhere; all DB access is lazy + never throws.
import crypto from 'node:crypto'

export interface CacheKeyParts {
  feature?: string
  modelRole?: string
  providerOverride?: string
  modelOverride?: string
  responseFormat?: string
  systemMessage: string
  userMessage: string
}

export interface CachedCompletion {
  text?: string
  json?: unknown
}

/** Conservative normalization: trim + collapse whitespace runs only.
 *  Never lowercases — code prompts are case-sensitive. */
export function normalizePrompt(text: string): string {
  return (text || '').replace(/\s+/g, ' ').trim()
}

export function cacheKey(parts: CacheKeyParts): string {
  const normalized = normalizePrompt(parts.systemMessage) + '\n' + normalizePrompt(parts.userMessage)
  const scope = [
    parts.feature || 'unknown',
    parts.modelRole || 'reasoning',
    parts.providerOverride || '',
    parts.modelOverride || '',
    parts.responseFormat || 'text',
  ].join('|')
  return crypto.createHash('sha256').update(scope + '\n' + normalized).digest('hex')
}

async function getDb(): Promise<any> {
  const { getMongoDb } = await import('@/lib/mongodb')
  return getMongoDb()
}

/** Best-effort read. Returns null on miss OR any error (cache never fails requests). */
export async function getCachedCompletion(key: string): Promise<CachedCompletion | null> {
  try {
    const db = await getDb()
    const doc = await db.collection('ai_cache').findOne(
      { _id: key },
      { projection: { text: 1, json: 1 } },
    )
    if (!doc) return null
    return { ...(doc.text !== undefined ? { text: doc.text } : {}), ...(doc.json !== undefined ? { json: doc.json } : {}) }
  } catch {
    return null
  }
}

/** Best-effort write with BSON-Date createdAt (TTL index expires after 7 days). */
export function setCachedCompletion(
  key: string,
  result: CachedCompletion,
  feature?: string,
): void {
  try {
    void getDb()
      .then((db) =>
        db.collection('ai_cache').updateOne(
          { _id: key },
          {
            $set: {
              text: result.text ?? null,
              json: result.json ?? null,
              feature: feature || 'unknown',
              createdAt: new Date(),
            },
          },
          { upsert: true },
        ),
      )
      .catch(() => undefined)
  } catch {
    // Cache must never fail the request.
  }
}
