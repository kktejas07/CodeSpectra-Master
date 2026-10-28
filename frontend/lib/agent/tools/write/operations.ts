/**
 * Proposal-only write tools for the newer operations modules (AGT-033). Nothing runs until the
 * admin confirms; execute() re-checks the caller and calls the same service the admin UI uses.
 *  - review_news_draft   approve (publish) or reject a pending tech-news draft      superadmin, 'publish'
 *  - create_coupon       a platform billing coupon (same validation as Admin → Coupons) superadmin, 'money'
 *  - moderate_forum_post approve / hide / remove / dismiss / lock / pin a forum post  forum moderators, 'update'
 *  - decide_mentor       verify / reject / suspend / reinstate a mentor profile       superadmin, 'publish'
 *  - decide_cert_review  pass (issues the credential) or reject a paid-cert attempt   superadmin, 'publish'
 */
import { ToolInputError } from '@/lib/agent/contract'
import { writeTool } from '../define'
import { argsObject, optBool, optDate, optEnum, optInt, optNumber, optString, optStringArray, reqId, reqString } from '../args'
import { clip } from '../output'
import { atsCall } from '../ats-shared'
import { serviceUser } from '../scope'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Doc = Record<string, any>
const SUPER = ['superadmin'] as const

async function adminAudit(actorId: string, action: string, type: string, id: string, detail: string) {
  const { auditAdmin } = await import('@/lib/admin-audit')
  await auditAdmin({ id: actorId }, action, type, id, `${detail} (via AI copilot)`.slice(0, 480), 'info').catch(() => undefined)
}

// ─── Tech news ───────────────────────────────────────────────────────────────

export const reviewNewsDraftTool = writeTool<{ draft_id: string; decision: 'approve' | 'reject' }>({
  name: 'review_news_draft',
  risk: 'publish',
  roles: [...SUPER],
  description: 'Approve (publish to /news) or reject a pending tech-news draft. Check list_pending_news first — say so if the fact verifier flagged the draft. One draft per proposal.',
  parameters: { type: 'object', properties: { draft_id: { type: 'string' }, decision: { type: 'string', enum: ['approve', 'reject'] } }, required: ['draft_id', 'decision'] },
  parse(raw) {
    const r = argsObject(raw, ['draft_id', 'decision'])
    const decision = optEnum(r, 'decision', ['approve', 'reject'] as const)
    if (!decision) throw new ToolInputError('`decision` is required (approve or reject).')
    return { draft_id: reqId(r, 'draft_id'), decision }
  },
  async propose(a) {
    const { draftsCol } = await import('@/lib/signals/store')
    const d = (await (await draftsCol()).findOne({ id: a.draft_id }, { projection: { _id: 0, body: 0 } })) as Doc | null
    if (!d) throw new ToolInputError('News draft not found. Use list_pending_news.')
    if (d.status === 'published' && a.decision === 'approve') throw new ToolInputError('That article is already live.')
    if (d.status === 'published') throw new ToolInputError('That article is live. Unpublish it in Admin → Signals instead.')
    const fc = d.fact_check as Doc | undefined
    const warnings = [
      ...(fc && !fc.ok ? [`Fact verifier: not backed by the source — ${[...(fc.numbers || []), ...(fc.names || []), ...(fc.claims || [])].slice(0, 8).join(', ')}`] : []),
      ...((d.flags || []).length ? ['Source text tripped the prompt guard.'] : []),
      ...(d.ai_rewritten === false ? ['No AI rewrite (plain fallback text).'] : []),
    ]
    return {
      title: `${a.decision === 'approve' ? 'Publish' : 'Reject'} news “${clip(d.title, 80)}”`,
      preview: { title: d.title, excerpt: clip(d.excerpt, 300), source: d.source_url, status: { from: d.status, to: a.decision === 'approve' ? 'published' : 'rejected' }, warnings: warnings.length ? warnings : '—', effect: a.decision === 'approve' ? 'Goes live on /news, the RSS feed and the public Ask box.' : 'Stays off the site.' },
    }
  },
  async execute(a, ctx) {
    const { reviewNewsDraft } = await import('@/lib/signals/review')
    const r = await reviewNewsDraft(a.draft_id, a.decision, ctx.caller.userId)
    if (!r.ok) throw new ToolInputError(r.error)
    await adminAudit(ctx.caller.userId, `signals.${a.decision}`, 'signal_draft', a.draft_id, r.status)
    return { ok: true, message: r.status === 'published' ? 'Published.' : 'Rejected.', link: r.url || '/dashboard/admin/signals' }
  },
})

