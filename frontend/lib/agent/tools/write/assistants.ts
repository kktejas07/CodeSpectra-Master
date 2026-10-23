/**
 * Proposal-only write tools for the wave-15 assistants. Nothing runs until the
 * admin confirms; execute() re-checks the caller (and, for placement, the
 * college from the session) and calls lib/assistants/* services.
 *  - nudge_students           in-app + e-mail nudge to your college's students        college staff, 'send'
 *  - assign_company_practice  assign a company practice test + tell the students      college staff, 'send'
 *  - send_renewal_reminder    plan / payment / licence renewal reminder               superadmin, 'send'
 *  - send_upgrade_offer       seats / usage upgrade note to an organisation's admins  superadmin, 'send'
 *  - send_winback_offer       single-use 14-day coupon + message to a lapsed user     superadmin, 'money'
 */
import { ToolInputError } from '@/lib/agent/contract'
import { writeTool } from '../define'
import { argsObject, optEnum, optId, optIdArray, optInt, optString, reqId } from '../args'
import { clip } from '../output'
import { staffFor } from '../read/assistants'

const SUPER = ['superadmin'] as const
const KEY_RE = /^[a-z]+:[A-Za-z0-9_.:-]{1,160}$/

async function adminAudit(actorId: string, action: string, id: string, detail: string) {
  const { auditAdmin } = await import('@/lib/admin-audit')
  await auditAdmin({ id: actorId }, action, 'assistant', id, `${detail} (via AI copilot)`.slice(0, 480), 'info').catch(() => undefined)
}

function signalKey(r: Record<string, unknown>): string {
  const k = optString(r, 'signal_key', { max: 200 })
  if (!k || !KEY_RE.test(k)) throw new ToolInputError('`signal_key` is required — copy it from list_revenue_signals.')
  return k
}

// ─── Placement ───────────────────────────────────────────────────────────────

type NudgeArgs = { student_ids: string[]; kind: 'practice' | 'drive'; drive_id?: string }

export const nudgeStudentsTool = writeTool<NudgeArgs>({
  name: 'nudge_students',
  risk: 'send',
  description: 'Placement: send a short nudge (in-app + e-mail, in each student\'s language, honouring their notification settings) to students of your college — "practice" (start practising for placements) or "drive" (a drive is open; give drive_id). At most 200; anyone nudged in the last 7 days is skipped. Get ids from list_students_to_nudge.',
  parameters: { type: 'object', properties: { student_ids: { type: 'array', items: { type: 'string' }, maxItems: 200 }, kind: { type: 'string', enum: ['practice', 'drive'] }, drive_id: { type: 'string' } }, required: ['student_ids', 'kind'] },
  parse(raw) {
    const r = argsObject(raw, ['student_ids', 'kind', 'drive_id'])
    const ids = optIdArray(r, 'student_ids', 200)
    if (!ids?.length) throw new ToolInputError('`student_ids` needs at least one student id.')
    const kind = optEnum(r, 'kind', ['practice', 'drive'] as const) ?? 'practice'
    const drive = optId(r, 'drive_id')
    if (kind === 'drive' && !drive) throw new ToolInputError('A drive nudge needs `drive_id`.')
    return { student_ids: ids, kind, ...(drive ? { drive_id: drive } : {}) }
  },
  async propose(a, ctx) {
    const staff = await staffFor(ctx.caller)
    const { previewStudents } = await import('@/lib/assistants/placement/service')
    const p = await previewStudents(staff, a.student_ids)
    if (!p.reachable) throw new ToolInputError('None of those students has joined with an account yet (resend their invites from the placement console).')
    let drive: string | null = null
    if (a.drive_id) drive = (await (await import('@/lib/campus/drives')).getDrive(staff, a.drive_id)).title
    return {
      title: a.kind === 'drive' ? `Tell ${p.reachable} student(s) about “${clip(drive, 80)}”` : `Nudge ${p.reachable} student(s) to practise for placements`,
      preview: { college: staff.college.name, students: p.reachable, sample: p.names, not_joined_skipped: p.not_joined, not_in_your_college: p.not_in_college, channels: 'In-app + e-mail (students who turned e-mail off get in-app only)', rule: 'Anyone nudged in the last 7 days is skipped.' },
    }
  },
  async execute(a, ctx) {
    const staff = await staffFor(ctx.caller)
    const drive = a.drive_id ? (await (await import('@/lib/campus/drives')).getDrive(staff, a.drive_id)).title : null
    const { nudgeStudents } = await import('@/lib/assistants/placement/service')
    const r = await nudgeStudents(staff, a.student_ids, a.kind, drive)
    return { ok: true, message: `Nudged ${r.sent} student(s)${r.skipped ? `; ${r.skipped} were nudged recently` : ''}${r.not_joined ? `; ${r.not_joined} have not joined yet` : ''}.`, link: '/dashboard/placement', data: r }
  },
})

type PracticeArgs = { student_ids: string[]; test_id: string }

