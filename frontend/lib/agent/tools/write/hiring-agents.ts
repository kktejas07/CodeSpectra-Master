/**
 * Write tools behind the hiring agent loops (lib/agent/hiring-loops), also
 * usable from the copilot. Each only proposes; execute() runs after a human
 * confirms (or an org admin's auto-send for that step):
 *
 *   send_talent_invites    talent-search invites for one open job (lib/talent sendTalentInvite:
 *                          opt-in learners only, quotas, audit, learner notification)
 *   offer_interview_slots  free panel times + the self-schedule link to a candidate
 *                          (email with unsubscribe; WhatsApp only with consent)
 *   set_integrity_hold     hold / release-hold unreleased scores of named candidates
 *                          of a test (score release skips held submissions)
 */
import { getMongoDb } from '@/lib/mongodb'
import { ToolInputError } from '@/lib/agent/contract'
import { escapeHtml } from '@/lib/safe-html'
import { writeTool } from '../define'
import { argsObject, optBool, optString, optStringArray, reqId } from '../args'
import { atsActorFor, atsCall, jobLink } from '../ats-shared'
import { loadExam, testLink } from '../loaders'
import { clip } from '../output'

type Doc = Record<string, any>
const HANDLE_RE = /^[A-Za-z0-9_.-]{3,30}$/

// ─── send_talent_invites ────────────────────────────────────────────────────

export interface SendTalentInvitesArgs { job_id: string; handles: string[]; message?: string }

export const sendTalentInvitesTool = writeTool<SendTalentInvitesArgs>({
  name: 'send_talent_invites',
  risk: 'send',
  description: 'Invite learners found in talent search (by passport handle, from search_talent or the hiring sourcer) to apply to one open job. Only learners who opted in to discovery; their contact details stay private until they accept. Uses the organisation’s monthly invite quota.',
  parameters: {
    type: 'object',
    properties: {
      job_id: { type: 'string' },
      handles: { type: 'array', items: { type: 'string' }, maxItems: 25 },
      message: { type: 'string', maxLength: 1000, description: 'Optional short note shown with the invite.' },
    },
    required: ['job_id', 'handles'],
  },
  parse(raw) {
    const r = argsObject(raw, ['job_id', 'handles', 'message'])
    const handles = [...new Set(optStringArray(r, 'handles', { maxItems: 25, maxLen: 30 }) ?? [])]
    if (!handles.length) throw new ToolInputError('Give at least one passport handle in `handles`.')
    const bad = handles.find((h) => !HANDLE_RE.test(h))
    if (bad) throw new ToolInputError(`"${clip(bad, 30)}" is not a passport handle.`)
    const message = optString(r, 'message', { max: 1000 })
    return { job_id: reqId(r, 'job_id'), handles, ...(message ? { message } : {}) }
  },
  async propose(a, ctx) {
    const actor = atsActorFor(ctx.caller)
    const [{ loadJob }, { talentByHandle, quotaState, getTalentSettings }] = await Promise.all([import('@/lib/ats/http'), import('@/lib/talent/db')])
    if (!(await getTalentSettings()).enabled) throw new ToolInputError('Talent search is turned off on this platform.')
    const job = await atsCall(() => loadJob(actor, a.job_id))
    if (job.status !== 'open') throw new ToolInputError('That job is not open.')
    const rows = (await Promise.all(a.handles.map((h) => talentByHandle(actor, h).catch(() => null)))).filter((x): x is NonNullable<typeof x> => !!x)
    if (!rows.length) throw new ToolInputError('None of these learners can be invited (not discoverable any more).')
    a.handles = rows.map((r) => r.handle)
    const q = await quotaState(actor.tenantId)
    return {
      title: `Invite ${rows.length} learner${rows.length === 1 ? '' : 's'} to apply for ${clip(job.title, 60)}`,
      preview: {
        job: job.title,
        learners: rows.map((r) => ({ handle: r.handle, name: r.name, location: [r.city, r.country].filter(Boolean).join(', ') || null, skills: (r.skills || []).slice(0, 5).map((s: Doc) => s.skill ?? s) })),
        quota: `${q.used} of ${q.limit} invites used this month`,
        ...(a.message ? { message: a.message } : {}),
        effect: 'Each learner gets an in-app note and an email. Contact details stay private unless they accept.',
      },
    }
  },
  async execute(a, ctx) {
    const actor = atsActorFor(ctx.caller)
    const { sendTalentInvite, TalentError } = await import('@/lib/talent/db')
    let sent = 0
    const skipped: string[] = []
    for (const handle of a.handles) {
      try {
        await sendTalentInvite(actor, { handle, target_type: 'job', target_id: a.job_id, ...(a.message ? { message: a.message } : {}) })
        sent++
      } catch (e) {
        if (e instanceof TalentError && e.status === 402) { skipped.push(`${handle}: quota`); break }
        skipped.push(`${handle}: ${e instanceof TalentError ? e.message : 'failed'}`.slice(0, 120))
      }
    }
    return { ok: sent > 0, message: `Sent ${sent} of ${a.handles.length} invites.${skipped.length ? ` ${skipped.length} skipped.` : ''}`, link: jobLink(a.job_id), data: { sent, skipped: skipped.slice(0, 10) } }
  },
})

