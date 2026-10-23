/**
 * Interview lifecycle: create on stage entry, self-schedule slots, schedule /
 * reschedule / cancel / complete / no-show, panel edits, scorecards and the
 * panel decision (→ recordStageResult). Routes authorise first; every query
 * here is tenant scoped by the interview's tenant_id.
 */
import type { AtsActor, AtsApplication, AtsCandidate, AtsJob, MeetingProvider, PipelineStage, ScorecardTemplate, StageHandlerContext } from '@/lib/ats/contract'
import { atsApplications, atsCandidates, atsJobs } from '@/lib/ats/db'
import { getAppOrigin } from '@/lib/app-origin'
import { getMongoDb } from '@/lib/mongodb'
import { atsInterviews, interviewSettings, newId, nowIso, type AtsInterviewDoc, type F2fLocation } from './db'
import { decidePanel, parseScorecard, type PassRule } from './pass-rules'
import { computeSlots, type BusyInterval, type Slot } from './slots'
import { interviewLinkKey, newNonce, signToken, verifyToken } from './tokens'
import { isValidTimeZone } from './tz'
import { getMeetingProvider, ProviderError, type MeetingInput } from './providers'
import { isConnected, providerContext } from './integrations'
import { validManualUrl } from './providers/manual'
import { inviteToSchedule, noticeCandidate, noticePanel, notifySchedulers, panelLink, type NoticeKind } from './notify'

// ─── Constants ───────────────────────────────────────────────────────────────

/** Scorecards close this long after the interview ends; then ≥1 card decides. */
export const SCORECARD_DEADLINE_HOURS = 48
/** Candidate join page opens this early and stays open this long after the end. */
export const JOIN_EARLY_MIN = 15
export const JOIN_LATE_MIN = 60
const SELF_SCHEDULE_TTL_DAYS = 14

export class InterviewError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message)
  }
}

// ─── Stage config ────────────────────────────────────────────────────────────

export interface InterviewStageConfig {
  mode: 'virtual' | 'f2f'
  provider: MeetingProvider
  duration_min: number
  panel_ids: string[]
  scorecard: ScorecardTemplate
  location: string | null
  self_schedule: boolean
  pass_rule: PassRule
  pass_score: number | null
  fallback_to_livekit: boolean
}

export function interviewConfig(stage: PipelineStage): InterviewStageConfig | null {
  if (stage.type !== 'virtual_interview' && stage.type !== 'f2f_interview') return null
  const c = stage.config && stage.config.kind === 'interview' ? stage.config : null
  const extra = (c || {}) as { fallback_to_livekit?: unknown }
  return {
    mode: stage.type === 'f2f_interview' ? 'f2f' : 'virtual',
    provider: c?.provider || 'livekit',
    duration_min: Math.max(10, Math.min(480, c?.duration_min || 45)),
    panel_ids: c?.panel_ids || [],
    scorecard: c?.scorecard?.criteria?.length ? c.scorecard : { criteria: [{ id: 'overall', label: 'Overall' }] },
    location: c?.location ?? null,
    self_schedule: !!c?.self_schedule,
    pass_rule: c?.pass_rule || 'majority_yes',
    pass_score: c?.pass_score ?? null,
    fallback_to_livekit: extra.fallback_to_livekit === true,
  }
}

// ─── Lookups ─────────────────────────────────────────────────────────────────

export type PanelMember = AtsInterviewDoc['panel'][number]

/** Active ATS members of the tenant with these user ids (unknown ids dropped). */
export async function resolvePanel(tenantId: string, userIds: string[]): Promise<PanelMember[]> {
  const ids = [...new Set(userIds.filter((x) => typeof x === 'string' && x))].slice(0, 10)
  if (!ids.length) return []
  const db = await getMongoDb()
  const members = await db.collection('ats_members')
    .find({ tenant_id: tenantId, user_id: { $in: ids }, status: 'active' }, { projection: { user_id: 1, email: 1, name: 1 } })
    .toArray()
  const byId = new Map(members.map((m) => [String(m.user_id), m]))
  // tenant_admins are ATS admins without a member row
  const missing = ids.filter((id) => !byId.has(id))
  const users = missing.length
    ? await db.collection('user').find({ id: { $in: missing }, tenantId, role: 'tenant_admin' }, { projection: { id: 1, email: 1, name: 1, fullName: 1 } }).toArray()
    : []
  const out: PanelMember[] = []
  for (const id of ids) {
    const m = byId.get(id)
    if (m?.email) { out.push({ user_id: id, email: String(m.email).toLowerCase(), ...(m.name ? { name: String(m.name) } : {}) }); continue }
    const u = users.find((x) => String(x.id) === id)
    if (u?.email) out.push({ user_id: id, email: String(u.email).toLowerCase(), ...((u.fullName || u.name) ? { name: String(u.fullName || u.name) } : {}) })
  }
  return out
}

