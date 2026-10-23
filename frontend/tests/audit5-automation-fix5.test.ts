/**
 * Audit-5 automation fixes (AUTO-080 … AUTO-091): account purge plan, due-row
 * filters for hourly sweeps, job registry coverage, cron-route catch-up,
 * weekly digest helpers and the new automation events.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(__dirname, '..')
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

describe('account purge (AUTO-085)', () => {
  it('covers every feature that stores personal data', async () => {
    const { purgedCollections } = await import('@/lib/account-purge')
    const cols = purgedCollections()
    for (const c of [
      'wa_practice_enrollments', 'wa_practice_deliveries', 'guardian_links', 'guardian_report_log', 'study_plans', 'study_practice_results',
      'mentor_profiles', 'mentor_session_meta', 'mkt_orders', 'cohort_members', 'cohort_certificates', 'community_threads', 'community_replies',
      'skill_passports', 'talent_invites', 'push_tokens', 'web_push_subscriptions', 'subscriptions', 'digest_sends', 'ai_usage', 'ai_usage_logs',
      'resumes', 'job_match_prefs', 'pro_cert_credentials', 'user_sessions', 'notifications',
    ]) expect(cols, c).toContain(c)
  })

  it('anonymises money / community records instead of deleting them', async () => {
    const { accountPurgePlan, tombstoneId, DELETED_NAME } = await import('@/lib/account-purge')
    const plan = accountPurgePlan('u1', {}, new Date('2026-10-23T00:00:00Z'))
    const op = (c: string) => plan.filter((o) => o.collection === c)
    expect(op('mkt_orders')[0].kind).toBe('update')
    expect(op('ai_usage')[0]).toMatchObject({ kind: 'update', filter: { userId: 'u1' }, update: { $set: { userId: tombstoneId('u1') } } })
    expect(op('community_replies')[0]).toMatchObject({ kind: 'update', update: { $set: { author_name: DELETED_NAME } } })
    expect(op('wa_practice_enrollments')[0]).toMatchObject({ kind: 'delete', filter: { user_id: 'u1' } })
    expect(op('guardian_links')[0]).toMatchObject({ kind: 'delete', filter: { learner_id: 'u1' } })
    // Tombstones are stable, not reversible and differ per user.
    expect(tombstoneId('u1')).toBe(tombstoneId('u1'))
    expect(tombstoneId('u1')).not.toContain('u1')
    expect(tombstoneId('u1')).not.toBe(tombstoneId('u2'))
    // Ids looked up first add the dependent steps.
    const full = accountPurgePlan('u1', { guardianLinkIds: ['l1'], sellerIds: ['s1'] })
    expect(full.find((o) => o.collection === 'guardian_report_log')?.filter).toEqual({ link_id: { $in: ['l1'] } })
    expect(full.find((o) => o.collection === 'mkt_products')?.kind).toBe('update')
  })

  it('runs every step, reports failures by collection and never throws', async () => {
    const { purgeAccountData, accountPurgePlan } = await import('@/lib/account-purge')
    const calls: string[] = []
    const db = {
      collection: (name: string) => ({
        find: () => ({ toArray: async () => (name === 'guardian_links' ? [{ id: 'l1' }] : []) }),
        deleteMany: async () => { calls.push(`del:${name}`); if (name === 'resumes') throw new Error('boom'); return { deletedCount: 1 } },
        updateMany: async () => { calls.push(`upd:${name}`); return { modifiedCount: 1 } },
      }),
    }
    const r = await purgeAccountData(db as never, 'u1')
    expect(r.failed).toEqual(['resumes'])
    expect(r.ok).toBe(accountPurgePlan('u1', { guardianLinkIds: ['l1'] }).length - 1)
    expect(calls).toContain('del:guardian_report_log')
    expect(calls).toContain('del:wa_practice_enrollments')
    expect(await purgeAccountData(db as never, '')).toEqual({ ok: 0, failed: [] })
  })

  it('is used by self-deletion, admin deletion and the nightly scrub', () => {
    expect(read('app/api/user/delete-account/route.ts')).toContain('purgeAccountData(')
    expect(read('app/api/admin/users/[userId]/route.ts')).toContain('purgeAccountData(')
    expect(read('lib/automation/system/ops.ts')).toContain('purgeAccountData(')
  })
})

describe('hourly sweeps read only due rows (AUTO-082)', () => {
  it('WhatsApp practice: one clause per timezone in use at its local hour', async () => {
    const { dueEnrollmentFilter } = await import('@/lib/wa-practice/logic')
    const now = new Date('2026-10-23T13:30:00Z') // 19:00 IST, 09:30 New York
    const f = dueEnrollmentFilter(['Asia/Kolkata', 'America/New_York', null, 'Asia/Kolkata'], now) as { $or: Array<Record<string, unknown>> }
    expect(f).toMatchObject({ status: 'active', confirmed: { $ne: null } })
    expect(f.$or).toHaveLength(3)
    expect(f.$or[0]).toEqual({ timezone: 'Asia/Kolkata', send_hour: 19, last_daily_day: { $ne: '2026-10-23' } })
    expect(f.$or[1]).toMatchObject({ timezone: 'America/New_York', send_hour: 9 })
    expect(f.$or[2]).toMatchObject({ timezone: { $in: [null, ''] }, send_hour: 19 })
    expect(dueEnrollmentFilter([], now)).toEqual({ _id: { $exists: false } })
  })

  it('guardian reports: only timezones whose report time has come', async () => {
    const { dueLinkFilter, reportDue } = await import('@/lib/guardian/summary')
    const now = new Date('2026-10-25T14:00:00Z')
    const zones = ['Asia/Kolkata', 'America/Los_Angeles']
    const f = dueLinkFilter(zones, now) as { $or?: Array<Record<string, unknown>> }
    const dueZones = zones.filter((z) => reportDue(now, z, null).due)
    if (!dueZones.length) expect(f).toEqual({ _id: { $exists: false } })
    else {
      expect(f.$or?.map((c) => c.timezone)).toEqual(dueZones)
      for (const c of f.$or!) expect(c.last_report_week).toEqual({ $ne: reportDue(now, String(c.timezone), null).week })
    }
  })

  it('no fixed 5,000-row cap remains', () => {
    expect(read('lib/wa-practice/service.ts')).not.toContain('5000')
    expect(read('lib/guardian/service.ts')).not.toMatch(/limit\(opts\.max \?\? 5000\)/)
  })
})

describe('job registry covers every scheduled job (AUTO-083 / AUTO-084)', () => {
  it('every job()/run()/withCronHeartbeat id is registered', async () => {
    const { SCHEDULED_JOBS } = await import('@/lib/automation/job-registry')
    const ids = new Set(SCHEDULED_JOBS.map((j) => j.id))
    const names = new Set<string>()
    for (const f of ['lib/scheduler.ts', 'lib/platform-cron.ts']) {
      for (const m of read(f).matchAll(/\b(?:job|run)\('([a-z0-9-]+)'/g)) names.add(m[1])
    }
    const cronDir = path.join(ROOT, 'app/api/cron')
    for (const d of fs.readdirSync(cronDir)) {
      const p = path.join(cronDir, d, 'route.ts')
      if (!fs.existsSync(p)) continue
      for (const m of fs.readFileSync(p, 'utf8').matchAll(/withCronHeartbeat\('([a-z0-9-]+)'/g)) names.add(m[1])
    }
    expect(names.size).toBeGreaterThan(30)
    expect([...names].filter((n) => !ids.has(n))).toEqual([])
    expect(new Set(SCHEDULED_JOBS.map((j) => j.id)).size).toBe(SCHEDULED_JOBS.length)
  })

  it('a stopped required job is watched by the stale-heartbeat alert', async () => {
    const { expectedHeartbeats } = await import('@/lib/automation/job-registry')
    const e = expectedHeartbeats()
    for (const id of ['guardian-reports', 'referral-rewards', 'licence-expiry', 'pro-cert-sweep', 'knowledge', 'study-plans', 'wa-practice']) expect(e[id], id).toBeGreaterThan(0)
    expect(e.tick).toBeUndefined() // serverless only: optional
  })

  it('the knowledge tick runs in the shared runner, not only the in-process loop', () => {
    const src = read('lib/scheduler.ts')
    expect(src).toMatch(/job\('knowledge', minute/)
    expect(src.match(/runKnowledgeTick/g)?.length).toBe(1)
  })
})

describe('cron routes catch up a missed slot (AUTO-087)', () => {
  it('finds the slot and runs once after it within the catch-up window', async () => {
    const { previousCronSlot, scheduledRouteSlot, catchUpMinutes, SCHEDULED_ROUTES } = await import('@/lib/platform-cron')
    const weekly = SCHEDULED_ROUTES.find((r) => r.id === 'weekly-digest')!
    expect(catchUpMinutes(10080)).toBe(720)
    expect(catchUpMinutes(5)).toBe(2)
    // Server restarted at Monday 09:00; first tick at 09:07.
    const at = new Date('2026-10-19T09:07:00Z')
    expect(previousCronSlot(weekly.cron, at, 720)?.toISOString()).toBe('2026-10-19T09:00:00.000Z')
    expect(scheduledRouteSlot(weekly, at, '2026-10-12T09:01:00Z')?.toISOString()).toBe('2026-10-19T09:00:00.000Z')
    // Already done for this slot → nothing.
    expect(scheduledRouteSlot(weekly, at, '2026-10-19T09:00:30Z')).toBeNull()
    // Too late (next day) → wait for next week.
    expect(scheduledRouteSlot(weekly, new Date('2026-10-20T09:07:00Z'), '2026-10-12T09:01:00Z')).toBeNull()
    expect(SCHEDULED_ROUTES.filter((r) => r.long).map((r) => r.id).sort()).toEqual(['ebooks-daily', 'security-scan', 'signals-ingest'])
  })
})

describe('weekly digest (AUTO-080)', () => {
  it('targets recently active learners, one period per week, skips empty weeks', async () => {
    const { weeklyRecipientFilter, weeklyPeriod, weeklyDigestWorthSending } = await import('@/lib/digest/weekly-personal')
    const now = new Date('2026-10-23T09:00:00Z')
    const f = weeklyRecipientFilter(now) as { lastLoginAt: { $gte: Date } }
    expect(f.lastLoginAt.$gte.toISOString()).toBe('2026-09-23T09:00:00.000Z')
    expect(weeklyPeriod(now)).toBe('2026-10-19')
    expect(weeklyPeriod(new Date('2026-10-19T00:00:00Z'))).toBe('2026-10-19')
    expect(weeklyDigestWorthSending({ solved: 0, streak: 0, events: [] })).toBe(false)
    expect(weeklyDigestWorthSending({ solved: 2, streak: 0, events: [] })).toBe(true)
  })

  it('renders the reader’s own week in their language with no platform counts', async () => {
    const { emailTemplatesFor } = await import('@/lib/email-templates')
    const en = emailTemplatesFor('en').weeklyDigestEmail({ name: 'Asha', solved: 3, streak: 5, events: [{ title: 'Hack <night>', url: 'https://x/e', deadline: '2026-10-30T00:00:00Z' }] })
    expect(en.html).toContain('Asha')
    expect(en.html).toContain('Hack &lt;night&gt;')
    expect(en.html).not.toMatch(/new users joined/i)
    const hi = emailTemplatesFor('hi').weeklyDigestEmail({ name: 'Asha', solved: 0, streak: 0, events: [] })
    expect(hi.subject).toMatch(/[ऀ-ॿ]/)
  })
})

describe('automation events for newer features (AUTO-088 / 089 / 090)', () => {
  it('catalogs the new events, tenant-scoped (organisation workflows can use them)', async () => {
    const { EVENT_TYPES, eventTypesFor } = await import('@/lib/automation/event-types')
    const org = new Set(eventTypesFor(false).map((e) => e.type))
    for (const t of ['subscription.started', 'subscription.cancelled', 'mentor.booking.created', 'drive.scheduled', 'offer.sent', 'offer.accepted', 'pro_cert.passed', 'bgv.started', 'cohort.completed', 'referral.rewarded', 'licence.expiring', 'study_plan.created', 'wa_practice.enrolled', 'talent.invite.sent', 'community.thread.created']) {
      expect(org.has(t), t).toBe(true)
    }
    for (const e of EVENT_TYPES) for (const f of e.fields) expect(Object.keys(e.sample), `${e.type}.${f.key}`).toContain(f.key)
    // Never a phone number in a WhatsApp-practice event.
    expect(EVENT_TYPES.find((e) => e.type === 'wa_practice.enrolled')!.fields.map((f) => f.key)).not.toContain('phone')
  })

  it('emits at the write points with idempotency keys', () => {
    const at: Array<[string, string]> = [
      ['lib/billing-plans.ts', 'subscription.started:'], ['lib/billing-plans.ts', 'subscription.cancelled:'],
      ['lib/marketplace/settle.ts', 'mentor.booking.created:'], ['lib/live-drives/service.ts', 'drive.scheduled:live:'],
      ['lib/campus/drives.ts', 'drive.scheduled:campus:'], ['lib/campus/drives.ts', 'emitOfferEvent'],
      ['lib/pro-certs/service.ts', 'pro_cert.passed:'], ['lib/pro-certs/service.ts', 'certificate.issued:pcert:'],
      ['lib/cohorts/service.ts', 'certificate.issued:cohort:'], ['lib/cohorts/service.ts', 'cohort.completed:'],
      ['lib/ats/bgv/service.ts', 'bgv.started:'], ['lib/billing/referrals.ts', 'referral.rewarded:'], ['lib/billing/licences.ts', 'licence.expiring:'],
      ['lib/ats/interviews/service.ts', 'interview.cancelled:'],
    ]
    for (const [file, key] of at) expect(read(file), `${file} ${key}`).toContain(key)
  })
})

describe('small fixes (AUTO-081 / 086 / 091)', () => {
  it('a rescheduled booking is picked up by the reminder sweep', () => {
    expect(read('lib/mentors/sessions.ts')).toContain("$unset: { reminder_sent_at: '' }")
    expect(read('lib/marketplace/settle.ts')).not.toContain('reminder_sent_at: { $exists: false }')
  })
  it('the daily ebook draft is off unless enabled', () => {
    expect(read('app/api/cron/ebooks-daily/route.ts')).toContain("skipped: 'disabled'")
    expect(read('lib/ebooks-settings.ts')).toContain('auto_draft_enabled: false')
  })
  it('a failed budget alert releases its claim', () => {
    expect(read('lib/ai/usage-record.ts')).toContain('$pull: { alerts: t }')
  })
})
