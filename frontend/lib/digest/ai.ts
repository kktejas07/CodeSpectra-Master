/**
 * AI summaries for the digest (server only). Guards:
 *  - settings switch, an atomic daily call cap and a monthly spend cap for
 *    feature `daily_digest` (backendComplete → recordAiUsage records every
 *    call; the platform budget hard stop applies inside it too);
 *  - third-party text goes through the prompt guard first — a flagged item is
 *    never sent to the model (the verifier rejects it);
 *  - anything the model gets wrong falls back to the template summary.
 * With AI unavailable / capped the outcome is "templates only" and the digest
 * still goes out.
 */
import 'server-only'
import type { DraftOutcome, Summaries } from './loop'
import { digestAiBlocked, type DigestSettings } from './settings'
import { DIGEST_SYSTEM, digestUserMessage, parseAiSummaries } from './prompt'
import { candidateFactsText } from './candidates'
import { getDigestConfig, takeAiSlot } from './store'
import type { DigestLocale, ScoredCandidate } from './types'

export const DIGEST_AI_FEATURE = 'daily_digest'
const BATCH = 8

export async function digestAiStatus(s: DigestSettings): Promise<{ blocked: string | null; callsToday: number; spentUsd: number }> {
  const [{ aiCallsToday }, { capSpendFor }] = await Promise.all([getDigestConfig(), import('@/lib/ai/usage-record')])
  const spentUsd = await capSpendFor([DIGEST_AI_FEATURE], 0).catch(() => 0)
  return { blocked: digestAiBlocked(s, aiCallsToday, spentUsd), callsToday: aiCallsToday, spentUsd }
}

/** Is this item's third-party text safe to send to a model? */
export async function isFlagged(c: ScoredCandidate): Promise<boolean> {
  if (!c.third_party) return false
  const { scanUntrusted } = await import('@/lib/ai/untrusted-input')
  return scanUntrusted(candidateFactsText(c)).flagged
}

export async function draftSummaries(items: readonly ScoredCandidate[], langs: readonly DigestLocale[], s: DigestSettings, opts: { useAi: boolean; userId?: string }): Promise<DraftOutcome> {
  const out: DraftOutcome = { summaries: new Map<string, Summaries>(), ai_calls: 0, fallback: null }
  if (!opts.useAi) return { ...out, fallback: 'ai_not_requested' }
  const st = await digestAiStatus(s).catch(() => ({ blocked: 'ai_failed' as string | null }))
  if (st.blocked) return { ...out, fallback: st.blocked }
  const safe: ScoredCandidate[] = []
  for (const c of items) if (!(await isFlagged(c))) safe.push(c)
  const [{ backendComplete }, { platformModelOverrides, extractJson }] = await Promise.all([import('@/lib/ai/backend'), import('@/lib/interviews/ai-mock-engine')])
  for (let i = 0; i < safe.length; i += BATCH) {
    const batch = safe.slice(i, i + BATCH)
    if (!(await takeAiSlot(s.daily_ai_cap))) { out.fallback = 'daily_cap'; break }
    try {
      out.ai_calls++
      const res = await backendComplete({
        systemMessage: DIGEST_SYSTEM,
        userMessage: digestUserMessage(batch, langs),
        modelRole: 'fast',
        responseFormat: 'json',
        feature: DIGEST_AI_FEATURE,
        userId: opts.userId || 'system:daily-digest',
        cache: false,
        ...(await platformModelOverrides()),
      })
      if (!res.ok) { out.fallback = 'ai_failed'; continue }
      const json = res.json && typeof res.json === 'object' ? res.json : extractJson(res.raw || res.text || '')
      for (const [k, v] of parseAiSummaries(json, batch, langs)) out.summaries.set(k, v)
    } catch (e) {
      const code = (e as { code?: string })?.code
      console.warn('[digest] AI summary failed:', code || (e as Error)?.message)
      out.fallback = code === 'ai_budget_exceeded' ? 'monthly_cap' : 'ai_failed'
      if (code === 'ai_budget_exceeded') break
    }
  }
  return out
}
