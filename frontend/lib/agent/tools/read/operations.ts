/**
 * Read tools for the newer operations modules (AGT-033): tech-news review queue, social studio
 * queue, community moderation queue, mentor marketplace, cohort courses, coupons + organisation
 * licences, paid (pro) certification reviews and live proctored drives.
 *
 * Each calls the same lib/* service the admin UI uses. Platform-wide modules (news, social,
 * coupons, mentors, pro certifications) are superadmin only; per-organisation ones (cohorts,
 * licences, live drives) are tenant scoped — a tenant admin sees their own organisation, a
 * superadmin scoped to an organisation stays inside it (AGT-004).
 * Third-party / member text (forum posts, mentor bios, news drafts) is clipped and returned as
 * data; the runtime fences tool output as untrusted.
 */
import { ToolInputError } from '@/lib/agent/contract'
import type { AgentCaller } from '@/lib/agent/contract'
import { readTool } from '../define'
import { argsObject, optEnum, optInt, optString } from '../args'
import { clip } from '../output'
import { atsCall } from '../ats-shared'
import { serviceUser } from '../scope'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Doc = Record<string, any>
const SUPER = ['superadmin'] as const
const money = (minor: unknown, currency: unknown) => (typeof minor === 'number' ? `${(minor / 100).toFixed(2)} ${String(currency || '')}`.trim() : null)

/** Organisation records the caller may see (pure): unscoped superadmin → all; otherwise own organisation only. */
export function inCallerOrg(caller: Pick<AgentCaller, 'role' | 'tenantId'>, tenantId: unknown): boolean {
  if (caller.role === 'superadmin' && !caller.tenantId) return true
  return !!caller.tenantId && tenantId === caller.tenantId
}

// ─── Tech news review queue ──────────────────────────────────────────────────

export const listPendingNewsTool = readTool({
  name: 'list_pending_news',
  roles: [...SUPER],
  description: 'Tech news (Signals) drafts waiting for review, or by status. Shows why each needs a human: untrusted feed, no AI pass, prompt-guard flags, or the fact verifier finding unsupported numbers / names / claims.',
  parameters: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['pending', 'published', 'rejected', 'any'] },
      since_hours: { type: 'integer', minimum: 1, maximum: 720, description: 'Only drafts created in the last N hours (e.g. 24 for "today").' },
      limit: { type: 'integer', minimum: 1, maximum: 50 },
    },
  },
  parse(raw) {
    const r = argsObject(raw, ['status', 'since_hours', 'limit'])
    return { status: optEnum(r, 'status', ['pending', 'published', 'rejected', 'any'] as const) ?? 'pending', since_hours: optInt(r, 'since_hours', 1, 720), limit: optInt(r, 'limit', 1, 50) ?? 20 }
  },
  async run(a) {
    const { draftsCol } = await import('@/lib/signals/store')
    const q: Doc = {}
    if (a.status !== 'any') q.status = a.status
    if (a.since_hours) q.created_at = { $gte: new Date(Date.now() - a.since_hours * 3600_000).toISOString() }
    const col = await draftsCol()
    const [total, rows] = await Promise.all([col.countDocuments(q), col.find(q, { projection: { _id: 0, body: 0 } }).sort({ created_at: -1 }).limit(a.limit).toArray()])
    return {
      data: {
        total,
        drafts: (rows as Doc[]).map((d) => ({
          id: d.id, title: clip(d.title, 140), excerpt: clip(d.excerpt, 200), status: d.status, topic: d.topic ?? null, feed: d.source_feed, source_url: d.source_url,
          trusted_feed: !!d.trusted, ai_rewritten: d.ai_rewritten !== false, prompt_guard_flags: (d.flags || []).slice(0, 5),
          fact_check: d.fact_check ? { ok: d.fact_check.ok, unsupported_numbers: d.fact_check.numbers, unsupported_names: d.fact_check.names, unsupported_claims: d.fact_check.claims } : null,
          facts: Array.isArray(d.facts) ? d.facts.slice(0, 5).map((f: Doc) => clip(f.claim, 160)) : [],
          url: d.blog_slug ? `/news/${d.blog_slug}` : null, created_at: d.created_at,
        })),
        link: '/dashboard/admin/signals',
      },
    }
  },
})

// ─── Social studio ───────────────────────────────────────────────────────────

