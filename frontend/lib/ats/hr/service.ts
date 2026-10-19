/**
 * HR round (stage type 'hr_round'). On entry: a compensation-confirmation form
 * for this stage entry, sent to the candidate as a signed link (/hr-form/[token],
 * no account) by email (+ WhatsApp with consent), reminders half-way to the
 * deadline, and — when the stage config asks — an HR conversation booked through
 * the interviews part (createForStage) so it shows in interviews.
 *
 * The candidate's submission becomes application.compensation (source 'hr_form',
 * confirmed_at) + history. HR then records pass / fail / hold
 * (recordHrDecision → engine.recordStageResult with the entry key). 'pass' waits
 * for the form when collect_compensation is on, unless overridden with a reason.
 *
 * Routes authorise first; everything here is tenant scoped by the records.
 */
import type { AtsActor, AtsApplication, AtsCandidate, AtsJob, PipelineStage, StageHandlerContext } from '../contract'
import { atsApplications, atsCandidates, atsJobs } from '../db'
import { AtsError, isCurrentEntry, recordStageResult, setApplicationStatus, stageKey } from '../engine'
import { COMP_MAX, canSeeCompensation, currencyForCountry, parseCompensation, periodsFor, withCompensation } from '../compensation'
import { renderText, textToHtml, wrapEmail } from '../notify'
import { atsHrForms, newId, nowIso, publicHrForm, type AtsHrFormDoc } from './db'
import { formTimes, hrConfig, hrDecisionGate, newHrNonce, signHrToken, verifyHrToken } from './rules'

const HR_SCORECARD = {
  criteria: [
    { id: 'hr_expectations', label: 'Expectations alignment' },
    { id: 'hr_values', label: 'Values and culture' },
    { id: 'hr_communication', label: 'Communication' },
  ],
}

async function linkKey(): Promise<Uint8Array> {
  const { deriveServerKey } = await import('@/lib/session')
  return deriveServerKey('ats-hr-form')
}

async function origin(): Promise<string> {
  const { getAppOrigin } = await import('@/lib/app-origin')
  return getAppOrigin()
}

export async function formLink(form: Pick<AtsHrFormDoc, 'id' | 'token_nonce' | 'sent_at' | 'deadline'>): Promise<string> {
  const sent = form.sent_at ? new Date(form.sent_at) : new Date()
  const days = form.deadline && form.sent_at ? Math.max(1, Math.round((Date.parse(form.deadline) - Date.parse(form.sent_at)) / 86_400_000)) : 3
  const token = signHrToken(await linkKey(), { i: form.id, n: form.token_nonce, e: formTimes(sent, days).link_expires })
  return `${await origin()}/hr-form/${token}`
}

async function companyName(job: Pick<AtsJob, 'tenant_id' | 'client_id'>): Promise<string> {
  try {
    const { getMongoDb } = await import('@/lib/mongodb')
    const db = await getMongoDb()
    if (job.client_id) {
      const c = await db.collection('ats_clients').findOne({ id: job.client_id, tenant_id: job.tenant_id }, { projection: { name: 1 } })
      if (c?.name) return String(c.name)
    }
    const t = await db.collection('tenants').findOne({ id: job.tenant_id }, { projection: { name: 1 } })
    return t?.name ? String(t.name) : 'our company'
  } catch {
    return 'our company'
  }
}