// ─── Coupons ─────────────────────────────────────────────────────────────────

type CouponArgs = {
  code: string
  discount_type: 'percentage' | 'flat' | 'trial'
  discount_value?: number
  currency?: 'INR' | 'USD'
  trial_duration_days?: number
  max_uses?: number
  per_user_limit?: number
  valid_until?: string
  starts_at?: string
  plan_ids?: string[]
  first_purchase_only?: boolean
}

/** Copilot args → the coupon body Admin → Coupons posts (pure). */
export function couponBody(a: CouponArgs): Record<string, unknown> {
  return {
    code: a.code, discount_type: a.discount_type,
    ...(a.discount_value !== undefined ? { discount_value: a.discount_value } : {}),
    ...(a.currency ? { currency: a.currency } : {}),
    ...(a.trial_duration_days !== undefined ? { trial_duration_days: a.trial_duration_days } : {}),
    ...(a.max_uses !== undefined ? { max_uses: a.max_uses } : {}),
    ...(a.per_user_limit !== undefined ? { per_user_limit: a.per_user_limit } : {}),
    ...(a.valid_until ? { valid_until: a.valid_until } : {}),
    ...(a.starts_at ? { starts_at: a.starts_at } : {}),
    ...(a.plan_ids ? { plan_ids: a.plan_ids } : {}),
    ...(a.first_purchase_only !== undefined ? { first_purchase_only: a.first_purchase_only } : {}),
  }
}