export const listSocialQueueTool = readTool({
  name: 'list_social_queue',
  roles: [...SUPER],
  description: 'Social studio queue: items (events, news, contests, Learn posts…) ready to share, with which networks they were already posted to and whether captions are drafted.',
  parameters: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['all', 'not_posted', 'posted'] },
      q: { type: 'string', maxLength: 100 },
      limit: { type: 'integer', minimum: 1, maximum: 50 },
    },
  },
  parse(raw) {
    const r = argsObject(raw, ['status', 'q', 'limit'])
    return { status: optEnum(r, 'status', ['all', 'not_posted', 'posted'] as const) ?? 'not_posted', q: optString(r, 'q', { max: 100 }), limit: optInt(r, 'limit', 1, 50) ?? 20 }
  },
  async run(a) {
    const [{ queueCol }, { queueMongoFilter }] = await Promise.all([import('@/lib/social/store'), import('@/lib/social/queue')])
    const filter = queueMongoFilter({ status: a.status, page: 1, ...(a.q ? { q: a.q } : {}) } as never)
    const col = await queueCol()
    const [total, rows] = await Promise.all([col.countDocuments(filter as never), col.find(filter as never, { projection: { _id: 0 } }).sort({ published_at: -1 }).limit(a.limit).toArray()])
    return {
      data: {
        total,
        items: (rows as Doc[]).map((it) => ({
          id: it.id, type: it.type, title: clip(it.title, 140), url: it.url, published_at: it.published_at,
          posted_to: Object.keys(it.posts || {}), captions_drafted: Object.keys(it.captions || {}).length > 0,
        })),
        link: '/dashboard/admin/social',
      },
    }
  },
})

// ─── Community moderation ────────────────────────────────────────────────────

export const listForumReportsTool = readTool({
  name: 'list_forum_reports',
  description: 'Community forum moderation queue: posts held by the auto-moderator and open member reports (forum moderators and platform admins only).',
  parameters: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 50 } } },
  parse(raw) {
    const r = argsObject(raw, ['limit'])
    return { limit: optInt(r, 'limit', 1, 50) ?? 20 }
  },
  async run(a, ctx) {
    const { moderationQueue } = await import('@/lib/community/service')
    const q = (await atsCall(() => moderationQueue(serviceUser(ctx.caller) as never))) as { pending: Doc[]; reports: Doc[] }
    return {
      data: {
        pending_total: q.pending.length,
        reports_total: q.reports.length,
        pending: q.pending.slice(0, a.limit).map((p) => ({ type: p.type, id: p.id, thread_id: p.thread_id, title: clip(p.title, 120) || null, excerpt: clip(p.body, 240), author_id: p.author_id, author: clip(p.author_name, 60), reasons: (p.reasons || []).slice(0, 5), created_at: p.created_at })),
        reports: q.reports.slice(0, a.limit).map((r) => ({ id: r.id, target_type: r.target_type, target_id: r.target_id, reason: clip(r.reason, 160), target_excerpt: clip(r.target?.title || r.target?.body, 200) || null, target_status: r.target?.status ?? null, author_id: r.target?.author_id ?? null, created_at: r.created_at })),
        link: '/dashboard/community/moderation',
      },
    }
  },
})

// ─── Mentors ─────────────────────────────────────────────────────────────────

export const listMentorsTool = readTool({
  name: 'list_mentors',
  roles: [...SUPER],
  description: 'Mentor marketplace profiles by status (pending = waiting for verification), with seller and KYC status.',
  parameters: { type: 'object', properties: { status: { type: 'string', enum: ['pending', 'verified', 'rejected', 'suspended', 'any'] }, limit: { type: 'integer', minimum: 1, maximum: 50 } } },
  parse(raw) {
    const r = argsObject(raw, ['status', 'limit'])
    return { status: optEnum(r, 'status', ['pending', 'verified', 'rejected', 'suspended', 'any'] as const) ?? 'pending', limit: optInt(r, 'limit', 1, 50) ?? 20 }
  },
  async run(a) {
    const { listMentorsAdmin } = await import('@/lib/mentors/service')
    const rows = (await listMentorsAdmin(a.status === 'any' ? null : a.status)) as Doc[]
    return {
      data: {
        total: rows.length,
        mentors: rows.slice(0, a.limit).map((m) => ({ id: m.id, name: clip(m.display_name, 80), headline: clip(m.headline, 140), skills: (m.skills || []).slice(0, 8), experience_years: m.experience_years, status: m.status, listed: !!m.listed, seller_status: m.seller_status, kyc_status: m.kyc_status, review_note: clip(m.review_note, 160) || null, slug: m.slug })),
        link: '/dashboard/admin/mentors',
      },
    }
  },
})

// ─── Cohorts ─────────────────────────────────────────────────────────────────