/** Email (+ WhatsApp with consent) the form link. Never throws. */
async function sendFormLink(form: AtsHrFormDoc, candidate: AtsCandidate, job: AtsJob, kind: 'invite' | 'reminder'): Promise<boolean> {
  const url = await formLink(form)
  const company = await companyName(job)
  const due = form.deadline ? new Date(form.deadline).toDateString() : 'soon'
  const vars = { candidate_name: candidate.name || 'there', job_title: job.title, company, due }
  const subject = kind === 'invite' ? `Next step for ${job.title}: confirm your compensation details` : `Reminder: confirm your compensation details for ${job.title}`
  const body = kind === 'invite'
    ? 'Hi {{candidate_name}},\n\nYour application for {{job_title}} at {{company}} has reached the HR round. Please confirm your current (or last drawn) and expected compensation and your notice period using the secure link below — it takes about two minutes and needs no account.\n\nPlease complete it by {{due}}.\n\n{{company}} hiring team'
    : 'Hi {{candidate_name}},\n\nA quick reminder to confirm your compensation details for {{job_title}} at {{company}}. The form is due by {{due}}.\n\n{{company}} hiring team'
  let ok = false
  if (candidate.email) {
    try {
      const { sendEmail } = await import('@/lib/send-email')
      const r = await sendEmail(candidate.email, wrapEmail(subject, textToHtml(renderText(body, vars)), { url, label: 'Confirm compensation' }), undefined, { category: 'ats' })
      ok = !!r?.success
    } catch (e) {
      console.error('[ats/hr] email failed:', (e as Error)?.message)
    }
  }
  // Consent is a hard gate for WhatsApp (checked again, with STOP opt-outs, by lib/whatsapp-send).
  if (candidate.phone && candidate.consent?.whatsapp === true) {
    try {
      const { sendWhatsAppToCandidate } = await import('@/lib/whatsapp-send')
      const r = await sendWhatsAppToCandidate(candidate, {
        kind: 'hiring', title: subject,
        text: renderText(kind === 'invite' ? 'Hi {{candidate_name}}, please confirm your compensation details for {{job_title}} at {{company}} by {{due}}.' : 'Reminder: please confirm your compensation details for {{job_title}} by {{due}}.', vars).slice(0, 900),
        link: url,
      })
      if (r.sent) ok = true
    } catch (e) {
      console.error('[ats/hr] whatsapp failed:', (e as Error)?.message)
    }
  }
  return ok
}

/** In-app note to the job's recruiters + hiring managers (else ATS admins / recruiters). */
async function notifyTeam(job: AtsJob, app: Pick<AtsApplication, 'id' | 'candidate_id'>, title: string, message: string): Promise<void> {
  try {
    let ids = [...(job.recruiter_ids || []), ...(job.hiring_manager_ids || [])].filter(Boolean)
    if (!ids.length) {
      const { getMongoDb } = await import('@/lib/mongodb')
      const rows = await (await getMongoDb()).collection('ats_members')
        .find({ tenant_id: job.tenant_id, status: 'active', role: { $in: ['admin', 'recruiter'] }, user_id: { $type: 'string' } }, { projection: { user_id: 1 } })
        .limit(20).toArray()
      ids = rows.map((r) => String(r.user_id))
    }
    if (!ids.length) return
    const { notifyMany } = await import('@/lib/notifications')
    await notifyMany([...new Set(ids)], {
      type: 'ats.hr_round',
      title,
      message,
      icon: 'briefcase',
      link: `/dashboard/hiring/candidates/${encodeURIComponent(app.candidate_id)}?app=${encodeURIComponent(app.id)}`,
    })
  } catch (e) {
    console.error('[ats/hr] notify failed:', (e as Error)?.message)
  }
}

const pending = (app: AtsApplication, stage: PipelineStage, key: string, summary: string) =>
  recordStageResult(app.id, { stage_id: stage.id, outcome: 'pending', summary, at: nowIso() }, { entryKey: key })

// ─── Stage entry ─────────────────────────────────────────────────────────────