export const createCouponTool = writeTool<CouponArgs>({
  name: 'create_coupon',
  risk: 'money',
  roles: [...SUPER],
  description: 'Create a platform billing coupon. percentage (1–100), flat (amount in major units, needs currency INR or USD) or trial (days). Coupons are code-based, not tied to one organisation — for "a coupon for SNIST" pick a code like SNIST20 and share it with them.',
  parameters: {
    type: 'object',
    properties: {
      code: { type: 'string', description: '3–32 letters, numbers, _ or -.' },
      discount_type: { type: 'string', enum: ['percentage', 'flat', 'trial'] },
      discount_value: { type: 'number', minimum: 0 },
      currency: { type: 'string', enum: ['INR', 'USD'] },
      trial_duration_days: { type: 'integer', minimum: 1, maximum: 365 },
      max_uses: { type: 'integer', minimum: 0, description: '0 = unlimited.' },
      per_user_limit: { type: 'integer', minimum: 1, maximum: 1000 },
      valid_until: { type: 'string', description: 'ISO date.' },
      starts_at: { type: 'string', description: 'ISO date.' },
      plan_ids: { type: 'array', items: { type: 'string' } },
      first_purchase_only: { type: 'boolean' },
    },
    required: ['code', 'discount_type'],
  },
  parse(raw) {
    const r = argsObject(raw, ['code', 'discount_type', 'discount_value', 'currency', 'trial_duration_days', 'max_uses', 'per_user_limit', 'valid_until', 'starts_at', 'plan_ids', 'first_purchase_only'])
    const discount_type = optEnum(r, 'discount_type', ['percentage', 'flat', 'trial'] as const)
    if (!discount_type) throw new ToolInputError('`discount_type` is required.')
    const out: CouponArgs = { code: reqString(r, 'code', { min: 3, max: 32 }).toUpperCase(), discount_type }
    const dv = optNumber(r, 'discount_value', 0, 1_000_000)
    if (dv !== undefined) out.discount_value = dv
    const cur = optEnum(r, 'currency', ['INR', 'USD'] as const)
    if (cur) out.currency = cur
    const td = optInt(r, 'trial_duration_days', 1, 365)
    if (td !== undefined) out.trial_duration_days = td
    const mu = optInt(r, 'max_uses', 0, 1_000_000)
    if (mu !== undefined) out.max_uses = mu
    const pu = optInt(r, 'per_user_limit', 1, 1000)
    if (pu !== undefined) out.per_user_limit = pu
    const vu = optDate(r, 'valid_until')
    if (vu) out.valid_until = vu
    const sa = optDate(r, 'starts_at')
    if (sa) out.starts_at = sa
    const plans = optStringArray(r, 'plan_ids', { maxItems: 20, maxLen: 64 })
    if (plans) out.plan_ids = plans
    const fp = optBool(r, 'first_purchase_only')
    if (fp !== undefined) out.first_purchase_only = fp
    return out
  },
  async propose(a) {
    const { checkCouponBody } = await import('@/lib/billing/coupon-admin')
    const checked = checkCouponBody(couponBody(a))
    if (!checked.ok) throw new ToolInputError(checked.error)
    const { billingCoupons } = await import('@/lib/db/billing')
    if (await (await billingCoupons()).findOne({ code: a.code } as never, { projection: { _id: 1 } })) throw new ToolInputError(`Coupon ${a.code} already exists. Pick another code.`)
    const value = a.discount_type === 'percentage' ? `${a.discount_value}% off` : a.discount_type === 'flat' ? `${a.discount_value} ${a.currency ?? ''} off`.trim() : `${a.trial_duration_days} day free trial`
    return {
      title: `Create coupon ${a.code} (${value})`,
      preview: { code: a.code, discount: value, max_uses: a.max_uses ? a.max_uses : 'unlimited', per_person: a.per_user_limit ?? 1, valid: `${a.starts_at ?? 'now'} → ${a.valid_until ?? 'no end date'}`, plans: a.plan_ids?.length ? a.plan_ids : 'all plans', first_purchase_only: !!a.first_purchase_only, effect: 'Anyone with the code can use it at checkout until it runs out or expires.' },
    }
  },
  async execute(a, ctx) {
    const { createCoupon } = await import('@/lib/billing/coupon-admin')
    const r = await createCoupon(ctx.caller.userId, couponBody(a))
    if (!r.ok) throw new ToolInputError(r.error)
    await adminAudit(ctx.caller.userId, 'admin.coupon.create', 'coupon', `coupon/${r.coupon.id}`, `${r.coupon.code} ${a.discount_type} ${a.discount_value ?? a.trial_duration_days ?? ''}`)
    return { ok: true, message: `Coupon ${r.coupon.code} is live.`, link: '/dashboard/admin/coupons' }
  },
})

// ─── Community moderation ────────────────────────────────────────────────────

const FORUM_ACTIONS = ['approve', 'hide', 'remove', 'dismiss', 'restore', 'lock', 'unlock', 'pin', 'unpin'] as const
type ForumAction = (typeof FORUM_ACTIONS)[number]