export const listCohortsTool = readTool({
  name: 'list_cohorts',
  description: 'Cohort courses (live, scheduled batches): status, dates, capacity and enrolment. Organisation admins see their own organisation.',
  parameters: { type: 'object', properties: { status: { type: 'string', enum: ['draft', 'open', 'running', 'completed', 'any'] }, limit: { type: 'integer', minimum: 1, maximum: 50 } } },
  parse(raw) {
    const r = argsObject(raw, ['status', 'limit'])
    return { status: optEnum(r, 'status', ['draft', 'open', 'running', 'completed', 'any'] as const) ?? 'any', limit: optInt(r, 'limit', 1, 50) ?? 20 }
  },
  async run(a, ctx) {
    const { listCohorts } = await import('@/lib/cohorts/service')
    const rows = ((await listCohorts(serviceUser(ctx.caller) as never)) as Doc[])
      // Own organisation's cohorts (a scoped superadmin also sees platform cohorts, like canManage()).
      .filter((c) => inCallerOrg(ctx.caller, c.tenant_id ?? null) || (ctx.caller.role === 'superadmin' && !c.tenant_id))
      .filter((c) => a.status === 'any' || c.status === a.status)
    return {
      data: {
        total: rows.length,
        cohorts: rows.slice(0, a.limit).map((c) => ({ id: c.id, title: clip(c.title, 120), status: c.status, starts_at: c.starts_at, ends_at: c.ends_at, timezone: c.timezone, capacity: c.capacity, enrolled: c.enrolled_count, access: c.access ? { free: !!c.access.free, entitlement: !!c.access.entitlement, licence_orgs: (c.access.licence_org_ids || []).length, paid_product: !!c.access.marketplace_product_id } : null, tenant_id: c.tenant_id ?? null })),
        link: '/dashboard/cohorts',
      },
    }
  },
})

// ─── Coupons + licences ──────────────────────────────────────────────────────

export const listCouponsTool = readTool({
  name: 'list_coupons',
  roles: [...SUPER],
  description: 'Platform billing coupons: code, discount, uses, validity and restrictions.',
  parameters: { type: 'object', properties: { active: { type: 'string', enum: ['active', 'inactive', 'any'] }, q: { type: 'string', maxLength: 32 }, limit: { type: 'integer', minimum: 1, maximum: 50 } } },
  parse(raw) {
    const r = argsObject(raw, ['active', 'q', 'limit'])
    return { active: optEnum(r, 'active', ['active', 'inactive', 'any'] as const) ?? 'any', q: optString(r, 'q', { max: 32 }), limit: optInt(r, 'limit', 1, 50) ?? 20 }
  },
  async run(a) {
    const { billingCoupons } = await import('@/lib/db/billing')
    const q: Doc = {}
    if (a.active !== 'any') q.active = a.active === 'active'
    if (a.q) q.code = { $regex: a.q.toUpperCase().replace(/[^A-Z0-9_-]/g, ''), $options: 'i' }
    const rows = (await (await billingCoupons()).find(q as never, { projection: { _id: 0 } }).sort({ created_at: -1 }).limit(a.limit).toArray()) as Doc[]
    return {
      data: {
        coupons: rows.map((c) => ({
          id: c.id, code: c.code, type: c.discount_type, value: c.discount_type === 'flat' ? money(Math.round(Number(c.discount_value) * 100), c.currency) : c.discount_type === 'percentage' ? `${c.discount_value}%` : `${c.trial_duration_days ?? '?'} day trial`,
          uses: `${c.current_uses ?? 0}${c.max_uses ? ` of ${c.max_uses}` : ''}`, active: c.active !== false, valid_until: c.valid_until ?? null, starts_at: c.starts_at ?? null,
          applies_to: c.applies_to ?? 'all', plan_ids: c.plan_ids ?? [], per_user_limit: c.per_user_limit ?? 1, first_purchase_only: !!c.first_purchase_only,
        })),
        link: '/dashboard/admin/coupons',
      },
    }
  },
})

