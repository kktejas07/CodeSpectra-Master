/**
 * CodeSpectra Analytics — Database layer.
 *
 * Collections:
 *   - analytics_events      (custom events: code_run, challenge_completed, etc.)
 *   - analytics_sessions    (user sessions with journey, duration, device)
 *   - analytics_pageviews   (automatic pageview tracking)
 *   - analytics_funnels     (funnel definitions + computed results)
 */
import { estimateUsd, SEED_PRICES } from '@/lib/ai/pricing'
import { newId, nowIso } from './ids'
import type { Collection } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'

export { newId, nowIso }

async function db() {
  return getMongoDb()
}

// ─── Event types ────────────────────────────────────────────────────────────

export interface AnalyticsEvent {
  id: string
  event: string
  user_id?: string
  anonymous_id?: string
  session_id?: string
  timestamp: string
  url?: string
  path?: string
  referrer?: string
  ip_hash?: string
  country?: string
  device_type?: string
  browser?: string
  os?: string
  screen_width?: number
  screen_height?: number
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  properties?: Record<string, unknown>
}

export interface AnalyticsSession {
  id: string
  user_id?: string
  anonymous_id?: string
  started_at: string
  last_activity_at: string
  ended_at?: string
  duration?: number
  entry_page?: string
  exit_page?: string
  pageviews: number
  events_count: number
  country?: string
  device_type?: string
  browser?: string
  os?: string
  referrer?: string
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  pages?: string[]
}

export interface AnalyticsPageview {
  id: string
  user_id?: string
  anonymous_id?: string
  session_id?: string
  timestamp: string
  url: string
  path: string
  title?: string
  referrer?: string
  duration?: number
  country?: string
  device_type?: string
  browser?: string
  os?: string
}

// ─── Collection factories ───────────────────────────────────────────────────

export async function analyticsEvents(): Promise<Collection<AnalyticsEvent>> {
  return (await db()).collection<AnalyticsEvent>('analytics_events')
}

export async function analyticsSessions(): Promise<Collection<AnalyticsSession>> {
  return (await db()).collection<AnalyticsSession>('analytics_sessions')
}

export async function analyticsPageviews(): Promise<Collection<AnalyticsPageview>> {
  return (await db()).collection<AnalyticsPageview>('analytics_pageviews')
}

// ─── Helper: parse UTM from URL ─────────────────────────────────────────────

export function parseUtm(url: string): { utm_source?: string; utm_medium?: string; utm_campaign?: string } {
  try {
    const u = new URL(url)
    return {
      utm_source: u.searchParams.get('utm_source') || undefined,
      utm_medium: u.searchParams.get('utm_medium') || undefined,
      utm_campaign: u.searchParams.get('utm_campaign') || undefined,
    }
  } catch {
    return {}
  }
}

// ─── Helper: simple IP hash (SHA-256 truncated, no secret needed for analytics) ─

export function hashIp(ip: string): string {
  // Simple non-crypto hash for analytics privacy. Not security-critical.
  let hash = 0
  for (let i = 0; i < ip.length; i++) {
    hash = ((hash << 5) - hash + ip.charCodeAt(i)) | 0
  }
  return `h${Math.abs(hash).toString(36)}`
}

// ─── Funnel types ───────────────────────────────────────────────────────────

export interface FunnelStep {
  event: string
  path?: string
  label?: string
}

export interface AnalyticsFunnel {
  id: string
  name: string
  description?: string
  steps: FunnelStep[]
  created_at: string
  created_by?: string
}

export interface FunnelStepResult {
  event: string
  label: string
  users: number
  conversion_rate: number
  dropoff_rate: number
}

export interface FunnelResult {
  funnel_id: string
  computed_at: string
  period: string
  steps: FunnelStepResult[]
  total_starters: number
  total_completers: number
  completion_rate: number
}

// ─── Funnel collection ──────────────────────────────────────────────────────

export async function analyticsFunnels(): Promise<Collection<AnalyticsFunnel>> {
  return (await db()).collection<AnalyticsFunnel>('analytics_funnels')
}

// ─── AI Analytics types ─────────────────────────────────────────────────────

export interface AiUsageEvent {
  id: string
  user_id?: string
  feature: string        // 'chat', 'code-review', 'hints', 'grade', etc.
  provider: string       // 'openai', 'anthropic', 'gemini', 'groq', etc.
  model: string          // 'gpt-4o-mini', 'claude-3.5-sonnet', etc.
  input_tokens: number
  output_tokens: number
  total_tokens: number
  estimated_cost: number // USD
  latency_ms: number
  success: boolean
  error?: string
  timestamp: string
}

// Per-model prices now live in the shared price book (lib/ai/pricing — seeds +
// admin overrides). Kept as a plain map for older readers.
export const AI_COST_RATES: Record<string, { input: number; output: number }> = Object.fromEntries(
  SEED_PRICES.filter((p) => p.kind === 'chat' && !p.provider).map((p) => [p.match, { input: p.inputPer1M ?? 0, output: p.outputPer1M ?? 0 }]),
)

/** USD estimate for a chat call with the active price book (unknown model → the book's fallback). */
export function estimateAiCost(model: string, inputTokens: number, outputTokens: number): number {
  return estimateUsd(model, inputTokens, outputTokens)
}

export async function analyticsAiUsage(): Promise<Collection<AiUsageEvent>> {
  return (await db()).collection<AiUsageEvent>('analytics_ai_usage')
}

/**
 * Track AI usage event. Call this after every AI API call to log usage.
 */
export async function trackAiUsage(event: Omit<AiUsageEvent, 'id' | 'timestamp'>): Promise<void> {
  try {
    const col = await analyticsAiUsage()
    await col.insertOne({
      id: newId(),
      timestamp: nowIso(),
      ...event,
    })
  } catch (e) {
    console.error('[analytics] Failed to track AI usage:', e)
  }
}