export async function onHrRoundEnter(ctx: StageHandlerContext): Promise<void> {
  const { app, job, candidate, stage, idempotencyKey: key } = ctx
  const cfg = hrConfig(stage)
  if (!cfg) return
  const col = await atsHrForms()
  const ts = nowIso()
  const doc: AtsHrFormDoc = {
    id: newId(), tenant_id: app.tenant_id, application_id: app.id, job_id: job.id, candidate_id: candidate.id, stage_id: stage.id,
    entry_key: key, collect: cfg.collect_compensation, status: 'not_sent', token_nonce: newHrNonce(),
    sent_at: null, deadline: null, remind_at: null, reminded_at: null, submitted_at: null, submissions: 0,
    hr_interview_id: null, decision: null, created_at: ts, updated_at: ts,
  }
  let form: AtsHrFormDoc | null = doc
  try {
    await col.insertOne({ ...doc })
  } catch (e) {
    if ((e as { code?: number })?.code !== 11000) throw e
    form = await col.findOne({ entry_key: key }, { projection: { _id: 0 } })
  }
  if (!form) return

  if (cfg.collect_compensation) {
    if (!candidate.email && !(candidate.phone && candidate.consent?.whatsapp === true)) {
      await pending(app, stage, key, 'No email on file to send the compensation form — add one and resend the link, or pass with an override')
    } else if (form.status === 'not_sent') {
      const now = new Date()
      const t = formTimes(now, cfg.form_deadline_days ?? 3)
      // Claim the send (idempotent per entry).
      const claimed = await col.findOneAndUpdate(
        { id: form.id, status: 'not_sent' },
        { $set: { status: 'sent', sent_at: now.toISOString(), deadline: t.deadline, remind_at: t.remind_at, updated_at: nowIso() } },
        { returnDocument: 'after', projection: { _id: 0 } },
      )
      if (claimed) {
        form = claimed
        const sent = await sendFormLink(claimed, candidate, job, 'invite')
        await pending(app, stage, key, sent
          ? `Compensation form sent — due by ${t.deadline.slice(0, 10)}`
          : 'Could not deliver the compensation form — check the email address and resend the link')
      }
    }
  } else {
    await pending(app, stage, key, 'Waiting for the HR decision')
  }

  if (cfg.interview && !form.hr_interview_id) {
    try {
      const { createForStage } = await import('../interviews/service')
      const mode = cfg.interview.mode === 'f2f' ? 'f2f' : 'virtual'
      const ivStage: PipelineStage = {
        ...stage,
        type: mode === 'f2f' ? 'f2f_interview' : 'virtual_interview',
        config: {
          kind: 'interview', mode,
          ...(mode === 'virtual' ? { provider: cfg.interview.provider || 'livekit' } : {}),
          duration_min: cfg.interview.duration_min || 30,
          panel_ids: cfg.interview.panel_ids || [],
          scorecard: HR_SCORECARD,
          location: null,
          self_schedule: mode === 'virtual',
          pass_rule: 'majority_yes',
        },
      }
      // Own entry key (suffix): the interviews part's one-per-entry index stays intact,
      // and the engine treats its panel verdict on hr_round as advice only.
      const iv = await createForStage({ app, job, candidate, stage: ivStage, idempotencyKey: `${key}:hr_interview` })
      if (iv) await col.updateOne({ id: form.id }, { $set: { hr_interview_id: iv.id, updated_at: nowIso() } })
    } catch (e) {
      console.error('[ats/hr] HR interview create failed:', app.id, e)
    }
  }
}

// ─── Candidate form (public, signed link) ────────────────────────────────────

export interface HrFormContext { form: AtsHrFormDoc; app: AtsApplication; job: AtsJob; candidate: AtsCandidate }

/** Resolve a link to its form + records; null when invalid, rotated, or the stage moved on. */
export async function formFromToken(token: unknown): Promise<HrFormContext | null> {
  const p = verifyHrToken(await linkKey(), token)
  if (!p) return null
  const form = await (await atsHrForms()).findOne({ id: p.i }, { projection: { _id: 0 } })
  if (!form || form.token_nonce !== p.n || !form.collect) return null
  const [app, job, candidate] = await Promise.all([
    (await atsApplications()).findOne({ id: form.application_id, tenant_id: form.tenant_id }, { projection: { _id: 0 } }) as Promise<AtsApplication | null>,
    (await atsJobs()).findOne({ id: form.job_id, tenant_id: form.tenant_id }, { projection: { _id: 0 } }) as Promise<AtsJob | null>,
    (await atsCandidates()).findOne({ id: form.candidate_id, tenant_id: form.tenant_id }, { projection: { _id: 0 } }) as Promise<AtsCandidate | null>,
  ])
  if (!app || !job || !candidate) return null
  return { form, app, job, candidate }
}

/** Is the form still open for (re)submission? */
export function formOpen(ctx: Pick<HrFormContext, 'form' | 'app'>): boolean {
  const d = ctx.form.decision?.decision
  return isCurrentEntry(ctx.app, ctx.form.entry_key) && (ctx.app.status === 'active' || ctx.app.status === 'on_hold') && d !== 'pass' && d !== 'fail'
}