export const listOrgLicencesTool = readTool({
  name: 'list_org_licences',
  description: 'Organisation seat licences (colleges / companies): seats bought and used, dates, status and auto-assign domains. Tenant admins see their own organisation; a superadmin must pick an organisation or pass org_id.',
  parameters: { type: 'object', properties: { org_id: { type: 'string', description: 'Superadmin without an organisation scope: which organisation.' } } },
  parse(raw) {
    const r = argsObject(raw, ['org_id'])
    return { org_id: optString(r, 'org_id', { max: 80 }) }
  },
  async run(a, ctx) {
    const c = ctx.caller
    const orgId = c.role === 'superadmin' && !c.tenantId ? a.org_id : c.tenantId
    if (!orgId) throw new ToolInputError('Pick an organisation first (or pass org_id).')
    if (a.org_id && a.org_id !== orgId) throw new ToolInputError('You can only see your own organisation’s licences.')
    const { listOrgLicences } = await import('@/lib/billing/licences')
    const rows = (await listOrgLicences(orgId)) as unknown as Doc[]
    return {
      data: {
        org_id: orgId,
        licences: rows.map((l) => ({ id: l.id, org: clip(l.org_name, 80), plan: l.plan_key, seats: l.seats, seats_used: l.seats_used, status: l.status, starts_at: l.starts_at, ends_at: l.ends_at, seat_price: money(l.seat_price_minor, l.currency), email_domains: l.email_domains, auto_assign: !!l.auto_assign, source: l.source })),
        link: '/dashboard/admin/licences',
      },
    }
  },
})

// ─── Paid certifications ─────────────────────────────────────────────────────

export const listCertReviewsTool = readTool({
  name: 'list_cert_reviews',
  roles: [...SUPER],
  description: 'Paid (proctored) certification programmes and the attempts waiting for a human review decision (score, trust score, proctoring flags).',
  parameters: { type: 'object', properties: { queue: { type: 'string', enum: ['in_review', 'decided'] }, limit: { type: 'integer', minimum: 1, maximum: 50 } } },
  parse(raw) {
    const r = argsObject(raw, ['queue', 'limit'])
    return { queue: optEnum(r, 'queue', ['in_review', 'decided'] as const) ?? 'in_review', limit: optInt(r, 'limit', 1, 50) ?? 20 }
  },
  async run(a) {
    const { listPrograms, reviewQueue } = await import('@/lib/pro-certs/service')
    const [programs, queue] = await Promise.all([listPrograms(), reviewQueue(a.queue)])
    return {
      data: {
        programs: (programs as unknown as Doc[]).slice(0, 30).map((p) => ({ id: p.id, slug: p.slug, title: clip(p.title, 100), status: p.status, price_inr: money(p.price?.INR, 'INR'), price_usd: money(p.price?.USD, 'USD') })),
        attempts_total: queue.length,
        attempts: (queue as unknown as Doc[]).slice(0, a.limit).map((r) => ({ attempt_id: r.id, programme: clip(r.program_title, 100), candidate: clip(r.name, 60), score_pct: r.score_pct, pass_percent: r.pass_percent, trust_score: r.trust_score, min_trust: r.min_trust, flags: (r.flags || []).slice(0, 6), submitted_at: r.submitted_at, review: r.review ? { status: r.review.status, note: clip(r.review.note, 160) } : null })),
        link: '/dashboard/admin/pro-certs',
      },
    }
  },
})

// ─── Live proctored drives ───────────────────────────────────────────────────

export const listLiveDrivesTool = readTool({
  name: 'list_live_drives',
  description: 'Live proctored drives (campus or company): schedule, status, candidates, invigilators and whether results are published. Organisation admins see their own drives.',
  parameters: { type: 'object', properties: { status: { type: 'string', enum: ['upcoming', 'live', 'ended', 'any'] }, limit: { type: 'integer', minimum: 1, maximum: 50 } } },
  parse(raw) {
    const r = argsObject(raw, ['status', 'limit'])
    return { status: optEnum(r, 'status', ['upcoming', 'live', 'ended', 'any'] as const) ?? 'any', limit: optInt(r, 'limit', 1, 50) ?? 20 }
  },
  async run(a, ctx) {
    const { listDrivesForStaff } = await import('@/lib/live-drives/service')
    const res = (await atsCall(() => listDrivesForStaff(serviceUser(ctx.caller) as never))) as { drives: Doc[] }
    const rows = res.drives
      .filter((d) => inCallerOrg(ctx.caller, d.owner?.tenant_id))
      .filter((d) => a.status === 'any' || (a.status === 'upcoming' ? ['draft', 'scheduled'].includes(d.effective_status) : d.effective_status === a.status))
    return {
      data: {
        total: rows.length,
        drives: rows.slice(0, a.limit).map((d) => ({ id: d.id, title: clip(d.title, 120), owner: clip(d.owner?.name, 80), status: d.effective_status ?? d.status, starts_at: d.schedule?.start_at ?? null, duration_min: d.schedule?.duration_min ?? null, candidates: d.candidate_count, invigilators: Array.isArray(d.invigilators) ? d.invigilators.length : 0, company: clip(d.test?.company_name, 60) || null, results_published: !!d.results?.published_at, my_role: d.role })),
        link: '/dashboard/live-drives',
      },
    }
  },
})