export const moderateForumPostTool = writeTool<{ target_type: 'thread' | 'reply' | 'message'; target_id: string; action: ForumAction; ban_days?: number; author_id?: string }>({
  name: 'moderate_forum_post',
  risk: 'update',
  description: 'Act on a community forum post from list_forum_reports: approve a held post, hide or remove it, dismiss the reports, restore, or lock / pin a thread. Optionally ban the author for 1–365 days. Forum moderators and platform admins only.',
  parameters: {
    type: 'object',
    properties: {
      target_type: { type: 'string', enum: ['thread', 'reply', 'message'] },
      target_id: { type: 'string' },
      action: { type: 'string', enum: [...FORUM_ACTIONS] },
      ban_days: { type: 'integer', minimum: 1, maximum: 365 },
      author_id: { type: 'string', description: 'Needed with ban_days (from list_forum_reports).' },
    },
    required: ['target_type', 'target_id', 'action'],
  },
  parse(raw) {
    const r = argsObject(raw, ['target_type', 'target_id', 'action', 'ban_days', 'author_id'])
    const target_type = optEnum(r, 'target_type', ['thread', 'reply', 'message'] as const)
    const action = optEnum(r, 'action', FORUM_ACTIONS)
    if (!target_type || !action) throw new ToolInputError('`target_type` and `action` are required.')
    if (['lock', 'unlock', 'pin', 'unpin'].includes(action) && target_type !== 'thread') throw new ToolInputError('Only a thread can be locked or pinned.')
    const target_id = reqId(r, 'target_id')
    if (!/^[a-z0-9-]{8,60}$/.test(target_id)) throw new ToolInputError('That post id does not look right. Use list_forum_reports.')
    const ban_days = optInt(r, 'ban_days', 1, 365)
    const author_id = optString(r, 'author_id', { max: 80 })
    if (ban_days && !author_id) throw new ToolInputError('Pass the post’s `author_id` to ban the author.')
    return { target_type, target_id, action, ...(ban_days ? { ban_days, author_id } : {}) }
  },
  async propose(a, ctx) {
    const { isModerator } = await import('@/lib/community/service')
    if (!(await isModerator(serviceUser(ctx.caller) as never))) throw new ToolInputError('Only forum moderators can moderate posts.')
    return {
      title: `${a.action[0].toUpperCase()}${a.action.slice(1)} forum ${a.target_type} ${a.target_id}${a.ban_days ? ` and ban the author for ${a.ban_days} days` : ''}`,
      preview: { target: `${a.target_type} ${a.target_id}`, action: a.action, ban: a.ban_days ? `${a.ban_days} days (author ${a.author_id})` : '—', effect: a.action === 'dismiss' ? 'The post stays; open reports are closed.' : 'Open reports on this post are closed.' },
    }
  },
  async execute(a, ctx) {
    const { moderationAction } = await import('@/lib/community/service')
    await atsCall(() => moderationAction(serviceUser(ctx.caller) as never, { target_type: a.target_type, target_id: a.target_id, action: a.action, ...(a.ban_days ? { ban_days: a.ban_days, author_id: a.author_id } : {}) }))
    await adminAudit(ctx.caller.userId, `community.${a.action}`, 'forum_post', a.target_id, a.ban_days ? `ban ${a.ban_days}d` : a.target_type)
    return { ok: true, message: `Done: ${a.action}.`, link: '/dashboard/community/moderation' }
  },
})

// ─── Mentors ─────────────────────────────────────────────────────────────────

