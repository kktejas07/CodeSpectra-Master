/**
 * What happens to a person's data when their account is deleted (AUTO-085).
 *
 * One plan, used by self-deletion (/api/user/delete-account), admin deletion
 * (/api/admin/users/[id]) and the nightly data-hygiene scrub (which re-runs it
 * for any deletion in the last 7 days, so a partial failure heals itself).
 * Every step is idempotent.
 *
 *  - delete:    personal data with no one else depending on it.
 *  - anonymise: records that must stay for money, legal or community reasons
 *               (orders, AI cost rows, posts other people replied to). Names,
 *               emails and phones go; ids are replaced with a one-way tombstone
 *               id so totals and unique indexes still work.
 */
import { createHash } from 'crypto'
import type { Db } from 'mongodb'

export type PurgeOp =
  | { kind: 'delete'; collection: string; filter: Record<string, unknown>; why: string }
  | { kind: 'update'; collection: string; filter: Record<string, unknown>; update: Record<string, unknown>; why: string }

/** Stable, non-reversible stand-in for a deleted user's id. */
export function tombstoneId(uid: string): string {
  return 'deleted:' + createHash('sha256').update('account-purge:' + uid).digest('hex').slice(0, 16)
}

export const DELETED_NAME = 'Deleted user'

/**
 * The full plan for one user. `ids` carries ids looked up first (guardian
 * links, seller ids) so the plan itself stays pure and testable.
 */
export function accountPurgePlan(uid: string, ids: { guardianLinkIds?: string[]; sellerIds?: string[] } = {}, now = new Date()): PurgeOp[] {
  const at = now.toISOString()
  const ghost = tombstoneId(uid)
  const del = (collection: string, field: string, why: string, value: unknown = uid): PurgeOp => ({ kind: 'delete', collection, filter: { [field]: value }, why })
  const upd = (collection: string, filter: Record<string, unknown>, update: Record<string, unknown>, why: string): PurgeOp => ({ kind: 'update', collection, filter, update, why })
  const ops: PurgeOp[] = [
    // Account plumbing.
    del('user_sessions', 'user_id', 'sessions'),
    del('notifications', 'user_id', 'in-app notifications'),
    del('notification_preferences', 'user_id', 'preferences'),
    del('notification_deferred', 'user_id', 'queued notifications'),
    del('user_extended_profiles', 'userId', 'profile'),
    del('email_change_otps', 'userId', 'email change codes'),
    del('id_card_tokens', 'user_id', 'id card links'),
    del('user_ai_settings', 'user_id', 'AI settings'),
    del('device_fingerprints', 'user_id', 'device fingerprints'),
    // Push (mobile + web).
    del('push_tokens', 'user_id', 'mobile push tokens'),
    del('push_tokens', 'userId', 'mobile push tokens (legacy field)'),
    del('web_push_subscriptions', 'user_id', 'web push subscriptions'),
    // Event alerts / digests.
    del('subscriptions', 'user_id', 'event alert subscription (email + WhatsApp)'),
    del('digest_sends', 'user_id', 'digest send markers'),
    // WhatsApp daily practice — stops the daily question at once.
    del('wa_practice_enrollments', 'user_id', 'WhatsApp practice enrolment (phone)'),
    del('wa_practice_deliveries', 'user_id', 'WhatsApp practice history'),
    del('practice_activity_days', 'user_id', 'practice activity'),
    // Guardian: the guardian's name, email and phone go with the learner.
    del('guardian_links', 'learner_id', 'guardian contact details'),
    // Study plans.
    del('study_plans', 'user_id', 'study plan'),
    del('study_practice_results', 'user_id', 'study plan practice'),
    // Skill passport, talent search, job matching, résumés.
    del('skill_passports', 'user_id', 'skill passport'),
    del('talent_invites', 'learner_id', 'talent-search invites'),
    del('job_match_prefs', 'user_id', 'job match preferences'),
    del('resumes', 'user_id', 'résumés'),
    del('resume_drafts', 'user_id', 'résumé drafts'),
    // Marketplace / mentoring: carts go; orders and bookings stay for the ledger, without contact data.
    del('mkt_carts', 'user_id', 'cart'),
    upd('mkt_orders', { buyer_id: uid }, { $set: { buyer_email: null, anonymised_at: at }, $unset: { shipping_address: '' } }, 'orders kept for accounting'),
    upd('mkt_reviews', { user_id: uid }, { $set: { user_id: ghost } }, 'reviews kept, author removed'),
    upd('mentor_session_meta', { buyer_id: uid }, { $set: { attachment: null } }, 'mentor sessions: drop shared code/link'),
    upd('mentor_profiles', { user_id: uid }, { $set: { listed: false, status: 'suspended', display_name: DELETED_NAME, headline: '', bio: '', linkedin_url: null, avatar_url: null, updated_at: at } }, 'mentor profile unlisted and blanked (bookings + payouts reference it)'),
    upd('mkt_sellers', { user_id: uid }, { $set: { status: 'suspended', display_name: DELETED_NAME, bio: '', logo_url: null, updated_at: at }, $unset: { contact_email: '', phone: '' } }, 'seller kept for ledger and payouts, contact removed'),
    // Cohorts: membership rows stay (seat counts, grades) without name/email; certificates are withdrawn.
    upd('cohort_members', { user_id: uid }, { $set: { name: DELETED_NAME, email: null } }, 'cohort membership anonymised'),
    upd('cohort_members', { user_id: uid, status: 'active' }, { $set: { status: 'dropped' } }, 'cohort membership ended'),
    upd('cohort_submissions', { user_id: uid }, { $set: { user_name: DELETED_NAME } }, 'cohort submissions anonymised'),
    del('cohort_certificates', 'user_id', 'cohort certificates'),
    // Proctored certifications: orders stay (payments), credentials are revoked and unnamed.
    upd('pro_cert_orders', { user_id: uid }, { $set: { user_email: null } }, 'certification orders kept for accounting'),
    upd('pro_cert_credentials', { user_id: uid }, { $set: { holder_name: DELETED_NAME, status: 'revoked', revoked_at: at, revoke_reason: 'account_deleted' } }, 'credentials revoked'),
    // Community: posts stay readable for the people who replied, without the author.
    upd('community_threads', { author_id: uid }, { $set: { author_id: ghost, author_name: DELETED_NAME } }, 'threads anonymised'),
    upd('community_replies', { author_id: uid }, { $set: { author_id: ghost, author_name: DELETED_NAME } }, 'replies anonymised'),
    upd('community_group_messages', { author_id: uid }, { $set: { author_id: ghost, author_name: DELETED_NAME } }, 'group messages anonymised'),
    upd('community_votes', { user_id: uid }, { $set: { user_id: ghost } }, 'votes kept (scores), voter removed'),
    upd('community_reports', { reporter_id: uid }, { $set: { reporter_id: ghost } }, 'moderation reports kept, reporter removed'),
    del('community_follows', 'user_id', 'thread follows'),
    del('community_profiles', 'user_id', 'community profile'),
    del('community_rep_events', 'user_id', 'reputation events'),
    del('community_group_members', 'user_id', 'group memberships'),
    // AI cost rows stay for spend reporting, without the user id.
    upd('ai_usage', { userId: uid }, { $set: { userId: ghost } }, 'AI usage kept for cost reporting'),
    upd('ai_usage_logs', { user_id: uid }, { $set: { user_id: ghost } }, 'AI usage log kept for cost reporting'),
    // Automation payloads keep running workflows' history, not the person.
    upd('automation_events', { 'payload.user_id': uid }, { $unset: { 'payload.email': '', 'payload.name': '', 'payload.phone': '' } }, 'automation payloads scrubbed'),
  ]
  if (ids.guardianLinkIds?.length) {
    ops.push({ kind: 'delete', collection: 'guardian_report_log', filter: { link_id: { $in: ids.guardianLinkIds } }, why: 'guardian report log' })
  }
  if (ids.sellerIds?.length) {
    ops.push(upd('mkt_products', { seller_id: { $in: ids.sellerIds }, status: { $ne: 'archived' } }, { $set: { status: 'archived', updated_at: at } }, 'seller products taken down'))
  }
  return ops
}

