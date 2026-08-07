/**
 * CodeSpectra Analytics — Database layer.
 *
 * Collections:
 *   - analytics_events      (custom events: code_run, challenge_completed, etc.)
 *   - analytics_sessions    (user sessions with journey, duration, device)
 *   - analytics_pageviews   (automatic pageview tracking)
 */
import { randomUUID } from 'node:crypto'
import type { Collection } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'

export function newId(): string {
  return randomUUID()
}
export function nowIso(): string {
  return new Date().toISOString()
}

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