/** What the candidate's page shows (their own figures as prefill; nothing internal). */
export async function candidateFormView(ctx: HrFormContext) {
  const c = ctx.app.compensation ?? null
  const currency = c?.currency || currencyForCountry(ctx.candidate.country)
  return {
    company: await companyName(ctx.job),
    job_title: ctx.job.title,
    candidate_name: ctx.candidate.name,
    open: formOpen(ctx),
    status: ctx.form.status,
    deadline: ctx.form.deadline,
    submitted_at: ctx.form.submitted_at,
    country: ctx.candidate.country ?? null,
    currency,
    periods: periodsFor(currency, ctx.job.employment_type === 'contract'),
    hourly_allowed: ctx.job.employment_type === 'contract',
    prefill: c
      ? {
          experience_level: c.experience_level, currency: c.currency, period: c.period,
          current_ctc: c.current_ctc ?? null, currently_employed: c.currently_employed ?? null,
          breakup: c.breakup ?? null, expected_ctc: c.expected_ctc ?? null,
          notice_days: c.notice_days ?? null, negotiable: c.negotiable ?? null,
        }
      : null,
  }
}

export async function submitHrForm(token: unknown, body: unknown): Promise<{ ok: true } | { ok: false; status: number; errors: string[] }> {
  const ctx = await formFromToken(token)
  if (!ctx) return { ok: false, status: 404, errors: ['This link has expired or was replaced by a newer one. Check your latest email.'] }
  if (!formOpen(ctx)) return { ok: false, status: 409, errors: ['This form is closed — the hiring team has already moved your application forward.'] }
  const at = nowIso()
  const parsed = parseCompensation(body, { source: 'hr_form', country: ctx.candidate.country, confirmedAt: at, allowHourly: ctx.job.employment_type === 'contract' })
  if (!parsed.ok) return { ok: false, status: 400, errors: parsed.errors }
  const next = withCompensation(ctx.app, parsed.value)
  await (await atsApplications()).updateOne(
    { id: ctx.app.id, tenant_id: ctx.app.tenant_id },
    { $set: { ...next, updated_at: at } },
  )
  const first = ctx.form.status !== 'submitted'
  await (await atsHrForms()).updateOne({ id: ctx.form.id }, { $set: { status: 'submitted', submitted_at: at, updated_at: at }, $inc: { submissions: 1 } })
  const stage = ctx.job.pipeline.find((s) => s.id === ctx.form.stage_id)
  if (stage) await pending(ctx.app, stage, ctx.form.entry_key, 'Compensation confirmed by the candidate — waiting for the HR decision')
  await notifyTeam(ctx.job, ctx.app, first ? 'Compensation form submitted' : 'Compensation form updated', `${ctx.candidate.name} ${first ? 'confirmed' : 'updated'} their compensation for ${ctx.job.title}.`)
  return { ok: true }
}

// ─── Recruiter side ──────────────────────────────────────────────────────────

/** The form for the application's current HR-round entry (or the latest one). */
export async function currentForm(app: AtsApplication): Promise<AtsHrFormDoc | null> {
  const col = await atsHrForms()
  return (await col.findOne({ entry_key: stageKey(app) }, { projection: { _id: 0 } }))
    ?? (await col.find({ tenant_id: app.tenant_id, application_id: app.id }, { projection: { _id: 0 } }).sort({ created_at: -1 }).limit(1).toArray())[0]
    ?? null
}

/** Has compensation been confirmed for this stage entry (form, or HR entered it)? */
export function compensationConfirmed(app: AtsApplication, form: AtsHrFormDoc | null): boolean {
  if (form?.status === 'submitted' && isCurrentEntry(app, form.entry_key)) return true
  const c = app.compensation
  return !!c && c.source === 'hr_form' && !!c.confirmed_at && c.confirmed_at >= app.stage_entered_at
}

export async function hrRoundStatus(actor: AtsActor, app: AtsApplication, job: AtsJob) {
  const stage = job.pipeline.find((s) => s.id === app.stage_id)
  const form = await currentForm(app)
  return {
    in_hr_round: stage?.type === 'hr_round',
    collect: stage ? hrConfig(stage)?.collect_compensation ?? false : false,
    form: form ? { ...publicHrForm(form), decision: form.decision ? { ...form.decision, offered_ctc: canSeeCompensation(actor.role) ? form.decision.offered_ctc : null } : null } : null,
    confirmed: compensationConfirmed(app, form),
    can_resend: !!form && form.collect && stage?.type === 'hr_round' && isCurrentEntry(app, form.entry_key) && !['pass', 'fail'].includes(form.decision?.decision || ''),
  }
}

