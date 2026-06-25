/**
 * Phase 6 catch-all repository for collections that don't fit elsewhere:
 *   - quality_gates             (named per-project rule sets)
 *   - code_review_comments
 *   - scan_comments
 *   - integrations              (connected GitHub/Slack/etc.)
 *   - github_tokens             (encrypted access tokens)
 *   - github_scan_queue
 *   - support_tickets
 *   - pricing_tiers
 *   - pricing_features
 *   - web_vitals_events
 *   - admin_audit_logs
 *   - feature_flags
 *   - quality_ratings           (per-project rating rules)
 */
import { randomUUID } from 'crypto'
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

// Loose document types — many of these mirror SQL columns but are tolerant
// of arbitrary extra fields so existing UI payloads pass through unchanged.
type Doc = Record<string, unknown> & { id: string; created_at: string }
type UserDoc = Doc & { user_id: string }

export async function qualityGates(): Promise<Collection<Doc>> {
  return (await db()).collection<Doc>('quality_gates')
}
export async function qualityRatings(): Promise<Collection<Doc>> {
  return (await db()).collection<Doc>('quality_ratings')
}
export async function codeReviewComments(): Promise<Collection<UserDoc>> {
  return (await db()).collection<UserDoc>('code_review_comments')
}
export async function scanComments(): Promise<Collection<UserDoc>> {
  return (await db()).collection<UserDoc>('scan_comments')
}
export async function integrations(): Promise<Collection<UserDoc>> {
  return (await db()).collection<UserDoc>('integrations')
}
export async function githubTokens(): Promise<Collection<UserDoc>> {
  return (await db()).collection<UserDoc>('github_tokens')
}
export async function githubScanQueue(): Promise<Collection<UserDoc>> {
  return (await db()).collection<UserDoc>('github_scan_queue')
}
export async function supportTickets(): Promise<Collection<UserDoc>> {
  return (await db()).collection<UserDoc>('support_tickets')
}
export async function pricingTiers(): Promise<Collection<Doc>> {
  return (await db()).collection<Doc>('pricing_tiers')
}
export async function pricingFeatures(): Promise<Collection<Doc>> {
  return (await db()).collection<Doc>('pricing_features')
}
export async function webVitalsEvents(): Promise<Collection<UserDoc>> {
  return (await db()).collection<UserDoc>('web_vitals_events')
}
export async function adminAuditLogs(): Promise<Collection<UserDoc>> {
  return (await db()).collection<UserDoc>('admin_audit_logs')
}
export async function featureFlags(): Promise<Collection<Doc>> {
  return (await db()).collection<Doc>('feature_flags')
}
export async function suggestedFixes(): Promise<Collection<UserDoc>> {
  return (await db()).collection<UserDoc>('suggested_fixes')
}
