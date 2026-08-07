/**
 * MongoDB index creation script.
 *
 * Run: npx tsx scripts/create-indexes.ts
 *
 * This script applies all recommended indexes from docs/database/03-Index-Strategy.md.
 * Indexes are created with background:false and dropDuplicates:true where applicable.
 *
 * WARNING: Running this on large collections may block writes during index creation.
 * For production, consider creating indexes in rolling fashion.
 */
import { getMongoDb } from '@/lib/mongodb'
import type { IndexSpecification } from 'mongodb'

const INDEX_SPECS: Record<string, Record<string, unknown>[]> = {
  user: [
    { key: { email: 1 }, unique: true, sparse: true },
    { key: { id: 1 }, unique: true, sparse: true },
    { key: { role: 1 } },
    { key: { createdAt: -1 } },
  ],
  account: [
    { key: { userId: 1, providerId: 1 } },
  ],
  session: [
    { key: { userId: 1, expiresAt: -1 } },
  ],
  problems: [
    { key: { slug: 1 }, unique: true },
    { key: { topics: 1 } },
    { key: { difficulty: 1 } },
    { key: { is_published: 1, difficulty: 1 } },
  ],
  submissions: [
    { key: { user_id: 1, created_at: -1 } },
    { key: { problem_id: 1, status: 1 } },
    { key: { user_id: 1, problem_id: 1 } },
  ],
  code_scans: [
    { key: { user_id: 1, created_at: -1 } },
    { key: { project_id: 1 } },
  ],
  code_metrics: [
    { key: { scan_id: 1 } },
  ],
  code_issues: [
    { key: { scan_id: 1 } },
    { key: { user_id: 1, created_at: -1 } },
    { key: { project_id: 1, severity: 1, status: 1 } },
    { key: { type: 1, status: 1 } },
  ],
  suggested_fixes: [
    { key: { user_id: 1, created_at: -1 } },
    { key: { issue_id: 1 } },
    { key: { scan_id: 1 } },
  ],
  scan_activities: [
    { key: { user_id: 1, created_at: -1 } },
  ],
  scan_comments: [
    { key: { user_id: 1, created_at: -1 } },
  ],
  code_review_comments: [
    { key: { user_id: 1, created_at: -1 } },
  ],
  integrations: [
    { key: { user_id: 1, provider: 1 }, unique: true },
  ],
  github_webhook_scan_queue: [
    { key: { status: 1, created_at: 1 } },
    { key: { delivery_id: 1 }, unique: true, sparse: true },
  ],
  github_webhook_events: [
    { key: { delivery_id: 1 }, unique: true, sparse: true },
    { key: { created_at: 1 } },
  ],
  github_oauth_states: [
    { key: { state: 1 }, unique: true },
  ],
  xp_events: [
    { key: { user_id: 1, created_at: -1 } },
    { key: { user_id: 1, problem_id: 1, reason: 1 }, unique: true },
  ],
  workflows: [
    { key: { is_active: 1, trigger: 1 } },
  ],
  workflow_runs: [
    { key: { workflow_id: 1, started_at: -1 } },
  ],
  notifications: [
    { key: { user_id: 1, is_read: 1, created_at: -1 } },
  ],
  notification_preferences: [
    { key: { user_id: 1, type: 1 }, unique: true },
  ],
  organization_invitations: [
    { key: { token: 1 }, unique: true },
  ],
  user_roles: [
    { key: { user_id: 1, organization_id: 1 }, unique: true },
  ],
  certifications: [
    { key: { slug: 1 }, unique: true },
  ],
  certification_attempts: [
    { key: { verify_token: 1 }, unique: true },
    { key: { user_id: 1, certification_id: 1 } },
  ],
  id_card_tokens: [
    { key: { token: 1 }, unique: true },
    { key: { user_id: 1, role_variant: 1, revoked_at: 1 } },
  ],
  hackathons: [
    { key: { slug: 1 }, unique: true },
  ],
  hackathon_teams: [
    { key: { hackathon_id: 1, slug: 1 }, unique: true },
    { key: { qr_token: 1 }, unique: true },
  ],
  daily_challenges: [
    { key: { user_id: 1, completedAt: -1 } },
  ],
  billing_orders: [
    { key: { user_id: 1, created_at: -1 } },
    { key: { razorpay_order_id: 1 }, unique: true },
  ],
  billing_payments: [
    { key: { order_id: 1 } },
    { key: { razorpay_payment_id: 1 }, unique: true },
  ],
  billing_subscriptions: [
    { key: { user_id: 1, status: 1 } },
  ],
  ai_chat_sessions: [
    { key: { user_id: 1, created_at: -1 } },
  ],
  ai_chat_messages: [
    { key: { session_id: 1, created_at: 1 } },
  ],
  ai_code_reviews: [
    { key: { user_id: 1, created_at: -1 } },
  ],
  ai_grades: [
    { key: { user_id: 1, created_at: -1 } },
  ],
  proctor_events: [
    { key: { user_id: 1, session_id: 1 } },
  ],
  security_settings: [
    { key: { name: 1 }, unique: true },
  ],
  security_events: [
    { key: { ts: -1 } },
    { key: { severity: 1, ts: -1 } },
    { key: { type: 1 } },
    { key: { visitorId: 1 } },
  ],
  device_fingerprints: [
    { key: { visitorId: 1 }, unique: true },
    { key: { last_seen: -1 } },
    { key: { is_blocked: 1 } },
  ],
  security_blocklist: [
    { key: { ip: 1 }, unique: true },
    { key: { active: 1, blocked_at: -1 } },
  ],
  user_sessions: [
    { key: { user_id: 1, last_seen: -1 } },
    { key: { user_id: 1, is_active: 1 } },
    { key: { last_seen: -1 } },
    { key: { created_at: -1 } },
  ],
  admin_audit_logs: [
    { key: { ts: -1 } },
    { key: { actor: 1, ts: -1 } },
    { key: { severity: 1, ts: -1 } },
    { key: { action: 1 } },
  ],
  exam_submissions: [
    { key: { exam_id: 1, user_id: 1 }, unique: true },
  ],
  codeathon_registrations: [
    { key: { codeathon_id: 1, user_id: 1 }, unique: true },
  ],
  job_applications: [
    { key: { job_id: 1, user_id: 1 }, unique: true },
    { key: { user_id: 1, status: 1 } },
  ],
  resumes: [
    { key: { user_id: 1, is_primary: 1 } },
  ],
  skill_analytics: [
    { key: { user_id: 1, skill: 1 }, unique: true },
  ],
  user_ai_settings: [
    { key: { user_id: 1 }, unique: true },
  ],
  analytics_events: [
    { key: { timestamp: -1 } },
    { key: { event: 1, timestamp: -1 } },
    { key: { user_id: 1, timestamp: -1 } },
    { key: { anonymous_id: 1, timestamp: -1 } },
    { key: { session_id: 1 } },
    { key: { path: 1 } },
  ],
  analytics_sessions: [
    { key: { id: 1 }, unique: true },
    { key: { user_id: 1, started_at: -1 } },
    { key: { anonymous_id: 1, started_at: -1 } },
    { key: { started_at: -1 } },
    { key: { last_activity_at: -1 } },
  ],
  analytics_pageviews: [
    { key: { timestamp: -1 } },
    { key: { path: 1, timestamp: -1 } },
    { key: { user_id: 1, timestamp: -1 } },
    { key: { session_id: 1 } },
  ],
}

async function main() {
  const db = await getMongoDb()
  let total = 0
  let errors = 0

  for (const [collection, specs] of Object.entries(INDEX_SPECS)) {
    try {
      const col = db.collection(collection)
      // Verify collection exists by checking document count
      const count = await col.estimatedDocumentCount()
      process.stdout.write(`[${collection}] (${count} docs) `)

      for (const spec of specs) {
        const key = JSON.stringify(spec.key)
        try {
          await col.createIndex(spec.key as IndexSpecification, {
            unique: spec.unique as boolean | undefined,
            sparse: spec.sparse as boolean | undefined,
            background: false,
          })
          process.stdout.write(`+${Object.keys(spec.key as Record<string, unknown>).join(',')} `)
          total++
        } catch (e) {
          const msg = (e as Error).message.slice(0, 60)
          process.stdout.write(`!${msg} `)
          errors++
        }
      }
      console.log()
    } catch (e) {
      console.error(`[${collection}] FAILED:`, (e as Error).message)
      errors++
    }
  }

  console.log(`\nDone. ${total} indexes created, ${errors} errors.`)
  process.exit(errors > 0 && total === 0 ? 1 : 0)
}

main()