/** Collections the plan touches (for docs / tests). */
export function purgedCollections(): string[] {
  return [...new Set(accountPurgePlan('x', { guardianLinkIds: ['l'], sellerIds: ['s'] }).map((o) => o.collection))]
}

/**
 * Run the plan. Never throws: failures are returned (collection names only,
 * no personal data) so the caller can log them and the nightly scrub retries.
 */
export async function purgeAccountData(db: Db, uid: string, now = new Date()): Promise<{ ok: number; failed: string[] }> {
  if (!uid) return { ok: 0, failed: [] }
  const [links, sellers] = await Promise.all([
    db.collection('guardian_links').find({ learner_id: uid }, { projection: { _id: 0, id: 1 } }).toArray().catch(() => []),
    db.collection('mkt_sellers').find({ user_id: uid }, { projection: { _id: 0, id: 1 } }).toArray().catch(() => []),
  ])
  const ids = {
    guardianLinkIds: links.map((l) => String((l as { id?: unknown }).id || '')).filter(Boolean),
    sellerIds: sellers.map((s) => String((s as { id?: unknown }).id || '')).filter(Boolean),
  }
  // Link ids were read above, so report logs and links can go in parallel.
  const plan = accountPurgePlan(uid, ids, now)
  // The seller's products are archived below: note their ids so they leave the RAG index at once (RAG-024).
  const productIds = ids.sellerIds.length
    ? (await Promise.resolve().then(() => db.collection('mkt_products').find({ seller_id: { $in: ids.sellerIds }, status: { $ne: 'archived' } }, { projection: { _id: 0, id: 1 } }).limit(2000).toArray()).catch(() => [])).map((p) => String((p as { id?: unknown }).id || '')).filter(Boolean)
    : []
  const results = await Promise.allSettled(plan.map((op) => op.kind === 'delete'
    ? db.collection(op.collection).deleteMany(op.filter)
    : db.collection(op.collection).updateMany(op.filter, op.update)))
  const failed = results.flatMap((r, i) => (r.status === 'rejected' ? [plan[i].collection] : []))
  if (productIds.length) void import('@/lib/rag/hooks').then((h) => h.knowledgeOnMarketplaceProduct(productIds)).catch(() => {})
  return { ok: results.length - failed.length, failed }
}