export async function resendHrLink(app: AtsApplication, job: AtsJob): Promise<AtsHrFormDoc> {
  const stage = job.pipeline.find((s) => s.id === app.stage_id)
  const cfg = stage ? hrConfig(stage) : null
  if (!stage || !cfg) throw new AtsError(409, 'This candidate is not in an HR round')
  if (!cfg.collect_compensation) throw new AtsError(409, 'This HR round doesn’t collect compensation')
  const candidate = (await (await atsCandidates()).findOne({ id: app.candidate_id, tenant_id: app.tenant_id }, { projection: { _id: 0 } })) as AtsCandidate | null
  if (!candidate?.email && !(candidate?.phone && candidate.consent?.whatsapp === true)) throw new AtsError(409, 'The candidate has no email address — add one first')
  const col = await atsHrForms()
  const form = await col.findOne({ entry_key: stageKey(app) }, { projection: { _id: 0 } })
  if (!form) throw new AtsError(409, 'Move the candidate into the HR round again to start a new form')
  if (form.decision && form.decision.decision !== 'hold') throw new AtsError(409, 'The HR decision is already recorded')
  const now = new Date()
  const t = formTimes(now, cfg.form_deadline_days ?? 3)
  const updated = await col.findOneAndUpdate(
    { id: form.id },
    {
      $set: {
        token_nonce: newHrNonce(), // older links stop working
        status: form.status === 'submitted' ? 'submitted' : 'sent',
        sent_at: now.toISOString(), deadline: t.deadline, remind_at: t.remind_at, reminded_at: null, updated_at: nowIso(),
      },
    },
    { returnDocument: 'after', projection: { _id: 0 } },
  )
  if (!updated) throw new AtsError(409, 'Could not resend — refresh and try again')
  const ok = await sendFormLink(updated, candidate!, job, 'invite')
  if (!ok) throw new AtsError(502, 'The link could not be delivered. Check the candidate’s email address.')
  return updated
}

/**
 * HR decision. pass / fail → the stage result (engine applies advance / on_fail);
 * hold → application on hold. offered_ctc is stored on the form (staff only).
 */
export async function recordHrDecision(actor: AtsActor, appId: string, body: Record<string, unknown>): Promise<AtsApplication> {
  const app = (await (await atsApplications()).findOne({ id: appId, tenant_id: actor.tenantId }, { projection: { _id: 0 } })) as AtsApplication | null
  if (!app) throw new AtsError(404, 'Application not found')
  const job = (await (await atsJobs()).findOne({ id: app.job_id, tenant_id: actor.tenantId }, { projection: { _id: 0 } })) as AtsJob | null
  if (!job) throw new AtsError(404, 'Application not found')
  const stage = job.pipeline.find((s) => s.id === app.stage_id) || null
  const cfg = stage ? hrConfig(stage) : null
  const form = await currentForm(app)
  const override = body.override && typeof body.override === 'object' ? (body.override as { reason?: unknown }) : body.override === true ? { reason: body.override_reason } : null
  const g = hrDecisionGate({
    decision: body.decision,
    stageType: stage?.type,
    appStatus: app.status,
    collect: !!cfg?.collect_compensation,
    formSubmitted: compensationConfirmed(app, form),
    override,
  })
  if (!g.ok) throw new AtsError(g.status, g.error)
  const notes = typeof body.notes === 'string' ? body.notes.replace(/[\u0000-\u0008\u000b-\u001f]+/g, ' ').trim().slice(0, 2000) : ''
  let offered: number | null = null
  const period = app.compensation?.period || 'year'
  if (body.offered_ctc !== undefined && body.offered_ctc !== null && body.offered_ctc !== '') {
    const n = Number(String(body.offered_ctc).replace(/[,\s]/g, ''))
    if (!Number.isFinite(n) || n <= 0 || n > COMP_MAX[period]) throw new AtsError(400, 'Offered CTC must be a positive amount')
    offered = Math.round(n * 100) / 100
  }
  const key = stageKey(app)
  const decision = {
    decision: g.decision, notes: notes || null, offered_ctc: offered,
    currency: offered !== null ? app.compensation?.currency || currencyForCountry(null) : null,
    period: offered !== null ? period : null,
    override_reason: g.overrideReason, by: actor.userId, at: nowIso(),
  }
  if (form && isCurrentEntry(app, form.entry_key)) {
    await (await atsHrForms()).updateOne({ id: form.id }, { $set: { decision, updated_at: nowIso() } })
  } else {
    // No form for this entry (stage entered before the HR part existed, or collect off and the handler failed).
    const ts = nowIso()
    await (await atsHrForms()).updateOne(
      { entry_key: key },
      {
        $set: { decision, updated_at: ts },
        $setOnInsert: {
          id: newId(), tenant_id: app.tenant_id, application_id: app.id, job_id: job.id, candidate_id: app.candidate_id, stage_id: stage!.id,
          entry_key: key, collect: !!cfg?.collect_compensation, status: 'not_sent', token_nonce: newHrNonce(), sent_at: null, deadline: null,
          remind_at: null, reminded_at: null, submitted_at: null, submissions: 0, hr_interview_id: null, created_at: ts,
        },
      },
      { upsert: true },
    )
  }
  // Summaries never carry figures (client-visible stages may show results).
  const who = actor.name || 'HR'
  const tail = `${g.overrideReason ? ` (passed without the compensation form: ${g.overrideReason})` : ''}${notes ? ` — ${notes.slice(0, 300)}` : ''}`
  if (g.decision === 'hold') {
    await recordStageResult(app.id, { stage_id: stage!.id, outcome: 'pending', summary: `On hold after the HR round by ${who}${tail}`, at: nowIso() }, { entryKey: key })
    return setApplicationStatus(actor, app.id, 'on_hold', `HR round${notes ? `: ${notes.slice(0, 300)}` : ''}`)
  }
  if (app.status === 'on_hold') await setApplicationStatus(actor, app.id, 'active', 'HR decision recorded')
  return recordStageResult(app.id, {
    stage_id: stage!.id,
    outcome: g.decision,
    summary: `${g.decision === 'pass' ? 'Passed' : 'Did not pass'} the HR round (${who})${tail}`,
    at: nowIso(),
  }, { entryKey: key })
}