export const decideMentorTool = writeTool<{ mentor_id: string; action: 'verify' | 'reject' | 'suspend' | 'reinstate'; note?: string }>({
  name: 'decide_mentor',
  risk: 'publish',
  roles: [...SUPER],
  description: 'Verify a pending mentor profile (they can then be listed on /mentors), reject it, suspend a verified mentor or reinstate a suspended one. Reject / suspend need a note for the mentor.',
  parameters: { type: 'object', properties: { mentor_id: { type: 'string' }, action: { type: 'string', enum: ['verify', 'reject', 'suspend', 'reinstate'] }, note: { type: 'string', maxLength: 1000 } }, required: ['mentor_id', 'action'] },
  parse(raw) {
    const r = argsObject(raw, ['mentor_id', 'action', 'note'])
    const action = optEnum(r, 'action', ['verify', 'reject', 'suspend', 'reinstate'] as const)
    if (!action) throw new ToolInputError('`action` is required.')
    const note = optString(r, 'note', { max: 1000 })
    if ((action === 'reject' || action === 'suspend') && !note) throw new ToolInputError('Add a `note` with the reason for the mentor.')
    return { mentor_id: reqId(r, 'mentor_id'), action, ...(note ? { note } : {}) }
  },
  async propose(a) {
    const [{ mentorProfilesCol }, { nextMentorStatus }] = await Promise.all([import('@/lib/mentors/db'), import('@/lib/mentors/pure')])
    const m = (await (await mentorProfilesCol()).findOne({ id: a.mentor_id }, { projection: { _id: 0, display_name: 1, status: 1, headline: 1 } })) as Doc | null
    if (!m) throw new ToolInputError('Mentor not found. Use list_mentors.')
    const to = nextMentorStatus(m.status, a.action)
    if (!to) throw new ToolInputError(`A ${m.status} mentor can't be changed with "${a.action}".`)
    return { title: `${a.action[0].toUpperCase()}${a.action.slice(1)} mentor ${clip(m.display_name, 60)}`, preview: { mentor: m.display_name, headline: clip(m.headline, 140), status: { from: m.status, to }, note: a.note ?? '—', effect: 'The mentor is notified.' } }
  },
  async execute(a, ctx) {
    const { decideMentor } = await import('@/lib/mentors/service')
    const m = await atsCall(() => decideMentor(ctx.caller.userId, a.mentor_id, a.action, a.note ?? null))
    return { ok: true, message: `${m.display_name} is now ${m.status}.`, link: '/dashboard/admin/mentors' }
  },
})

// ─── Paid certifications ─────────────────────────────────────────────────────

export const decideCertReviewTool = writeTool<{ attempt_id: string; decision: 'pass' | 'reject'; note: string }>({
  name: 'decide_cert_review',
  risk: 'publish',
  roles: [...SUPER],
  description: 'Decide a paid certification attempt waiting for human review (from list_cert_reviews): pass issues the credential, reject tells the candidate. A note is required either way.',
  parameters: { type: 'object', properties: { attempt_id: { type: 'string' }, decision: { type: 'string', enum: ['pass', 'reject'] }, note: { type: 'string', maxLength: 2000 } }, required: ['attempt_id', 'decision', 'note'] },
  parse(raw) {
    const r = argsObject(raw, ['attempt_id', 'decision', 'note'])
    const decision = optEnum(r, 'decision', ['pass', 'reject'] as const)
    if (!decision) throw new ToolInputError('`decision` is required (pass or reject).')
    return { attempt_id: reqId(r, 'attempt_id'), decision, note: reqString(r, 'note', { min: 3, max: 2000 }) }
  },
  async propose(a) {
    const { reviewQueue } = await import('@/lib/pro-certs/service')
    const row = (await reviewQueue('in_review')).find((x) => x.id === a.attempt_id) as Doc | undefined
    if (!row) throw new ToolInputError('That attempt is not waiting for review. Use list_cert_reviews.')
    return {
      title: `${a.decision === 'pass' ? 'Pass' : 'Reject'} ${clip(row.name, 60)} for ${clip(row.program_title, 80)}`,
      preview: { candidate: row.name, programme: row.program_title, score: `${row.score_pct}% (pass ${row.pass_percent}%)`, trust: `${row.trust_score ?? '—'} (minimum ${row.min_trust})`, flags: (row.flags || []).slice(0, 6), note: a.note, effect: a.decision === 'pass' ? 'Issues the credential and e-mails the candidate. Revoking later is a separate step.' : 'The candidate is told the attempt was not approved.' },
    }
  },
  async execute(a, ctx) {
    const { decideReview } = await import('@/lib/pro-certs/service')
    await atsCall(() => decideReview(a.attempt_id, ctx.caller.userId, a.decision === 'pass', a.note))
    await adminAudit(ctx.caller.userId, `pro_cert.review.${a.decision}`, 'pro_cert_attempt', a.attempt_id, clip(a.note, 200))
    return { ok: true, message: a.decision === 'pass' ? 'Passed — credential issued.' : 'Rejected.', link: '/dashboard/admin/pro-certs' }
  },
})
