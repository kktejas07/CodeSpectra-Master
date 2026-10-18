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
import { newId, nowIso } from './ids'
import type { Collection } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'

export { newId, nowIso }

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
export async function adminAuditLogs(): Promise<Collection<AuditLogDoc>> {
  return (await db()).collection<AuditLogDoc>('admin_audit_logs')
}

export interface AuditLogDoc {
  id: string
  ts: string
  actor: string
  actorIp: string
  action: string
  resource: string
  resourceType: string
  severity: 'info' | 'warning' | 'critical'
  outcome: 'success' | 'denied'
  detail?: string
  user_id: string
  /** Tenant of the acting admin (tenant_admin entries); null for platform actions. */
  tenant_id?: string | null
  created_at: string
}

export async function writeAuditLog(entry: Omit<AuditLogDoc, 'id' | 'ts' | 'created_at'>): Promise<void> {
  try {
    const col = await adminAuditLogs()
    await col.insertOne({
      id: newId(),
      ts: nowIso(),
      created_at: nowIso(),
      ...entry,
    } as AuditLogDoc)
  } catch (e) {
    console.error('[audit] Failed to write audit log:', e)
  }
}

export function auditLogAction(
  action: string,
  outcome: 'success' | 'denied',
  actor: string,
  actorIp: string,
  resource: string,
  resourceType: string,
  severity: 'info' | 'warning' | 'critical' = 'info',
  detail?: string,
): Omit<AuditLogDoc, 'id' | 'ts' | 'created_at'> {
  return {
    action,
    outcome,
    actor,
    actorIp,
    resource,
    resourceType,
    severity,
    detail,
    user_id: actor,
  }
}
export async function featureFlags(): Promise<Collection<Doc>> {
  return (await db()).collection<Doc>('feature_flags')
}
export async function suggestedFixes(): Promise<Collection<UserDoc>> {
  return (await db()).collection<UserDoc>('suggested_fixes')
}
