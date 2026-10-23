/**
 * Operations automations:
 *   AU-06 / A-036  email outbox retries (the queue itself lives in lib/automation/outbox.ts)
 *   AU-13          admin alerts: stale cron heartbeats, email / payment failure spikes,
 *                  dead-lettered runs and webhooks, queue backlogs → email + Slack/Teams
 *   AU-14          nightly data hygiene and retention
 */
import { getMongoDb } from '@/lib/mongodb'
import { sendAdminAlert } from '../alerts'
import { processOutbox } from '../outbox'
import { claimOnce, nowIso } from '../store'
import { configValue, getSystemSettings } from '../settings'
import { isSpike, staleCrons, type CronHeartbeat } from './rules'
import type { SystemAutomation } from './types'

const HOUR = 3_600_000

/**
 * Heartbeats we expect, with their normal interval in minutes: every job in
 * the shared registry (lib/automation/job-registry.ts) plus every scheduled
 * built-in automation (`auto:<id>`), so a new job is watched automatically.
 */
export async function expectedHeartbeatMap(): Promise<Record<string, number>> {
  const { expectedHeartbeats } = await import('../job-registry')
  const { SYSTEM_AUTOMATIONS } = await import('./registry')
  const { cadenceMinutes } = await import('./rules')
  const out = expectedHeartbeats()
  for (const a of SYSTEM_AUTOMATIONS) if (a.cadence && a.run) out[`auto:${a.id}`] = cadenceMinutes(a.cadence)
  return out
}

export async function runOpsAlerts(now = new Date()): Promise<{ alerts: number }> {
  const db = await getMongoDb()
  const since = new Date(now.getTime() - HOUR).toISOString()
  let alerts = 0
  const fire = async (a: Parameters<typeof sendAdminAlert>[0]) => {
    if (await sendAdminAlert(a, now)) alerts++
  }

  // 1. Cron heartbeats that stopped.
  const expected = await expectedHeartbeatMap()
  // Only jobs whose switch is on are expected to beat.
  const { isAutomationEnabled } = await import('../settings')
  const { SYSTEM_AUTOMATIONS } = await import('./registry')
  for (const a of SYSTEM_AUTOMATIONS) if (!(await isAutomationEnabled(a.id, a.defaultOn !== false))) delete expected[`auto:${a.id}`]
  const rows = (await db.collection('cron_runs').find({ id: { $in: Object.keys(expected) } }, { projection: { _id: 0 } }).toArray()) as unknown as CronHeartbeat[]
  const stale = staleCrons(rows, expected, now)
  if (stale.length) await fire({ key: `cron-stale:${stale.sort().join(',')}`, title: 'Scheduled jobs stopped running', detail: `No recent run for: ${stale.join(', ')}. Check the app server (or the /api/cron/tick schedule on serverless hosts).`, severity: 'critical', link: '/dashboard/admin/cron-jobs' })
  const failing = rows.filter((r) => r.last_status === 'error' && Date.parse(r.last_run_at) > now.getTime() - HOUR)
  if (failing.length) await fire({ key: `cron-failing:${failing.map((r) => r.id).sort().join(',')}`, title: 'Scheduled jobs are failing', detail: `Last run failed for: ${failing.map((r) => r.id).join(', ')}.`, severity: 'warning', link: '/dashboard/admin/cron-jobs' })

  // 2. Email failures (provider errors + bounces) and dead outbox messages.
  const [emailTotal, emailFailed, outboxDead] = await Promise.all([
    db.collection('email_logs').countDocuments({ created_at: { $gte: since } }),
    db.collection('email_logs').countDocuments({ created_at: { $gte: since }, $or: [{ delivery_status: { $in: ['failed', 'bounced'] } }, { postal_message_id: null }] }),
    db.collection('email_outbox').countDocuments({ status: 'dead', updated_at: { $gte: since } }),
  ])
  if (isSpike(emailFailed, emailTotal) || outboxDead >= 3) await fire({ key: 'email-failures', title: 'Emails are failing', detail: `${emailFailed} of ${emailTotal} emails failed in the last hour; ${outboxDead} gave up after retries. Check Postal (Settings → Integrations).`, severity: 'critical', link: '/dashboard/admin/security/email-monitoring' })

  // 3. Payment failures.
  const [payFailed, payOk] = await Promise.all([
    db.collection('automation_events').countDocuments({ type: 'payment.failed', created_at: { $gte: since } }),
    db.collection('automation_events').countDocuments({ type: 'payment.succeeded', created_at: { $gte: since } }),
  ])
  if (isSpike(payFailed, payFailed + payOk)) await fire({ key: 'payment-failures', title: 'Payment failures spiked', detail: `${payFailed} failed vs ${payOk} successful payments in the last hour. Check the payment gateway dashboards.`, severity: 'critical', link: '/dashboard/admin/billing' })

  // 4. Dead-lettered runs, jobs, events and webhooks.
  const dead = await db.collection('automation_dead_letters').aggregate([
    { $match: { created_at: { $gte: since } } },
    { $group: { _id: '$kind', n: { $sum: 1 } } },
  ]).toArray() as { _id: string; n: number }[]
  const deadTotal = dead.reduce((s, r) => s + r.n, 0)
  if (deadTotal >= 5) await fire({ key: 'dead-letters', title: 'Automations are failing', detail: `In the last hour: ${dead.map((r) => `${r.n} ${r._id}(s)`).join(', ')} failed after all retries.`, severity: 'warning', link: '/dashboard/admin/automations' })
  const webhookErrors = await db.collection('github_webhook_events').countDocuments({ created_at: { $gte: since }, status: 'error' }).catch(() => 0)
  if (webhookErrors >= 5) await fire({ key: 'webhook-errors', title: 'Incoming webhooks are failing', detail: `${webhookErrors} GitHub webhook deliveries failed in the last hour.`, severity: 'warning', link: '/dashboard/admin/cron-jobs' })

  // 5. Queue backlog.
  const old = new Date(now.getTime() - 15 * 60_000).toISOString()
  const [events, outbox, jobs, runs] = await Promise.all([
    db.collection('automation_events').countDocuments({ status: { $in: ['pending', 'retry'] }, created_at: { $lt: old } }),
    db.collection('email_outbox').countDocuments({ status: 'pending', next_attempt_at: { $lt: old } }),
    db.collection('automation_jobs').countDocuments({ status: 'pending', run_at: { $lt: old } }),
    db.collection('workflow_runs').countDocuments({ status: 'waiting', resume_at: { $lt: old } }),
  ])
  if (events > 100 || outbox > 100 || jobs > 200 || runs > 100) await fire({ key: 'backlog', title: 'Automation queues are backing up', detail: `Overdue: ${events} events, ${outbox} emails, ${jobs} jobs, ${runs} workflow runs. The scheduler may be overloaded or stopped.`, severity: 'warning', link: '/dashboard/admin/automations' })
  return { alerts }
}