export const assignCompanyPracticeTool = writeTool<PracticeArgs>({
  name: 'assign_company_practice',
  risk: 'send',
  description: 'Placement: assign a company-specific practice test (id from list_company_practice_tests) to students of your college and tell them (in-app + e-mail). At most 200 students.',
  parameters: { type: 'object', properties: { student_ids: { type: 'array', items: { type: 'string' }, maxItems: 200 }, test_id: { type: 'string' } }, required: ['student_ids', 'test_id'] },
  parse(raw) {
    const r = argsObject(raw, ['student_ids', 'test_id'])
    const ids = optIdArray(r, 'student_ids', 200)
    if (!ids?.length) throw new ToolInputError('`student_ids` needs at least one student id.')
    return { student_ids: ids, test_id: reqId(r, 'test_id') }
  },
  async propose(a, ctx) {
    const staff = await staffFor(ctx.caller)
    const [{ previewStudents }, { getPattern }] = await Promise.all([import('@/lib/assistants/placement/service'), import('@/lib/company-tests/db')])
    const pat = await getPattern(a.test_id)
    if (!pat || (pat as { active?: boolean }).active === false) throw new ToolInputError('That practice test is not available — pick one from list_company_practice_tests.')
    const p = await previewStudents(staff, a.student_ids)
    if (!p.reachable) throw new ToolInputError('None of those students has joined with an account yet.')
    return {
      title: `Assign ${clip(`${pat.companyName} ${pat.examName}`, 80)} practice to ${p.reachable} student(s)`,
      preview: { college: staff.college.name, test: `${pat.companyName} ${pat.examName}`, sections: pat.sections.map((s) => s.name).slice(0, 8), students: p.reachable, sample: p.names, not_joined_skipped: p.not_joined, channels: 'In-app + e-mail' },
    }
  },
  async execute(a, ctx) {
    const staff = await staffFor(ctx.caller)
    const { assignPractice } = await import('@/lib/assistants/placement/service')
    const r = await assignPractice(staff, a.student_ids, a.test_id)
    return { ok: true, message: `Assigned ${r.test} to ${r.sent} student(s).`, link: '/dashboard/placement', data: r }
  },
})

// ─── Revenue ─────────────────────────────────────────────────────────────────

type ReminderArgs = { user_id?: string; org_id?: string; signal_key: string; reason: 'renewal' | 'payment' | 'licence' }

export const sendRenewalReminderTool = writeTool<ReminderArgs>({
  name: 'send_renewal_reminder',
  risk: 'send',
  roles: [...SUPER],
  description: 'Revenue: send a renewal reminder (in-app + e-mail in the recipient\'s language) — to a user whose plan ends soon or whose renewal payment failed (user_id), or to an organisation\'s admins whose licence ends soon (org_id). Copy signal_key from list_revenue_signals; the same signal is not reminded twice within the cooldown.',
  parameters: { type: 'object', properties: { user_id: { type: 'string' }, org_id: { type: 'string' }, signal_key: { type: 'string' }, reason: { type: 'string', enum: ['renewal', 'payment', 'licence'] } }, required: ['signal_key', 'reason'] },
  parse(raw) {
    const r = argsObject(raw, ['user_id', 'org_id', 'signal_key', 'reason'])
    const user = optId(r, 'user_id'), org = optId(r, 'org_id')
    if (!!user === !!org) throw new ToolInputError('Give exactly one of `user_id` or `org_id`.')
    const reason = optEnum(r, 'reason', ['renewal', 'payment', 'licence'] as const)
    if (!reason) throw new ToolInputError('`reason` is required (renewal, payment or licence).')
    if (reason === 'licence' && !org) throw new ToolInputError('A licence reminder goes to an organisation: give `org_id`.')
    return { ...(user ? { user_id: user } : {}), ...(org ? { org_id: org } : {}), signal_key: signalKey(r), reason }
  },
  async propose(a) {
    const { recipientsFor } = await import('@/lib/assistants/revenue/service')
    const to = await recipientsFor(a)
    if (!to.length) throw new ToolInputError(a.org_id ? 'That organisation has no admin to remind.' : 'User not found.')
    return {
      title: a.reason === 'licence' ? `Remind ${to.length} organisation admin(s) that their licence ends soon` : a.reason === 'payment' ? 'Ask the user to update their payment method' : 'Remind the user that their plan ends soon',
      preview: { recipients: to.length, message: a.reason === 'licence' ? 'Licence ends soon — renew to keep seats' : a.reason === 'payment' ? 'Renewal payment failed — update the payment method' : 'Plan ends soon — renew to keep access', link: a.reason === 'licence' ? '/dashboard/admin/licences' : '/dashboard/billing', channels: 'In-app + e-mail (billing)', signal: a.signal_key },
    }
  },
  async execute(a, ctx) {
    const [{ getAssistantSettings }, { sendRenewalReminder }] = await Promise.all([import('@/lib/assistants/store'), import('@/lib/assistants/revenue/service')])
    const s = await getAssistantSettings('revenue')
    const r = await sendRenewalReminder(a, a.signal_key, a.reason, s.cooldown_days)
    await adminAudit(ctx.caller.userId, 'assistant.revenue.reminder', a.org_id ?? a.user_id ?? '', `Renewal reminder (${a.reason}) to ${r.sent}`)
    return { ok: true, message: `Reminder sent to ${r.sent} recipient(s).`, data: r }
  },
})