// ─── offer_interview_slots ──────────────────────────────────────────────────

export interface OfferSlotsArgs { interview_id: string; slots: string[] }

const OFFERABLE = ['awaiting_schedule', 'no_show', 'cancelled']

async function loadIv(tenantId: string, id: string) {
  const { getInterview } = await import('@/lib/ats/interviews/service')
  const iv = await getInterview(tenantId, id)
  if (!iv) throw new ToolInputError('Interview not found in this organisation.')
  return iv
}

function fmtSlot(iso: string, tz: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale === 'en' ? 'en-IN' : locale, { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
  } catch {
    return new Date(iso).toUTCString()
  }
}

export const offerInterviewSlotsTool = writeTool<OfferSlotsArgs>({
  name: 'offer_interview_slots',
  risk: 'send',
  description: 'Offer a candidate up to 5 free interview times (from the panel’s calendars) with their self-schedule link, by email and — only if they agreed to it — WhatsApp. Works for interviews waiting to be booked, and re-offers after a no-show or cancellation.',
  parameters: {
    type: 'object',
    properties: {
      interview_id: { type: 'string' },
      slots: { type: 'array', items: { type: 'string' }, maxItems: 5, description: 'ISO 8601 start times, free for the whole panel.' },
    },
    required: ['interview_id', 'slots'],
  },
  parse(raw) {
    const r = argsObject(raw, ['interview_id', 'slots'])
    const slots = (optStringArray(r, 'slots', { maxItems: 5, maxLen: 40 }) ?? []).filter((s) => Number.isFinite(Date.parse(s))).map((s) => new Date(s).toISOString())
    if (!slots.length) throw new ToolInputError('Give at least one start time in `slots`.')
    if (slots.some((s) => Date.parse(s) < Date.now())) throw new ToolInputError('A time in `slots` is in the past.')
    return { interview_id: reqId(r, 'interview_id'), slots: [...new Set(slots)] }
  },
  async propose(a, ctx) {
    const actor = atsActorFor(ctx.caller)
    const iv = await loadIv(actor.tenantId, a.interview_id)
    if (!OFFERABLE.includes(iv.status)) throw new ToolInputError(`This interview is ${iv.status.replace('_', ' ')}; there is nothing to offer.`)
    if (!iv.panel.length) throw new ToolInputError('Add interviewers to the panel first.')
    const [{ slotsFor, loadContext }, { stillFree }] = await Promise.all([import('@/lib/ats/interviews/service'), import('@/lib/agent/hiring-loops/scheduler')])
    const { slots, timezone } = await slotsFor({ ...iv, status: 'awaiting_schedule' })
    const free = stillFree(a.slots, slots)
    if (!free.length) throw new ToolInputError('None of these times is free for the whole panel any more.')
    a.slots = free.map((s) => s.start)
    const { candidate, job } = await loadContext(iv)
    return {
      title: `Offer ${free.length} interview time${free.length === 1 ? '' : 's'} to ${clip(iv.candidate_name || candidate?.name || 'the candidate', 60)}`,
      preview: {
        candidate: iv.candidate_name || candidate?.name || null,
        job: job?.title || iv.job_title || null,
        stage: iv.stage_name || null,
        status: iv.status,
        times: free.map((s) => `${fmtSlot(s.start, timezone, 'en')} (${timezone})`),
        panel: iv.panel.map((p) => p.name || p.email),
        channels: ['email', ...(candidate?.phone && candidate?.consent?.whatsapp === true ? ['whatsapp'] : [])],
        effect: 'The candidate gets these times and a link to pick one (the link shows every free time). Booking sends calendar invites to the candidate and the panel.',
      },
    }
  },
  async execute(a, ctx) {
    const actor = atsActorFor(ctx.caller)
    const iv0 = await loadIv(actor.tenantId, a.interview_id)
    if (!OFFERABLE.includes(iv0.status)) return { ok: false, message: 'This interview no longer needs a time.' }
    const [svc, { atsInterviews }, { stillFree }, { hlt, hlLocale }] = await Promise.all([
      import('@/lib/ats/interviews/service'), import('@/lib/ats/interviews/db'), import('@/lib/agent/hiring-loops/scheduler'), import('@/lib/agent/hiring-loops/i18n'),
    ])
    const { slots, timezone } = await svc.slotsFor({ ...iv0, status: 'awaiting_schedule' })
    const free = stillFree(a.slots, slots)
    if (!free.length) return { ok: false, message: 'None of the offered times is free any more. Ask the scheduler for new times.' }
    const key = `agent_offer:${ctx.actionId || (a as Doc)._nonce || a.slots.join(',')}`
    if (!(await svc.claimSend(iv0.id, key))) return { ok: true, message: 'These times were already sent.' }
    // Re-open a no-show / cancelled round for booking; the candidate picks on their signed page.
    const col = await atsInterviews()
    await col.updateOne({ id: iv0.id, tenant_id: actor.tenantId }, {
      $set: { self_schedule: true, updated_at: new Date().toISOString(), ...(iv0.status !== 'awaiting_schedule' ? { status: 'awaiting_schedule', scheduled_at: null } : {}) },
    })
    const iv = (await svc.getInterview(actor.tenantId, iv0.id))!
    const { candidate, job } = await svc.loadContext(iv)
    const db = await getMongoDb()
    const tenant = await db.collection('tenants').findOne({ id: actor.tenantId }, { projection: { _id: 0, name: 1 } })
    const company = String(tenant?.name || 'the hiring team').slice(0, 120)
    const email = candidate?.email || iv.candidate_email || null
    const { localeForEmail } = await import('@/lib/i18n/recipient')
    const locale = hlLocale(await localeForEmail(email).catch(() => 'en'))
    const name = candidate?.name || iv.candidate_name || 'there'
    const role = job?.title || iv.job_title || 'the role'
    const link = await svc.candidateLink(iv, 'sched')
    const times = free.map((s) => fmtSlot(s.start, timezone, locale))
    const channels: string[] = []
    if (email) {
      const { isUnsubscribed, unsubscribeUrl, listUnsubscribeHeaders } = await import('@/lib/automation/mailer')
      if (!(await isUnsubscribed(email, 'hiring'))) {
        const { wrapEmail } = await import('@/lib/ats/notify')
        const intro = hlt(locale, iv0.status === 'awaiting_schedule' ? 'mail.intro' : 'mail.introReschedule', { name, minutes: iv.duration_min, role, company })
        const unsub = unsubscribeUrl(email, 'hiring')
        const body = `<p style="margin:0 0 12px">${escapeHtml(intro)}</p><ul style="margin:0 0 12px;padding-left:20px">${times.map((t) => `<li>${escapeHtml(`${t} (${timezone})`)}</li>`).join('')}</ul>`
          + `<p style="margin:0 0 12px;font-size:13px;color:#4b5563">${escapeHtml(hlt(locale, 'mail.more'))}</p>`
          + `<p style="margin:16px 0 0;font-size:12px;color:#6b7280">${escapeHtml(hlt(locale, 'mail.footer', { company }))}${unsub ? ` · <a href="${escapeHtml(unsub)}" style="color:#6b7280">${escapeHtml(hlt(locale, 'mail.unsubscribe'))}</a>` : ''}</p>`
        const msg = wrapEmail(hlt(locale, 'mail.subject', { role, company }), body, { url: link, label: hlt(locale, 'mail.pick') })
        try {
          const { sendEmail } = await import('@/lib/send-email')
          const headers = listUnsubscribeHeaders(email, 'hiring')
          const r = await sendEmail(email, msg, undefined, { category: 'ats', ...(headers ? { headers } : {}) })
          if (r?.success) channels.push('email')
        } catch {
          /* reported below */
        }
      }
    }
    if (candidate) {
      const { sendWhatsAppToCandidate } = await import('@/lib/whatsapp-send')
      const wa = await sendWhatsAppToCandidate(candidate, { kind: 'hiring', title: 'Interview times', text: hlt(locale, 'wa.text', { name, role, company, times: times.join('; '), link }).slice(0, 1000), urgent: true }).catch(() => null)
      if (wa && (wa as { sent?: boolean }).sent) channels.push('whatsapp')
    }
    const { getStates, setState } = await import('@/lib/agent/hiring-loops/store')
    const prev = (await getStates(actor.tenantId, 'scheduler', [iv.id])).get(iv.id) as { offers?: number } | undefined
    await setState(actor.tenantId, 'scheduler', iv.id, { offers: (prev?.offers ?? 0) + 1, last_offer_at: new Date().toISOString(), last_slots: free.map((s) => s.start) })
    const { auditAts } = await import('@/lib/ats/access')
    await auditAts(actor, 'ats.interview.offer_slots', 'ats_interview', iv.id, `${free.length} times via ${channels.join('+') || 'none'}`).catch(() => {})
    if (!channels.length) return { ok: false, message: 'The times could not be delivered (no email address, unsubscribed, or email failed). Share the self-schedule link another way.', link: `/dashboard/hiring/interviews/${iv.id}` }
    return { ok: true, message: `Sent ${free.length} times to ${name} by ${channels.join(' and ')}.`, link: `/dashboard/hiring/interviews/${iv.id}`, data: { channels } }
  },
})