// ─── AU-14 hygiene ──────────────────────────────────────────────────────────

/** Audit actions that mean "this account was deleted" (self-service and admin). */
export const DELETION_ACTIONS = ['user.delete_self', 'admin.user.delete', 'admin.user_delete', 'user.delete'] as const

/**
 * The deleted account's id from an audit row (AUTO-031). Admin deletions log
 * the ADMIN as user_id and the deleted account as resource 'user/<id>', so
 * the resource always wins; only a self-deletion may fall back to user_id.
 */
export function deletedUserIdFromAudit(row: { action?: string; user_id?: string; resource?: string }): string | null {
  const res = String(row.resource || '')
  if (res.startsWith('user/') && res.length > 5) return res.slice(5)
  if (row.action === 'user.delete_self' && typeof row.user_id === 'string' && row.user_id) return row.user_id
  return null
}

export async function runDataHygiene(now = new Date()): Promise<Record<string, number>> {
  const db = await getMongoDb()
  const cfg = (await getSystemSettings()).config
  const ago = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString()
  const out: Record<string, number> = {}
  const del = async (name: string, collection: string, filter: Record<string, unknown>) => {
    const r = await db.collection(collection).deleteMany(filter).catch(() => ({ deletedCount: 0 }))
    out[name] = r.deletedCount || 0
  }

  const proctorDays = configValue(cfg, 'retention_proctor_days')
  if (proctorDays > 0) await del('proctor_events', 'proctor_events', { created_at: { $lt: ago(proctorDays) } })
  const emailDays = configValue(cfg, 'retention_email_log_days')
  if (emailDays > 0) await del('email_logs', 'email_logs', { created_at: { $lt: ago(emailDays) } })
  // Identity photos / recordings have their own retention job (lib/identity-media.ts via lib/platform-cron.ts).
  const runDays = configValue(cfg, 'retention_run_days')
  if (runDays > 0) await del('workflow_runs', 'workflow_runs', { status: { $in: ['success', 'failed', 'partial', 'cancelled'] }, started_at: { $lt: ago(runDays) } })
  await del('automation_events', 'automation_events', { status: { $in: ['done', 'dead'] }, created_at: { $lt: ago(60) } })
  await del('automation_jobs', 'automation_jobs', { status: { $in: ['done', 'cancelled', 'dead'] }, updated_at: { $lt: ago(30) } })
  await del('automation_sends', 'automation_sends', { created_at: { $lt: ago(400) } })
  await del('email_outbox', 'email_outbox', { status: { $in: ['sent', 'dead', 'suppressed'] }, updated_at: { $lt: ago(14) } })
  await del('notification_deferred', 'notification_deferred', { status: { $in: ['sent', 'failed'] }, created_at: { $lt: ago(30) } })
  await del('automation_quota', 'automation_quota', { created_at: { $lt: ago(30) } })

  // Stale invites: same marker the invite page uses, so "renew" still works.
  const inv = await db.collection('candidate_invites').updateMany(
    { status: { $in: ['pending', 'active'] }, expires_at: { $lt: now.toISOString() } },
    { $set: { status: 'expired', expired_reason: 'date', updatedAt: nowIso() } },
  ).catch(() => ({ modifiedCount: 0 }))
  out.invites_expired = inv.modifiedCount || 0

  // Accounts deleted by their owners or by an admin: scrub personal data left in organisation records.
  const deletions = (await db.collection('admin_audit_logs').find({ action: { $in: [...DELETION_ACTIONS] }, created_at: { $gte: ago(7) } }, { projection: { action: 1, user_id: 1, resource: 1 } }).limit(500).toArray()) as { action?: string; user_id?: string; resource?: string }[]
  let anonymised = 0
  for (const d of deletions) {
    const uid = deletedUserIdFromAudit(d)
    if (!uid) continue
    const still = await db.collection('user').countDocuments({ $or: [{ id: uid }, { _id: uid as never }] }, { limit: 1 })
    if (still || !(await claimOnce(`anon:${uid}`))) continue
    await Promise.allSettled([
      db.collection('exam_submissions').updateMany({ user_id: uid }, { $set: { email: null, anonymised_at: nowIso() }, $unset: { id_photo: '', face_photo: '', device_info: '' } }),
      db.collection('exam_identity_checks').deleteMany({ user_id: uid }),
      db.collection('certification_attempts').updateMany({ user_id: uid }, { $unset: { 'snapshot.email': '' } }),
      db.collection('automation_events').updateMany({ 'payload.user_id': uid }, { $unset: { 'payload.email': '', 'payload.name': '' } }),
      db.collection('email_unsubscribes').deleteMany({ user_id: uid }),
      // AUTO-085: the full account cascade (WhatsApp practice, guardians, study plans, mentors, cohorts, community, AI usage…).
      import('@/lib/account-purge').then((m) => m.purgeAccountData(db, uid, now)),
    ])
    anonymised++
  }
  out.accounts_anonymised = anonymised
  return out
}