// ─── Scheduler sweep ─────────────────────────────────────────────────────────

/** Reminders at half the deadline; a missed deadline is flagged to the team (HR still decides). Never throws. */
export async function sweepHrForms(now = new Date()): Promise<{ reminded: number; expired: number }> {
  let reminded = 0
  let expired = 0
  try {
    const col = await atsHrForms()
    const iso = now.toISOString()
    const ctxFor = async (f: AtsHrFormDoc) => {
      const [app, job, candidate] = await Promise.all([
        (await atsApplications()).findOne({ id: f.application_id, tenant_id: f.tenant_id }, { projection: { _id: 0 } }) as Promise<AtsApplication | null>,
        (await atsJobs()).findOne({ id: f.job_id, tenant_id: f.tenant_id }, { projection: { _id: 0 } }) as Promise<AtsJob | null>,
        (await atsCandidates()).findOne({ id: f.candidate_id, tenant_id: f.tenant_id }, { projection: { _id: 0 } }) as Promise<AtsCandidate | null>,
      ])
      return app && job && candidate && isCurrentEntry(app, f.entry_key) && app.status === 'active' ? { app, job, candidate } : null
    }
    const due = await col.find({ status: 'sent', reminded_at: null, remind_at: { $lte: iso }, deadline: { $gt: iso } }, { projection: { _id: 0 } }).limit(200).toArray()
    for (const f of due) {
      const claimed = await col.updateOne({ id: f.id, status: 'sent', reminded_at: null }, { $set: { reminded_at: iso, updated_at: iso } })
      if (!claimed.modifiedCount) continue
      const ctx = await ctxFor(f)
      if (ctx && (await sendFormLink(f, ctx.candidate, ctx.job, 'reminder'))) reminded++
    }
    const late = await col.find({ status: 'sent', deadline: { $lt: iso } }, { projection: { _id: 0 } }).limit(200).toArray()
    for (const f of late) {
      const claimed = await col.updateOne({ id: f.id, status: 'sent' }, { $set: { status: 'expired', updated_at: iso } })
      if (!claimed.modifiedCount) continue
      const ctx = await ctxFor(f)
      if (!ctx) continue
      const stage = ctx.job.pipeline.find((s) => s.id === f.stage_id)
      if (stage) await pending(ctx.app, stage, f.entry_key, 'The compensation form wasn’t submitted by the deadline — resend the link or decide')
      await notifyTeam(ctx.job, ctx.app, 'Compensation form overdue', `${ctx.candidate.name} hasn’t confirmed their compensation for ${ctx.job.title}.`)
      expired++
    }
  } catch (e) {
    console.error('[ats/hr] sweep failed:', e)
  }
  return { reminded, expired }
}