type UpgradeArgs = { org_id: string; signal_key: string; reason: 'seats' | 'usage' }

export const sendUpgradeOfferTool = writeTool<UpgradeArgs>({
  name: 'send_upgrade_offer',
  risk: 'send',
  roles: [...SUPER],
  description: 'Revenue: tell an organisation\'s admins they are close to their seats or monthly assessment limit, with a link to add seats / upgrade (in-app + e-mail). No price change happens — they choose on the pricing page.',
  parameters: { type: 'object', properties: { org_id: { type: 'string' }, signal_key: { type: 'string' }, reason: { type: 'string', enum: ['seats', 'usage'] } }, required: ['org_id', 'signal_key', 'reason'] },
  parse(raw) {
    const r = argsObject(raw, ['org_id', 'signal_key', 'reason'])
    return { org_id: reqId(r, 'org_id'), signal_key: signalKey(r), reason: optEnum(r, 'reason', ['seats', 'usage'] as const) ?? 'usage' }
  },
  async propose(a) {
    const { recipientsFor } = await import('@/lib/assistants/revenue/service')
    const to = await recipientsFor({ org_id: a.org_id })
    if (!to.length) throw new ToolInputError('That organisation has no admin to contact.')
    return { title: `Send ${to.length} admin(s) an upgrade note (${a.reason === 'seats' ? 'seats nearly full' : 'near the monthly limit'})`, preview: { recipients: to.length, link: a.reason === 'seats' ? '/dashboard/admin/licences' : '/dashboard/pricing', channels: 'In-app + e-mail', effect: 'A message only; nothing about their plan changes.', signal: a.signal_key } }
  },
  async execute(a, ctx) {
    const [{ getAssistantSettings }, { sendUpgradeOffer }] = await Promise.all([import('@/lib/assistants/store'), import('@/lib/assistants/revenue/service')])
    const r = await sendUpgradeOffer(a.org_id, a.signal_key, a.reason, (await getAssistantSettings('revenue')).cooldown_days)
    await adminAudit(ctx.caller.userId, 'assistant.revenue.upgrade', a.org_id, `Upgrade offer (${a.reason}) to ${r.sent}`)
    return { ok: true, message: `Upgrade note sent to ${r.sent} admin(s).`, data: r }
  },
})

type WinbackArgs = { user_id: string; signal_key: string; percent_off: number; plan?: string }

export const sendWinbackOfferTool = writeTool<WinbackArgs>({
  name: 'send_winback_offer',
  risk: 'money',
  roles: [...SUPER],
  description: 'Revenue: for a user whose paid plan lapsed recently, create a single-use percentage coupon valid 14 days (5–50% off plans) and send it to them (in-app + e-mail). Copy signal_key from list_revenue_signals.',
  parameters: { type: 'object', properties: { user_id: { type: 'string' }, signal_key: { type: 'string' }, percent_off: { type: 'integer', minimum: 5, maximum: 50 }, plan: { type: 'string' } }, required: ['user_id', 'signal_key'] },
  parse(raw) {
    const r = argsObject(raw, ['user_id', 'signal_key', 'percent_off', 'plan'])
    const plan = optString(r, 'plan', { max: 64 })
    return { user_id: reqId(r, 'user_id'), signal_key: signalKey(r), percent_off: optInt(r, 'percent_off', 5, 50) ?? 20, ...(plan ? { plan } : {}) }
  },
  async propose(a) {
    const [{ recipientsFor }, { winbackCode }] = await Promise.all([import('@/lib/assistants/revenue/service'), import('@/lib/assistants/revenue/signals')])
    if (!(await recipientsFor({ user_id: a.user_id })).length) throw new ToolInputError('User not found.')
    return { title: `Send a ${a.percent_off}% win-back coupon (single use, 14 days)`, preview: { coupon: winbackCode(a.signal_key), discount: `${a.percent_off}% off plans`, max_uses: 1, valid_days: 14, lapsed_plan: a.plan ?? '—', channels: 'In-app + e-mail', effect: 'Creates a platform coupon (money) and messages the user.' } }
  },
  async execute(a, ctx) {
    const [{ getAssistantSettings }, { sendWinbackOffer }] = await Promise.all([import('@/lib/assistants/store'), import('@/lib/assistants/revenue/service')])
    const r = await sendWinbackOffer(ctx.caller.userId, a.user_id, a.signal_key, a.percent_off, (await getAssistantSettings('revenue')).cooldown_days)
    await adminAudit(ctx.caller.userId, 'assistant.revenue.winback', a.user_id, `Win-back coupon ${r.code} (${a.percent_off}%)`)
    return { ok: true, message: `Coupon ${r.code} created and sent (valid until ${r.valid_until}).`, link: '/dashboard/admin/coupons', data: r }
  },
})

export const ASSISTANT_WRITE_TOOLS = [nudgeStudentsTool, assignCompanyPracticeTool, sendRenewalReminderTool, sendUpgradeOfferTool, sendWinbackOfferTool]