export async function tenantInterviewSettings(tenantId: string): Promise<{ timezone: string; work_start_hour: number; work_end_hour: number; default_provider: MeetingProvider | null }> {
  const doc = await (await interviewSettings()).findOne({ tenant_id: tenantId }).catch(() => null)
  let tz = doc?.timezone && isValidTimeZone(doc.timezone) ? doc.timezone : ''
  if (!tz) {
    try {
      const { getGeneralSettings } = await import('@/lib/platform-general-settings-server')
      const g = await getGeneralSettings()
      tz = isValidTimeZone(g.timezone) ? g.timezone : 'UTC'
    } catch {
      tz = 'UTC'
    }
  }
  return {
    timezone: tz,
    work_start_hour: doc?.work_start_hour ?? 9,
    work_end_hour: doc?.work_end_hour ?? 18,
    default_provider: doc?.default_provider ?? null,
  }
}

async function companyName(job: Pick<AtsJob, 'tenant_id' | 'client_id'>): Promise<string> {
  try {
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

export async function loadContext(iv: Pick<AtsInterviewDoc, 'tenant_id' | 'application_id' | 'job_id' | 'candidate_id'>): Promise<{ app: AtsApplication | null; job: AtsJob | null; candidate: AtsCandidate | null }> {
  const [app, job, candidate] = await Promise.all([
    (await atsApplications()).findOne({ id: iv.application_id, tenant_id: iv.tenant_id }, { projection: { _id: 0 } }),
    (await atsJobs()).findOne({ id: iv.job_id, tenant_id: iv.tenant_id }, { projection: { _id: 0 } }),
    (await atsCandidates()).findOne({ id: iv.candidate_id, tenant_id: iv.tenant_id }, { projection: { _id: 0 } }),
  ])
  return { app: app as AtsApplication | null, job: job as AtsJob | null, candidate: candidate as AtsCandidate | null }
}

export async function getInterview(tenantId: string, id: string): Promise<AtsInterviewDoc | null> {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null
  return (await atsInterviews()).findOne({ id, tenant_id: tenantId }, { projection: { _id: 0 } })
}

// ─── Idempotent side effects ─────────────────────────────────────────────────

/** True the first time `key` is claimed for this interview. */
export async function claimSend(ivId: string, key: string): Promise<boolean> {
  const r = await (await atsInterviews()).updateOne({ id: ivId, sent: { $ne: key } }, { $addToSet: { sent: key } })
  return r.modifiedCount === 1
}

// ─── Candidate links ─────────────────────────────────────────────────────────

export async function candidateLink(iv: Pick<AtsInterviewDoc, 'id' | 'token_nonce' | 'scheduled_at' | 'duration_min'>, kind: 'join' | 'sched'): Promise<string> {
  const exp = kind === 'join' && iv.scheduled_at
    ? Date.parse(iv.scheduled_at) + (iv.duration_min + JOIN_LATE_MIN + 24 * 60) * 60_000
    : Date.now() + SELF_SCHEDULE_TTL_DAYS * 86_400_000
  const token = signToken(await interviewLinkKey(), { k: kind, i: iv.id, n: iv.token_nonce, e: exp })
  return `${getAppOrigin()}/interview/${kind === 'join' ? 'join' : 'schedule'}/${token}`
}

/** The link the candidate uses: their signed page for built-in video, else the provider's link. */
export async function candidateJoinUrl(iv: AtsInterviewDoc): Promise<string | null> {
  if (iv.mode !== 'virtual') return null
  if ((iv.provider || 'livekit') === 'livekit') return candidateLink(iv, 'join')
  return iv.join_url ?? null
}

/** Resolve a candidate token to its interview (nonce must still match). */
export async function interviewFromToken(token: unknown, kind: 'join' | 'sched'): Promise<AtsInterviewDoc | null> {
  const p = verifyToken(await interviewLinkKey(), token, kind)
  if (!p) return null
  const iv = await (await atsInterviews()).findOne({ id: p.i }, { projection: { _id: 0 } })
  if (!iv || iv.token_nonce !== p.n) return null
  return iv
}

export function joinWindowOpen(iv: Pick<AtsInterviewDoc, 'scheduled_at' | 'duration_min' | 'status'>, now = Date.now()): 'early' | 'open' | 'closed' {
  if (iv.status !== 'scheduled' || !iv.scheduled_at) return 'closed'
  const s = Date.parse(iv.scheduled_at)
  if (now < s - JOIN_EARLY_MIN * 60_000) return 'early'
  if (now > s + (iv.duration_min + JOIN_LATE_MIN) * 60_000) return 'closed'
  return 'open'
}

// ─── Create (stage handler) ──────────────────────────────────────────────────

/** Create the interview for this stage entry (idempotent) and invite/notify. */
export async function createForStage(ctx: Pick<StageHandlerContext, 'app' | 'job' | 'candidate' | 'stage' | 'idempotencyKey'>, createdBy = 'system'): Promise<AtsInterviewDoc | null> {
  const cfg = interviewConfig(ctx.stage)
  if (!cfg) return null
  const settings = await tenantInterviewSettings(ctx.app.tenant_id)
  const panel = await resolvePanel(ctx.app.tenant_id, cfg.panel_ids)
  const now = nowIso()
  const doc: AtsInterviewDoc = {
    id: newId(),
    tenant_id: ctx.app.tenant_id,
    application_id: ctx.app.id,
    job_id: ctx.job.id,
    candidate_id: ctx.candidate.id,
    stage_id: ctx.stage.id,
    mode: cfg.mode,
    ...(cfg.mode === 'virtual' ? { provider: cfg.provider } : {}),
    join_url: null,
    meeting_id: null,
    location: cfg.mode === 'f2f' ? cfg.location : null,
    location_details: cfg.mode === 'f2f' && cfg.location ? { address: cfg.location } : null,
    panel,
    scheduled_at: null,
    duration_min: cfg.duration_min,
    timezone: settings.timezone,
    status: 'awaiting_schedule',
    scorecards: [],
    scorecard_template: cfg.scorecard,
    pass_rule: cfg.pass_rule,
    pass_score: cfg.pass_score,
    self_schedule: cfg.self_schedule,
    fallback_to_livekit: cfg.fallback_to_livekit,
    entry_key: ctx.idempotencyKey,
    token_nonce: newNonce(),
    sent: [],
    candidate_name: ctx.candidate.name,
    candidate_email: ctx.candidate.email,
    job_title: ctx.job.title,
    stage_name: ctx.stage.name,
    created_by: createdBy,
    created_at: now,
    updated_at: now,
  }
  const col = await atsInterviews()
  try {
    await col.insertOne({ ...doc })
  } catch (e) {
    if ((e as { code?: number })?.code === 11000) return col.findOne({ entry_key: ctx.idempotencyKey }, { projection: { _id: 0 } })
    throw e
  }

  const company = await companyName(ctx.job)
  if (cfg.self_schedule && ctx.candidate.email && panel.length) {
    if (await claimSend(doc.id, 'self_schedule_invite')) {
      await inviteToSchedule(doc, ctx.candidate, await candidateLink(doc, 'sched'), company)
    }
  } else if (await claimSend(doc.id, 'needs_schedule')) {
    const why = !panel.length ? ' Add interviewers to the panel first.' : cfg.self_schedule && !ctx.candidate.email ? ' The candidate has no email, so they can\'t pick a time themselves.' : ''
    await notifySchedulers(doc, ctx.job.recruiter_ids || [], 'Interview to schedule', `${ctx.candidate.name} reached ${ctx.stage.name} for ${ctx.job.title}.${why}`)
  }
  return doc
}

// ─── Availability ────────────────────────────────────────────────────────────

/** Busy intervals of these users: calendar entries + their other scheduled interviews. */
export async function busyFor(userIds: string[], from: Date, to: Date, excludeInterviewId?: string): Promise<BusyInterval[]> {
  if (!userIds.length) return []
  const db = await getMongoDb()
  const fromIso = from.toISOString()
  const toIso = to.toISOString()
  const events = await db.collection('user_calendar_events')
    .find({ userId: { $in: userIds }, start: { $lt: toIso }, ...(excludeInterviewId ? { ref_id: { $ne: excludeInterviewId } } : {}) }, { projection: { start: 1, end: 1 } })
    .limit(2000).toArray()
  const ivs = await (await atsInterviews())
    .find({ 'panel.user_id': { $in: userIds }, status: 'scheduled', scheduled_at: { $gte: new Date(from.getTime() - 86_400_000).toISOString(), $lt: toIso }, ...(excludeInterviewId ? { id: { $ne: excludeInterviewId } } : {}) }, { projection: { scheduled_at: 1, duration_min: 1 } })
    .limit(1000).toArray()
  const out: BusyInterval[] = []
  for (const e of events) {
    const s = String(e.start || '')
    // All-day / end-less entries block one hour.
    const end = e.end ? String(e.end) : new Date(Date.parse(s) + 3_600_000).toISOString()
    if (end > fromIso) out.push({ start: s, end })
  }
  for (const iv of ivs) {
    if (!iv.scheduled_at) continue
    out.push({ start: iv.scheduled_at, end: new Date(Date.parse(iv.scheduled_at) + iv.duration_min * 60_000).toISOString() })
  }
  return out
}

export async function slotsFor(iv: AtsInterviewDoc, now = new Date()): Promise<{ slots: Slot[]; timezone: string }> {
  const s = await tenantInterviewSettings(iv.tenant_id)
  const tz = iv.timezone && isValidTimeZone(iv.timezone) ? iv.timezone : s.timezone
  const horizon = new Date(now.getTime() + 15 * 86_400_000)
  const busy = await busyFor(iv.panel.map((p) => p.user_id), now, horizon, iv.id)
  return {
    timezone: tz,
    slots: computeSlots({ now, timeZone: tz, durationMin: iv.duration_min, busy, workStartHour: s.work_start_hour, workEndHour: s.work_end_hour }),
  }
}

// ─── Schedule / reschedule ───────────────────────────────────────────────────

export interface ScheduleInput {
  scheduled_at: string
  duration_min?: number
  provider?: MeetingProvider
  manual_url?: string
  location?: Partial<F2fLocation> | null
  timezone?: string
}

function cleanLocation(raw: Partial<F2fLocation> | null | undefined, fallback: string | null): F2fLocation | null {
  const s = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '')
  const address = s(raw?.address, 300) || fallback || ''
  if (!address) return null
  const map = s(raw?.map_url, 1000)
  return {
    address,
    room: s(raw?.room, 120) || null,
    map_url: map && /^https:\/\//i.test(map) ? map : null,
    instructions: s(raw?.instructions, 1000) || null,
  }
}

/**
 * Book (or move) the interview. Creates/updates the meeting, calendar entries,
 * invites; a provider failure leaves the interview unchanged and throws an
 * InterviewError (409 not_connected → the UI asks the recruiter).
 */
export async function scheduleInterview(by: AtsActor | 'system' | 'candidate', ivId: string, tenantId: string, input: ScheduleInput, f: typeof fetch = fetch): Promise<AtsInterviewDoc> {
  const iv = await getInterview(tenantId, ivId)
  if (!iv) throw new InterviewError(404, 'Interview not found')
  if (iv.status === 'completed') throw new InterviewError(409, 'This interview is already completed.')
  const startMs = Date.parse(input.scheduled_at)
  if (!Number.isFinite(startMs)) throw new InterviewError(400, 'Pick a valid date and time.')
  if (startMs < Date.now() - 5 * 60_000) throw new InterviewError(400, 'Pick a time in the future.')
  if (startMs > Date.now() + 180 * 86_400_000) throw new InterviewError(400, 'Pick a time within the next 6 months.')
  const start = new Date(startMs).toISOString()
  const duration = Math.max(10, Math.min(480, Math.round(Number(input.duration_min) || iv.duration_min)))
  const tz = input.timezone && isValidTimeZone(input.timezone) ? input.timezone : iv.timezone || (await tenantInterviewSettings(tenantId)).timezone
  if (!iv.panel.length) throw new InterviewError(400, 'Add at least one interviewer to the panel first.')

  const { app, job, candidate } = await loadContext(iv)
  if (!app || !job) throw new InterviewError(404, 'Application not found')
  if (app.status !== 'active' && app.status !== 'on_hold') throw new InterviewError(409, 'This application is no longer active.')

  const wasScheduled = iv.status === 'scheduled' && !!iv.scheduled_at
  const nonce = newNonce()
  const set: Partial<AtsInterviewDoc> = {
    scheduled_at: start, duration_min: duration, timezone: tz, token_nonce: nonce, status: 'scheduled',
    requested_slot: null, last_error: null, updated_at: nowIso(), booked_at: nowIso(),
    scorecard_deadline_at: new Date(startMs + (duration + SCORECARD_DEADLINE_HOURS * 60) * 60_000).toISOString(),
  }

  if (iv.mode === 'f2f') {
    const loc = cleanLocation(input.location, iv.location_details?.address || iv.location || null)
    if (!loc) throw new InterviewError(400, 'Add the interview address.')
    Object.assign(set, { location_details: loc, location: [loc.address, loc.room].filter(Boolean).join(', '), join_url: null, meeting_id: null })
  } else {
    let provider: MeetingProvider = input.provider || iv.provider || 'livekit'
    let note: string | null = null
    if (!(await isConnected(tenantId, provider))) {
      if (iv.fallback_to_livekit) {
        note = `${provider} isn't connected, so the built-in video room was used.`
        provider = 'livekit'
      } else {
        const name = provider === 'zoom' ? 'Zoom' : provider === 'teams' ? 'Microsoft Teams' : 'Google Meet'
        throw new InterviewError(409, `${name} isn't connected for your organisation. Connect it in Hiring settings → Integrations, or pick another meeting type.`, 'not_connected')
      }
    }
    const meeting: MeetingInput = {
      interviewId: iv.id,
      title: `Interview: ${job.title} — ${candidate?.name || iv.candidate_name || 'candidate'}`,
      description: `${iv.stage_name || 'Interview'} for ${job.title}.\nPanel: ${iv.panel.map((p) => p.name || p.email).join(', ')}`,
      start,
      durationMin: duration,
      timeZone: tz,
      // External calendars invite everyone; the candidate's address comes from the record.
      attendees: [
        ...(candidate?.email ? [{ email: candidate.email, name: candidate.name }] : []),
        ...iv.panel.map((p) => ({ email: p.email, ...(p.name ? { name: p.name } : {}) })),
      ],
      manualUrl: input.manual_url ?? (provider === 'manual' && iv.provider === 'manual' ? iv.join_url ?? undefined : undefined),
    }
    if (provider === 'manual' && !validManualUrl(meeting.manualUrl)) throw new InterviewError(400, 'Paste the meeting link (it must start with https://).')
    const impl = getMeetingProvider(provider)
    const ctx = providerContext(tenantId, provider, f)
    let result
    try {
      result = iv.meeting_id && iv.provider === provider && wasScheduled
        ? await impl.updateMeeting(ctx, iv.meeting_id, meeting)
        : await impl.createMeeting(ctx, meeting)
      // An update keeps the old link when the provider's response omits it.
      if (!result.join_url && iv.join_url && iv.provider === provider) result = { ...result, join_url: iv.join_url }
      if (!result.join_url) throw new ProviderError(provider, 'The meeting app did not return a join link.')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      await (await atsInterviews()).updateOne({ id: iv.id, tenant_id: tenantId }, { $set: { last_error: msg.slice(0, 300), updated_at: nowIso() } })
      const code = e instanceof ProviderError ? e.code : 'api'
      throw new InterviewError(code === 'not_connected' ? 409 : 502, code === 'auth' || code === 'not_connected' || code === 'config' ? msg : `Couldn't create the meeting: ${msg}`, code)
    }
    // Moving to a different provider: cancel the old meeting (best effort).
    if (iv.meeting_id && iv.provider && iv.provider !== provider && wasScheduled) {
      await getMeetingProvider(iv.provider).cancelMeeting(providerContext(tenantId, iv.provider, f), iv.meeting_id).catch(() => {})
    }
    Object.assign(set, { provider, join_url: result.join_url, meeting_id: result.meeting_id, host_url: result.host_url ?? null, last_error: note })
  }

  const col = await atsInterviews()
  const updated = await col.findOneAndUpdate(
    { id: iv.id, tenant_id: tenantId, status: { $ne: 'completed' } },
    { $set: set },
    { returnDocument: 'after', projection: { _id: 0 } },
  )
  if (!updated) throw new InterviewError(409, 'The interview changed. Reload and try again.')

  await writePanelCalendar(updated)
  void import('@/lib/automation/events').then(({ emit }) => emit('interview.scheduled', {
    interview_id: updated.id, kind: 'hiring', title: updated.stage_name || 'Interview', candidate_name: updated.candidate_name ?? null, candidate_email: candidate?.email ?? null,
    scheduled_at: updated.scheduled_at, duration_min: updated.duration_min, join_url: null, application_id: updated.application_id, job_id: updated.job_id,
  }, { tenantId, idempotencyKey: `interview.scheduled:${updated.id}:${nonce}` })).catch((e) => console.error('[automation] emit failed:', e))
  const kind: NoticeKind = wasScheduled ? 'rescheduled' : 'scheduled'
  // The nonce is new on every booking, so this key is unique per booking.
  if (await claimSend(updated.id, `invite:${nonce}`)) {
    const company = await companyName(job)
    await noticeCandidate(updated, candidate, kind, await candidateJoinUrl(updated), company)
    await noticePanel(updated, kind, panelLink(updated))
    if (by === 'candidate') {
      await notifySchedulers(updated, job.recruiter_ids || [], 'Candidate booked an interview', `${updated.candidate_name} picked a time for ${updated.stage_name} (${job.title}).`)
    }
  }
  return updated
}

/** Panel members' in-app calendar entries for this interview (replaced on every change). */
async function writePanelCalendar(iv: AtsInterviewDoc): Promise<void> {
  try {
    const col = (await getMongoDb()).collection('user_calendar_events')
    await col.deleteMany({ source: 'ats_interview', ref_id: iv.id })
    if (iv.status !== 'scheduled' || !iv.scheduled_at) return
    const end = new Date(Date.parse(iv.scheduled_at) + iv.duration_min * 60_000).toISOString()
    const now = nowIso()
    const url = `/dashboard/hiring/interviews/${iv.id}`
    await col.insertMany(iv.panel.map((p) => ({
      id: newId(),
      userId: p.user_id,
      title: `Interview: ${iv.candidate_name || 'candidate'} — ${iv.job_title || ''}`.trim(),
      description: iv.stage_name || '',
      start: iv.scheduled_at!,
      end,
      url,
      source: 'ats_interview',
      ref_id: iv.id,
      tenant_id: iv.tenant_id,
      createdAt: now,
    })))
  } catch (e) {
    console.error('[ats/interviews] calendar write failed:', e)
  }
}

// ─── Cancel / complete / no-show / panel ─────────────────────────────────────

export async function cancelInterview(ivId: string, tenantId: string, reason: string | null, f: typeof fetch = fetch): Promise<AtsInterviewDoc> {
  const iv = await getInterview(tenantId, ivId)
  if (!iv) throw new InterviewError(404, 'Interview not found')
  if (iv.status === 'completed' || iv.status === 'cancelled') throw new InterviewError(409, `This interview is already ${iv.status}.`)
  const wasScheduled = iv.status === 'scheduled'
  if (iv.mode === 'virtual' && iv.meeting_id && iv.provider && wasScheduled) {
    await getMeetingProvider(iv.provider).cancelMeeting(providerContext(tenantId, iv.provider, f), iv.meeting_id).catch((e) => {
      console.error('[ats/interviews] provider cancel failed:', e)
    })
  }
  const nonce = newNonce()
  const updated = await (await atsInterviews()).findOneAndUpdate(
    { id: iv.id, tenant_id: tenantId, status: iv.status },
    { $set: { status: 'cancelled', token_nonce: nonce, last_error: reason ? `Cancelled: ${reason.slice(0, 200)}` : null, updated_at: nowIso() } },
    { returnDocument: 'after', projection: { _id: 0 } },
  )
  if (!updated) throw new InterviewError(409, 'The interview changed. Reload and try again.')
  await writePanelCalendar(updated)
  // AUTO-090: hiring cancellations reach workflows too (and stop runs waiting on this interview).
  void import('@/lib/automation/interview-events').then(async ({ cancelWaitingInterviewRuns }) => {
    await cancelWaitingInterviewRuns(updated.id, 'Interview was cancelled')
    const { emit } = await import('@/lib/automation/events')
    const { candidate } = await loadContext(updated).catch(() => ({ candidate: null }))
    await emit('interview.cancelled', {
      interview_id: updated.id, kind: 'hiring', title: updated.stage_name || 'Interview', candidate_name: updated.candidate_name ?? null, candidate_email: (candidate as { email?: string | null } | null)?.email ?? null,
      scheduled_at: updated.scheduled_at ?? null, application_id: updated.application_id, job_id: updated.job_id,
    }, { tenantId, idempotencyKey: `interview.cancelled:${updated.id}` })
  }).catch((e) => console.error('[automation] emit failed:', e))
  if (wasScheduled && (await claimSend(updated.id, `cancel:${nonce}`))) {
    const { job, candidate } = await loadContext(updated)
    await noticeCandidate(updated, candidate, 'cancelled', null, job ? await companyName(job) : 'our company')
    await noticePanel(updated, 'cancelled', panelLink(updated))
  }
  return updated
}

export async function setOutcomeStatus(ivId: string, tenantId: string, status: 'completed' | 'no_show'): Promise<AtsInterviewDoc> {
  const iv = await getInterview(tenantId, ivId)
  if (!iv) throw new InterviewError(404, 'Interview not found')
  if (iv.status !== 'scheduled' && !(status === 'completed' && iv.status === 'no_show')) {
    throw new InterviewError(409, 'Only a scheduled interview can be marked like that.')
  }
  const updated = await (await atsInterviews()).findOneAndUpdate(
    { id: iv.id, tenant_id: tenantId, status: iv.status },
    { $set: { status, updated_at: nowIso() } },
    { returnDocument: 'after', projection: { _id: 0 } },
  )
  if (!updated) throw new InterviewError(409, 'The interview changed. Reload and try again.')
  if (status === 'completed') await maybeFinalize(updated.id, tenantId)
  return updated
}

export async function updatePanel(ivId: string, tenantId: string, userIds: string[]): Promise<AtsInterviewDoc> {
  const iv = await getInterview(tenantId, ivId)
  if (!iv) throw new InterviewError(404, 'Interview not found')
  if (iv.status === 'completed' || iv.status === 'cancelled') throw new InterviewError(409, `This interview is ${iv.status}.`)
  const panel = await resolvePanel(tenantId, userIds)
  if (!panel.length) throw new InterviewError(400, 'Pick at least one active hiring-team member.')
  const before = new Set(iv.panel.map((p) => p.user_id))
  const updated = await (await atsInterviews()).findOneAndUpdate(
    { id: iv.id, tenant_id: tenantId },
    { $set: { panel, updated_at: nowIso() } },
    { returnDocument: 'after', projection: { _id: 0 } },
  )
  if (!updated) throw new InterviewError(404, 'Interview not found')
  if (updated.status === 'scheduled') {
    await writePanelCalendar(updated)
    const added = panel.filter((p) => !before.has(p.user_id))
    if (added.length) await noticePanel(updated, 'scheduled', panelLink(updated), added)
  }
  return updated
}

// ─── Self-schedule ───────────────────────────────────────────────────────────

/** Candidate picked a slot. Books it, or records the request for the recruiter. */
export async function selfSchedule(iv: AtsInterviewDoc, slotStart: string, f: typeof fetch = fetch): Promise<{ booked: boolean; interview: AtsInterviewDoc }> {
  if (!iv.self_schedule) throw new InterviewError(403, 'This interview is booked by the hiring team.')
  if (iv.status !== 'awaiting_schedule') throw new InterviewError(409, iv.status === 'scheduled' ? 'Your interview is already booked.' : 'This interview can no longer be booked.')
  const { slots } = await slotsFor(iv)
  const pick = slots.find((s) => Date.parse(s.start) === Date.parse(slotStart))
  if (!pick) throw new InterviewError(409, 'That time is no longer available. Pick another one.')
  try {
    const updated = await scheduleInterview('candidate', iv.id, iv.tenant_id, { scheduled_at: pick.start }, f)
    return { booked: true, interview: updated }
  } catch (e) {
    if (!(e instanceof InterviewError) || e.status < 409) throw e
    // Meeting couldn't be created (provider not connected / API down): keep the choice for a recruiter.
    const col = await atsInterviews()
    const saved = await col.findOneAndUpdate(
      { id: iv.id, tenant_id: iv.tenant_id, status: 'awaiting_schedule' },
      { $set: { requested_slot: pick.start, last_error: e.message.slice(0, 300), updated_at: nowIso() } },
      { returnDocument: 'after', projection: { _id: 0 } },
    )
    const { job } = await loadContext(iv)
    if (await claimSend(iv.id, `requested:${pick.start}`)) {
      await notifySchedulers(iv, job?.recruiter_ids || [], 'Interview time requested', `${iv.candidate_name} picked ${pick.start} for ${iv.stage_name}, but the meeting couldn't be created: ${e.message}`)
    }
    return { booked: false, interview: saved || iv }
  }
}

// ─── Scorecards & decision ───────────────────────────────────────────────────

export async function submitScorecard(actor: AtsActor, ivId: string, body: unknown): Promise<AtsInterviewDoc> {
  const iv = await getInterview(actor.tenantId, ivId)
  if (!iv) throw new InterviewError(404, 'Interview not found')
  if (!iv.panel.some((p) => p.user_id === actor.userId)) throw new InterviewError(403, 'Only interviewers on this panel can submit a scorecard.')
  if (iv.status !== 'scheduled' && iv.status !== 'completed') throw new InterviewError(409, 'Scorecards open once the interview is booked.')
  if (iv.result_recorded) throw new InterviewError(409, 'The panel decision is already recorded.')
  if (iv.status === 'scheduled' && iv.scheduled_at && Date.parse(iv.scheduled_at) > Date.now()) {
    throw new InterviewError(409, 'You can submit your scorecard once the interview has started.')
  }
  const parsed = parseScorecard(body, iv.scorecard_template)
  if (!parsed.ok) throw new InterviewError(400, parsed.error)
  const card = {
    interviewer_id: actor.userId,
    ratings: parsed.ratings,
    recommendation: parsed.recommendation,
    ...(parsed.notes ? { notes: parsed.notes } : {}),
    submitted_at: nowIso(),
  }
  const col = await atsInterviews()
  // Replace this interviewer's card (one per interviewer).
  await col.updateOne({ id: iv.id, tenant_id: actor.tenantId }, { $pull: { scorecards: { interviewer_id: actor.userId } } } as never)
  const updated = await col.findOneAndUpdate(
    { id: iv.id, tenant_id: actor.tenantId, result_recorded: { $ne: true } },
    { $push: { scorecards: card }, $set: { updated_at: nowIso() } } as never,
    { returnDocument: 'after', projection: { _id: 0 } },
  )
  if (!updated) throw new InterviewError(409, 'The panel decision is already recorded.')
  await maybeFinalize(updated.id, actor.tenantId)
  return (await getInterview(actor.tenantId, updated.id)) || updated
}

/**
 * Decide when every panel member has submitted, or the scorecard deadline has
 * passed with at least one card. Records the stage result exactly once.
 */
export async function maybeFinalize(ivId: string, tenantId: string, now = Date.now()): Promise<boolean> {
  const iv = await getInterview(tenantId, ivId)
  if (!iv || iv.result_recorded || !iv.scorecards.length) return false
  if (iv.status !== 'scheduled' && iv.status !== 'completed') return false
  const panelIds = new Set(iv.panel.map((p) => p.user_id))
  const submitted = new Set(iv.scorecards.map((c) => c.interviewer_id))
  const allIn = [...panelIds].every((id) => submitted.has(id))
  const pastDeadline = !!iv.scorecard_deadline_at && Date.parse(iv.scorecard_deadline_at) < now
  if (!allIn && !pastDeadline) return false
  // Only cards from current panel members count.
  const cards = iv.scorecards.filter((c) => panelIds.has(c.interviewer_id))
  const decision = decidePanel(cards.length ? cards : iv.scorecards, iv.pass_rule, iv.pass_score)
  if (!decision) return false

  // A round from an earlier entry of this stage must not decide the current one.
  const { isCurrentEntry } = await import('@/lib/ats/engine')
  const app = (await (await atsApplications()).findOne({ id: iv.application_id, tenant_id: tenantId }, { projection: { _id: 0, id: 1, stage_id: 1, stage_entered_at: 1 } })) as Pick<AtsApplication, 'id' | 'stage_id' | 'stage_entered_at'> | null
  const staleRound = !!app && !!iv.entry_key && app.stage_id === iv.stage_id && !isCurrentEntry(app, iv.entry_key)

  const col = await atsInterviews()
  const claimed = await col.updateOne(
    { id: iv.id, tenant_id: tenantId, result_recorded: { $ne: true } },
    { $set: { result_recorded: true, status: 'completed', updated_at: nowIso() } },
  )
  if (claimed.modifiedCount !== 1) return false
  if (staleRound) {
    await col.updateOne({ id: iv.id, tenant_id: tenantId }, { $set: { last_error: 'The candidate re-entered this stage; this round no longer decides it.' } })
    return false
  }

  let summary = decision.summary + (allIn ? '' : ' Decided at the scorecard deadline.')
  try {
    const { summarizePanelNotes } = await import('@/lib/ats/interviews/panel-summary')
    const ai = await summarizePanelNotes({
      jobTitle: iv.job_title || 'the role',
      notes: cards.map((c) => ({ interviewer: c.interviewer_id, recommendation: c.recommendation, notes: c.notes || '' })),
    })
    if (ai) {
      await col.updateOne({ id: iv.id, tenant_id: tenantId }, { $set: { ai_summary: ai } })
      summary = `${summary} ${ai}`
    }
  } catch { /* optional */ }

  try {
    const { recordStageResult } = await import('@/lib/ats/engine')
    await recordStageResult(iv.application_id, {
      stage_id: iv.stage_id,
      outcome: decision.outcome,
      score: decision.score,
      summary: summary.slice(0, 2000),
      ref: { kind: 'interview', id: iv.id },
      at: nowIso(),
    }, { entryKey: iv.entry_key ?? null })
  } catch (e) {
    // Let the sweep retry: un-claim so the next pass records it.
    console.error('[ats/interviews] recordStageResult failed:', e)
    await col.updateOne({ id: iv.id, tenant_id: tenantId }, { $set: { result_recorded: false, last_error: 'Could not record the panel result; retrying.' } })
    return false
  }
  void import('@/lib/automation/events').then(({ emit }) => emit('interview.completed', {
    interview_id: iv.id, kind: 'hiring', application_id: iv.application_id, outcome: decision.outcome, summary: summary.slice(0, 500),
  }, { tenantId, idempotencyKey: `interview.completed:${iv.id}:${iv.entry_key ?? ''}` })).catch((e) => console.error('[automation] emit failed:', e))
  return true
}

// ─── Scheduler sweep (reminders + scorecard deadlines) ───────────────────────

/** Called every minute from the scheduler tick. Never throws. */
export async function runInterviewSweep(now = new Date()): Promise<{ reminders: number; finalized: number }> {
  let reminders = 0
  let finalized = 0
  try {
    const col = await atsInterviews()
    const nowIsoStr = now.toISOString()
    const upcoming = await col
      .find({ status: 'scheduled', scheduled_at: { $gt: nowIsoStr, $lte: new Date(now.getTime() + 24 * 3_600_000).toISOString() } }, { projection: { _id: 0 } })
      .limit(200).toArray()
    for (const iv of upcoming) {
      const minsLeft = (Date.parse(iv.scheduled_at!) - now.getTime()) / 60_000
      const kind: NoticeKind | null = minsLeft <= 60 ? 'reminder_1h' : minsLeft > 120 ? 'reminder_24h' : null
      if (!kind) continue
      // Keyed by start time so a reschedule gets fresh reminders.
      if (!(await claimSend(iv.id, `${kind}:${iv.scheduled_at}`))) continue
      // A booking made in the last 12 hours already told everyone; skip the 24h reminder.
      if (kind === 'reminder_24h' && iv.booked_at && Date.parse(iv.booked_at) > now.getTime() - 12 * 3_600_000) continue
      const { job, candidate } = await loadContext(iv)
      const company = job ? await companyName(job) : 'our company'
      await noticeCandidate(iv, candidate, kind, await candidateJoinUrl(iv), company)
      await noticePanel(iv, kind, panelLink(iv))
      reminders++
    }
    const due = await col
      .find({ status: { $in: ['scheduled', 'completed'] }, result_recorded: { $ne: true }, scorecard_deadline_at: { $lt: nowIsoStr }, 'scorecards.0': { $exists: true } }, { projection: { id: 1, tenant_id: 1 } })
      .limit(100).toArray()
    for (const d of due) if (await maybeFinalize(d.id, d.tenant_id, now.getTime())) finalized++
  } catch (e) {
    console.error('[ats/interviews] sweep failed:', e)
  }
  return { reminders, finalized }
}