export const OPS_AUTOMATIONS: SystemAutomation[] = [
  {
    id: 'email-outbox',
    title: 'Email retries and bounce suppression',
    description: 'Emails that fail for a temporary reason are queued and retried with growing gaps (up to 6 tries), then reported. Addresses that hard-bounce or complain are never emailed again.',
    group: 'Operations',
    refs: ['AU-06', 'A-036', 'A-038'],
    cadence: { kind: 'interval', minutes: 1 },
    run: async (now) => processOutbox(now),
    defaultOn: true,
  },
  {
    id: 'admin-alerts',
    title: 'Admin and operations alerts',
    description: 'Every 5 minutes: alerts superadmins (email, in-app and an optional Slack/Teams channel) when scheduled jobs stop or fail, emails or payments fail in bulk, automations dead-letter, webhooks fail or queues back up. One alert per problem per hour.',
    group: 'Operations',
    refs: ['AU-13'],
    cadence: { kind: 'interval', minutes: 5 },
    run: async (now) => runOpsAlerts(now),
  },
  {
    id: 'data-hygiene',
    title: 'Data hygiene and retention',
    description: 'Nightly: removes old proctoring events and email logs after the retention periods below, cleans finished automation records, expires stale invites and scrubs personal data left behind by deleted accounts.',
    group: 'Operations',
    refs: ['AU-14'],
    cadence: { kind: 'daily', hourUtc: 2 },
    run: async (now) => runDataHygiene(now),
  },
]
