/**
 * Indexes for hot collections, created automatically (audit A-059).
 *
 * ensureHotIndexes() runs once per server process in the background (from
 * lib/boot-scheduler.ts) and from `npx tsx scripts/create-indexes.ts`.
 * createIndex is idempotent; an index that already exists with other options
 * (or can't be built because of duplicate data) is logged and skipped — it
 * never blocks start-up. Unique constraints stay with the code that owns them
 * (e.g. lib/exam-access.ts ensureExamIndexes); these are lookup indexes.
 *
 * Also backfills `exam_id` / `exam_ids` on legacy candidate_invites so the
 * results page can look invites up by index (A-012).
 */
import type { Db, IndexSpecification, CreateIndexesOptions } from 'mongodb'

type Spec = { key: Record<string, 1 | -1>; options?: CreateIndexesOptions }

export const HOT_INDEXES: Record<string, Spec[]> = {
  candidate_invites: [
    { key: { exam_id: 1, created_at: -1 } },
    { key: { exam_ids: 1 } },
    { key: { token: 1 } },
    { key: { email: 1, status: 1 } },
    { key: { tenant_id: 1, created_at: -1 } },
    { key: { postal_message_id: 1 }, options: { sparse: true } },
    // Bulk invite e-mail queue + per-batch status (lib/services/bulk-invites.ts).
    { key: { delivery_status: 1, delivery_next_at: 1 } },
    // Hourly invite reminders + nightly expiry (AUTO-071).
    { key: { status: 1, expires_at: 1 } },
    { key: { batch_id: 1 }, options: { sparse: true } },
  ],
  exam_submissions: [
    { key: { exam_id: 1, user_id: 1, created_at: -1 } },
    { key: { user_id: 1, created_at: -1 } },
  ],
  exam_drafts: [
    { key: { exam_id: 1, user_id: 1 } },
    // Abandoned-attempt sweep (every 5 min) — AUTO-071.
    { key: { attempt_started_at: 1 } },
    { key: { abandoned_checked_at: 1 }, options: { sparse: true } },
  ],
  exams: [
    { key: { id: 1 } },
    { key: { tenant_id: 1, created_at: -1 } },
    { key: { status: 1, ends_at: 1 } },
  ],
  user_streaks: [{ key: { user_id: 1 } }],
  referrals: [
    { key: { referrer_id: 1, kind: 1 } },
    { key: { referral_code: 1 } },
    { key: { referred_id: 1 } },
  ],
  xp_events: [
    { key: { user_id: 1, created_at: -1 } },
    { key: { reason: 1, created_at: -1 } },
    { key: { created_at: -1 } },
  ],
  proctor_events: [
    { key: { session_kind: 1, session_id: 1, user_id: 1 } },
    // Nightly retention delete + integrity review by session — AUTO-071.
    { key: { created_at: 1 } },
    { key: { session_id: 1 } },
  ],
  // ── Background-job queries (AUTO-071) ──────────────────────────────────────
  submissions: [{ key: { status: 1, created_at: -1 } }, { key: { user_id: 1, created_at: -1 } }],
  user: [{ key: { lastLoginAt: 1 } }, { key: { role: 1 } }],
  billing_subscriptions: [{ key: { status: 1, ends_at: 1 } }, { key: { user_id: 1 } }],
  automation_events: [{ key: { 'payload.order_id': 1 }, options: { sparse: true } }],
  admin_audit_logs: [{ key: { action: 1, created_at: -1 } }],
  email_logs: [{ key: { created_at: -1 } }],
  codeathon_registrations: [{ key: { codeathon_id: 1 } }],
  hackathon_teams: [{ key: { hackathon_id: 1 } }],
  interviews: [{ key: { status: 1, scheduled_at: 1 } }],
  workflow_runs: [{ key: { 'trigger_payload.interview_id': 1, status: 1 }, options: { sparse: true } }],
  mkt_payouts: [{ key: { status: 1, paying_at: 1 } }],
  mkt_orders: [{ key: { buyer_id: 1, created_at: -1 } }],
  whatsapp_optouts: [{ key: { key: 1 }, options: { unique: true } }],
  notification_deferred: [{ key: { status: 1, deliver_after: 1 } }],
  identity_media: [
    { key: { id: 1 }, options: { unique: true } },
    { key: { exam_id: 1, created_at: 1 } },
    { key: { created_at: 1 } },
  ],
  identity_media_blobs: [{ key: { id: 1 }, options: { unique: true } }],
  billing_orders: [
    { key: { status: 1, created_at: -1 } },
    { key: { phonepe_transaction_id: 1 }, options: { sparse: true } },
  ],
  cron_runs: [{ key: { id: 1 } }],
}

export async function ensureHotIndexes(db: Db, log: (msg: string) => void = () => {}): Promise<{ created: number; skipped: number }> {
  let created = 0
  let skipped = 0
  for (const [name, specs] of Object.entries(HOT_INDEXES)) {
    const col = db.collection(name)
    for (const s of specs) {
      try {
        await col.createIndex(s.key as IndexSpecification, { background: true, ...(s.options || {}) })
        created++
      } catch (e) {
        skipped++
        log(`[db-indexes] ${name} ${JSON.stringify(s.key)} skipped: ${(e as Error).message.slice(0, 120)}`)
      }
    }
  }
  return { created, skipped }
}

/** Legacy invites without exam_id: derive it from target_url / assigned steps. Bounded per call. */
export async function backfillInviteExamIds(db: Db, limit = 2000): Promise<number> {
  const { examIdFromTargetUrl, assignedExamIds } = await import('@/lib/exam-access')
  const col = db.collection('candidate_invites')
  const rows = await col
    .find({ exam_id: null, exam_ids_backfilled: { $ne: true } }, { projection: { _id: 1, target_url: 1, assigned_assessments: 1 } })
    .limit(limit)
    .toArray()
  let n = 0
  for (const r of rows) {
    const first = examIdFromTargetUrl(r.target_url)
    const ids = [...new Set([...(first ? [first] : []), ...(assignedExamIds(r.assigned_assessments) || [])])]
    await col.updateOne(
      { _id: r._id },
      { $set: { exam_ids_backfilled: true, ...(ids.length ? { exam_id: ids[0], exam_ids: ids } : {}) } },
    )
    n++
  }
  return n
}

let started: Promise<void> | null = null

/** Once per process, in the background. Never throws. */
export function ensureHotIndexesOnce(): void {
  if (started || process.env.SKIP_AUTO_INDEXES === '1') return
  started = (async () => {
    try {
      const { getMongoDb } = await import('@/lib/mongodb')
      const db = await getMongoDb()
      const r = await ensureHotIndexes(db, (m) => console.warn(m))
      const filled = await backfillInviteExamIds(db)
      console.log(`[db-indexes] ensured ${r.created} index(es)${r.skipped ? `, ${r.skipped} skipped` : ''}${filled ? `; backfilled exam_id on ${filled} invite(s)` : ''}`)
    } catch (e) {
      console.error('[db-indexes] failed:', e instanceof Error ? e.message : e)
    }
  })()
}