// ─── set_integrity_hold ─────────────────────────────────────────────────────

export interface IntegrityHoldArgs { test_id: string; user_ids: string[]; hold: boolean; note?: string }

export const setIntegrityHoldTool = writeTool<IntegrityHoldArgs>({
  name: 'set_integrity_hold',
  risk: 'update',
  description: 'Hold (or release a hold on) the unreleased scores of named candidates of one test while a reviewer looks at integrity signals. Held scores are skipped by score release. A hold is not a verdict; candidate ids are user ids from get_integrity_report / get_test_results.',
  parameters: {
    type: 'object',
    properties: {
      test_id: { type: 'string' },
      user_ids: { type: 'array', items: { type: 'string' }, maxItems: 50 },
      hold: { type: 'boolean', description: 'true = hold, false = release the hold.' },
      note: { type: 'string', maxLength: 500 },
    },
    required: ['test_id', 'user_ids', 'hold'],
  },
  parse(raw) {
    const r = argsObject(raw, ['test_id', 'user_ids', 'hold', 'note'])
    const ids = [...new Set(optStringArray(r, 'user_ids', { maxItems: 50, maxLen: 128 }) ?? [])].filter((x) => /^[A-Za-z0-9_-]{1,128}$/.test(x))
    if (!ids.length) throw new ToolInputError('Give at least one candidate user id in `user_ids`.')
    const hold = optBool(r, 'hold')
    if (hold === undefined) throw new ToolInputError('`hold` must be true or false.')
    const note = optString(r, 'note', { max: 500 })
    return { test_id: reqId(r, 'test_id'), user_ids: ids, hold, ...(note ? { note } : {}) }
  },
  async propose(a, ctx) {
    const exam = await loadExam(ctx.caller, a.test_id)
    const db = await getMongoDb()
    const subs = await db.collection('exam_submissions').find(
      { exam_id: a.test_id, user_id: { $in: a.user_ids }, score_released: { $ne: true }, ...(a.hold ? {} : { integrity_hold: true }) },
      { projection: { _id: 0, user_id: 1, email: 1 } },
    ).limit(200).toArray()
    if (!subs.length) throw new ToolInputError(a.hold ? 'These candidates have no unreleased scores to hold.' : 'None of these candidates has a held score.')
    const { integrityUserNames } = await import('@/lib/integrity/service')
    const names = await integrityUserNames([...new Set(subs.map((s) => String(s.user_id)))])
    a.user_ids = [...new Set(subs.map((s) => String(s.user_id)))]
    return {
      title: `${a.hold ? 'Hold' : 'Release the hold on'} ${a.user_ids.length} score${a.user_ids.length === 1 ? '' : 's'} for “${clip(exam.title, 70)}”`,
      preview: {
        test: exam.title,
        candidates: a.user_ids.map((id) => names.get(id)?.name || 'Candidate'),
        ...(a.note ? { note: a.note } : {}),
        effect: a.hold
          ? 'Their scores stay unreleased (and certificates unissued) until the hold is released. Candidates are not told about the hold.'
          : 'Their scores can be released again with the next score release.',
      },
    }
  },
  async execute(a, ctx) {
    await loadExam(ctx.caller, a.test_id)
    const db = await getMongoDb()
    const now = new Date().toISOString()
    const r = await db.collection('exam_submissions').updateMany(
      { exam_id: a.test_id, user_id: { $in: a.user_ids }, score_released: { $ne: true } },
      a.hold
        ? { $set: { integrity_hold: true, integrity_hold_note: a.note ?? null, integrity_hold_by: ctx.caller.userId, integrity_hold_at: now } }
        : { $set: { integrity_hold: false, integrity_hold_released_by: ctx.caller.userId, integrity_hold_released_at: now } },
    )
    const { casesCol } = await import('@/lib/agent/hiring-loops/store')
    await (await casesCol()).updateMany({ tenant_id: ctx.caller.tenantId ?? '', target_id: a.test_id, user_id: { $in: a.user_ids } }, { $set: { held: a.hold, updated_at: now } }).catch(() => undefined)
    const { auditAdmin } = await import('@/lib/admin-audit')
    await auditAdmin({ id: ctx.caller.userId }, a.hold ? 'integrity.hold' : 'integrity.release_hold', 'exam', a.test_id, `${r.modifiedCount} submission(s)`, 'info').catch(() => undefined)
    return { ok: true, message: `${a.hold ? 'Held' : 'Released the hold on'} ${r.modifiedCount} submission${r.modifiedCount === 1 ? '' : 's'}.`, link: testLink(a.test_id) }
  },
})

