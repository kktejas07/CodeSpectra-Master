/**
 * "Ask about events & news" (server only): public hybrid search, then — when
 * allowed — a short AI answer in the visitor's language that cites the
 * results by number. Public ACL only (lib/rag/public via searchPublicKnowledge).
 *
 * Counters (collection `public_ask_usage`, TTL 2 days):
 *   ai:<day>              AI answers today, platform-wide (atomic cap)
 *   anon:<iphash>:<day>   questions from one anonymous IP today (captcha threshold)
 */
import 'server-only'
import { createHash } from 'node:crypto'
import { getMongoDb } from '@/lib/mongodb'
import type { KnowledgeHit } from '@/lib/agent/contract'
import { ASK_SYSTEM, PUBLIC_ASK_FEATURE, PUBLIC_ASK_LIMITS, askMode, askUserMessage, cleanAnswer, publicCitations, publicHits, type AskFallback, type AskLocale } from './policy'

const DAY = 86_400_000
const today = () => new Date().toISOString().slice(0, 10)

let indexed: Promise<unknown> | null = null
async function usageCol() {
  const c = (await getMongoDb()).collection<{ id: string; n: number; expires_at: Date }>('public_ask_usage')
  if (!indexed) {
    indexed = Promise.all([
      c.createIndex({ id: 1 }, { unique: true, name: 'pau_id' }),
      c.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0, name: 'pau_ttl' }),
    ]).catch((e) => { indexed = null; console.error('[public-ask] index:', (e as Error)?.message) })
  }
  await indexed
  return c
}

export const ipHash = (ip: string) => createHash('sha256').update(`public-ask:${ip || 'unknown'}`).digest('hex').slice(0, 24)

async function bump(id: string): Promise<number> {
  const c = await usageCol()
  const r = await c.findOneAndUpdate({ id }, { $inc: { n: 1 }, $setOnInsert: { id, expires_at: new Date(Date.now() + 2 * DAY) } }, { upsert: true, returnDocument: 'after' })
  return r?.n ?? 1
}
async function read(id: string): Promise<number> {
  return (await (await usageCol()).findOne({ id }))?.n ?? 0
}

export const anonAsksToday = (ip: string) => read(`anon:${ipHash(ip)}:${today()}`).catch(() => 0)
export const countAnonAsk = (ip: string) => bump(`anon:${ipHash(ip)}:${today()}`).catch(() => 0)

/** Take one AI answer from today's platform-wide allowance (false = cap reached). */
async function takeAiSlot(cap: number): Promise<boolean> {
  const n = await bump(`ai:${today()}`).catch(() => Number.POSITIVE_INFINITY)
  return n <= cap
}

export interface AskResult {
  mode: 'ai' | 'search'
  fallback: AskFallback | null
  answer: string | null
  /** Source numbers the answer cites. */
  cited: number[]
  results: ReturnType<typeof publicCitations>
}

export async function askPublic(q: string, opts: { want: 'ask' | 'search'; locale: AskLocale; types?: string[]; userId?: string | null }): Promise<AskResult> {
  const { searchPublicKnowledge } = await import('@/lib/rag/search')
  const hits: KnowledgeHit[] = publicHits(await searchPublicKnowledge({ query: q, types: opts.types, limit: 6, userId: opts.userId }))
  const results = publicCitations(hits)
  // Search demand for the SEO / content gap loop: normalised query + counts only (lib/agent-loops/search-log).
  void import('@/lib/agent-loops/search-log').then((m) => m.recordAskQuery(q, results.length)).catch(() => undefined)
  const [{ scanUntrusted }, { aiBudgetBlocks }] = await Promise.all([import('@/lib/ai/untrusted-input'), import('@/lib/ai/usage-record')])
  const decision = askMode({
    want: opts.want,
    aiEnabled: process.env.PUBLIC_ASK_AI !== '0',
    aiToday: await read(`ai:${today()}`).catch(() => 0),
    budgetBlocked: await aiBudgetBlocks(PUBLIC_ASK_FEATURE),
    flagged: scanUntrusted(q).flagged,
    hits: results.length,
  })
  const plain = (fallback: AskFallback | null): AskResult => ({ mode: 'search', fallback, answer: null, cited: [], results })
  if (decision.mode === 'search') return plain(decision.fallback)
  if (!(await takeAiSlot(PUBLIC_ASK_LIMITS.dailyAiCap))) return plain('daily_cap')
  try {
    const [{ backendComplete }, { platformModelOverrides, extractJson }] = await Promise.all([import('@/lib/ai/backend'), import('@/lib/interviews/ai-mock-engine')])
    const res = await backendComplete({
      systemMessage: ASK_SYSTEM,
      userMessage: askUserMessage(q, hits, opts.locale),
      modelRole: 'fast',
      responseFormat: 'json',
      feature: PUBLIC_ASK_FEATURE,
      userId: opts.userId || 'public',
      cache: true,
      ...(await platformModelOverrides()),
    })
    if (!res.ok) return plain('ai_failed')
    const json = res.json && typeof res.json === 'object' ? res.json : extractJson(res.raw || res.text || '')
    const clean = cleanAnswer(json, results.length)
    if (!clean) return plain('ai_failed')
    return { mode: 'ai', fallback: null, answer: clean.text, cited: clean.cited, results }
  } catch (e) {
    const code = (e as { code?: string })?.code
    console.warn('[public-ask] AI answer failed:', code || (e as Error)?.message)
    return plain(code === 'ai_budget_exceeded' ? 'budget' : 'ai_failed')
  }
}
