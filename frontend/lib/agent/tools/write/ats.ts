/**
 * Write tools for the hiring pipeline (ATS). Every one only proposes; on
 * confirm, execute() re-loads the job / application under the caller's
 * organisation and calls the same service the hiring UI uses (lib/ats/*),
 * then writes the ATS audit log. Moves, rejections, screenings and interview
 * invitations can message the candidate, so they carry the 'send' risk.
 */
import { ToolInputError } from '@/lib/agent/contract'
import { writeTool } from '../define'
import {
  argsObject, optBool, optEnum, optIdArray, optInt, optNumber, optString, optStringArray, reqDateArg, reqId, reqString,
} from '../args'
import { clip } from '../output'
import { applicationLink, atsActorFor, atsCall, jobLink, resolveStage, stageName } from '../ats-shared'
import { DRAFT_KEY, openDraft, sealDraft } from '../seal'
import { uploadText } from '../uploads'
import type { AtsApplication, AtsJob } from '@/lib/ats/contract'

type Doc = Record<string, any>

const WORK_MODES = ['onsite', 'hybrid', 'remote'] as const
const EMPLOYMENT = ['full_time', 'part_time', 'contract', 'internship'] as const

interface JobFields {
  title?: string
  description?: string
  requirements?: string
  department?: string
  location?: string
  work_mode?: (typeof WORK_MODES)[number]
  employment_type?: (typeof EMPLOYMENT)[number]
  experience_min?: number
  experience_max?: number
  openings?: number
  skills?: string[]
}

const JOB_FIELD_SCHEMA = {
  title: { type: 'string' as const, maxLength: 160 },
  description: { type: 'string' as const, maxLength: 20000, description: 'Job description (markdown).' },
  requirements: { type: 'string' as const, maxLength: 10000 },
  department: { type: 'string' as const },
  location: { type: 'string' as const },
  work_mode: { type: 'string' as const, enum: [...WORK_MODES] },
  employment_type: { type: 'string' as const, enum: [...EMPLOYMENT] },
  experience_min: { type: 'integer' as const, minimum: 0, maximum: 60 },
  experience_max: { type: 'integer' as const, minimum: 0, maximum: 60 },
  openings: { type: 'integer' as const, minimum: 1, maximum: 10000 },
  skills: { type: 'array' as const, items: { type: 'string' as const }, maxItems: 40 },
}
const JOB_KEYS = Object.keys(JOB_FIELD_SCHEMA)

function parseJobFields(r: Record<string, unknown>): JobFields {
  const f: JobFields = {}
  const set = <K extends keyof JobFields>(k: K, v: JobFields[K] | undefined) => { if (v !== undefined) f[k] = v }
  set('title', optString(r, 'title', { max: 160, min: 2 }))
  set('description', optString(r, 'description', { max: 20000 }))
  set('requirements', optString(r, 'requirements', { max: 10000 }))
  set('department', optString(r, 'department', { max: 120 }))
  set('location', optString(r, 'location', { max: 160 }))
  set('work_mode', optEnum(r, 'work_mode', WORK_MODES))
  set('employment_type', optEnum(r, 'employment_type', EMPLOYMENT))
  set('experience_min', optInt(r, 'experience_min', 0, 60))
  set('experience_max', optInt(r, 'experience_max', 0, 60))
  set('openings', optInt(r, 'openings', 1, 10000))
  set('skills', optStringArray(r, 'skills', { maxItems: 40, maxLen: 60 }))
  if (f.experience_min !== undefined && f.experience_max !== undefined && f.experience_max < f.experience_min) {
    throw new ToolInputError('`experience_max` must be at least `experience_min`.')
  }
  return f
}

async function audit(actor: { userId: string; tenantId: string }, action: string, type: string, id: string, detail?: string) {
  const { auditAts } = await import('@/lib/ats/access')
  await auditAts(actor, action, type, id, detail ? `${detail} (via AI copilot)` : 'via AI copilot').catch(() => undefined)
}

// ─── Jobs ────────────────────────────────────────────────────────────────────

export interface CreateJobArgs extends JobFields {
  title: string
  job_description_upload_id?: string
  exam_id?: string
  [DRAFT_KEY]?: unknown
}

export const createJobTool = writeTool<CreateJobArgs>({
  name: 'create_job',
  risk: 'create',
  description: 'Create a hiring-pipeline job as a DRAFT (not visible to candidates) with the default pipeline. Can take the job description from an uploaded document id. Publish it later with set_job_status.',
  parameters: {
    type: 'object',
    properties: {
      ...JOB_FIELD_SCHEMA,
      job_description_upload_id: { type: 'string', description: 'Use an uploaded JD as the description.' },
      exam_id: { type: 'string', description: 'Test used by the assessment stage (list_tests).' },
    },
    required: ['title'],
  },
  parse(raw) {
    const r = argsObject(raw, [...JOB_KEYS, 'job_description_upload_id', 'exam_id'])
    const f = parseJobFields(r)
    if (!f.title) throw new ToolInputError('`title` is required.')
    const up = optString(r, 'job_description_upload_id', { max: 128 })
    const exam = r.exam_id ? reqId(r, 'exam_id') : undefined
    return { ...f, title: f.title, ...(up ? { job_description_upload_id: up } : {}), ...(exam ? { exam_id: exam } : {}) }
  },
  draftInputs: (a) => ({ job_description_upload_id: a.job_description_upload_id ?? null }),
  async propose(a, ctx) {
    const actor = atsActorFor(ctx.caller)
    const warnings: string[] = []
    let description = a.description ?? ''
    if (a.job_description_upload_id && !a.description) {
      const prior = await openDraft<{ description: string }>('create_job', ctx.caller, a[DRAFT_KEY])
      if (prior) description = prior.description
      else {
        const u = await uploadText(ctx.caller, a.job_description_upload_id)
        description = u.text.slice(0, 20000)
        if (u.flagged) warnings.push('The uploaded description contains text that looks like instructions; it is used only as the job text.')
      }
      a[DRAFT_KEY] = await sealDraft('create_job', ctx.caller, { description })
    }
    if (a.exam_id) {
      const { tenantExamIds } = await import('@/lib/ats/jobs')
      const ok = await tenantExamIds(actor.tenantId, [a.exam_id])
      if (!ok.has(a.exam_id)) throw new ToolInputError('That test is not in your organisation. Use list_tests.')
    }
    const { defaultPipeline } = await import('@/lib/ats/pipeline')
    const stages = defaultPipeline({ examId: a.exam_id ?? null })
    if (!description.trim()) warnings.push('No description yet — add one before publishing.')
    if (!a.skills?.length) warnings.push('No skills listed — résumé match scores will be weak until you add some.')
    return {
      title: `Create job “${clip(a.title, 80)}” (draft)`,
      preview: {
        fields: {
          Title: a.title, Department: a.department ?? '—', Location: a.location ?? '—', 'Work mode': a.work_mode ?? '—',
          Type: a.employment_type ?? '—', Experience: a.experience_min !== undefined || a.experience_max !== undefined ? `${a.experience_min ?? 0}–${a.experience_max ?? '…'} years` : '—',
          Openings: a.openings ?? 1, Skills: (a.skills ?? []).join(', ') || '—', Status: 'Draft (not visible to candidates)',
        },
        description: clip(description, 1200),
        pipeline: stages.map((s) => s.name),
        warnings,
      },
    }
  },
  async execute(a, ctx) {
    const actor = atsActorFor(ctx.caller)
    const draft = await openDraft<{ description: string }>('create_job', ctx.caller, a[DRAFT_KEY])
    const description = a.description ?? draft?.description ?? (a.job_description_upload_id ? (await uploadText(ctx.caller, a.job_description_upload_id)).text.slice(0, 20000) : '')
    const { createJob } = await import('@/lib/ats/jobs')
    const body: Doc = { ...a, description, status: 'draft' }
    delete body[DRAFT_KEY]
    delete body._nonce
    delete body.job_description_upload_id
    const job = await atsCall(() => createJob(actor, body))
    await audit(actor, 'ats.job.create', 'ats_job', job.id, job.title)
    return { ok: true, message: `Created the draft job “${job.title}”.`, link: jobLink(job.id), data: { job_id: job.id } }
  },
})

export interface UpdateJobArgs extends JobFields {
  job_id: string
}

export const updateJobTool = writeTool<UpdateJobArgs>({
  name: 'update_job',
  risk: 'update',
  description: 'Change a job\'s details (title, description, requirements, location, skills, openings…). Shows a before/after preview. Use set_job_status to publish or close.',
  parameters: { type: 'object', properties: { job_id: { type: 'string' }, ...JOB_FIELD_SCHEMA }, required: ['job_id'] },
  parse(raw) {
    const r = argsObject(raw, ['job_id', ...JOB_KEYS])
    const f = parseJobFields(r)
    if (!Object.keys(f).length) throw new ToolInputError('Say what to change (e.g. `skills`, `description`, `openings`).')
    return { job_id: reqId(r, 'job_id'), ...f }
  },
  async propose(a, ctx) {
    const actor = atsActorFor(ctx.caller)
    const { loadJob } = await import('@/lib/ats/http')
    const job = await atsCall(() => loadJob(actor, a.job_id, 'edit'))
    const changes: Record<string, { from: unknown; to: unknown }> = {}
    for (const k of JOB_KEYS) {
      const to = (a as unknown as Doc)[k]
      if (to === undefined) continue
      const from = (job as unknown as Doc)[k]
      if (JSON.stringify(from ?? null) !== JSON.stringify(to)) changes[k] = { from: typeof from === 'string' ? clip(from, 200) : from ?? null, to: typeof to === 'string' ? clip(to, 200) : to }
    }
    if (!Object.keys(changes).length) throw new ToolInputError('Nothing would change — those values are already set.')
    return { title: `Update job “${clip(job.title, 80)}”`, preview: { job: job.title, changes, status: job.status } }
  },
  async execute(a, ctx) {
    const actor = atsActorFor(ctx.caller)
    const [{ loadJob }, { updateJob }] = await Promise.all([import('@/lib/ats/http'), import('@/lib/ats/jobs')])
    const job = await atsCall(() => loadJob(actor, a.job_id, 'edit'))
    const body: Doc = {}
    for (const k of JOB_KEYS) if ((a as unknown as Doc)[k] !== undefined) body[k] = (a as unknown as Doc)[k]
    const updated = await atsCall(() => updateJob(actor, job, body))
    await audit(actor, 'ats.job.update', 'ats_job', job.id, Object.keys(body).join(', '))
    return { ok: true, message: `Updated “${updated.title}”.`, link: jobLink(job.id) }
  },
})

export interface SetJobStatusArgs {
  job_id: string
  status: 'open' | 'on_hold' | 'closed' | 'filled'
  is_public?: boolean
}

export const setJobStatusTool = writeTool<SetJobStatusArgs>({
  name: 'set_job_status',
  risk: 'publish',
  description: 'Publish (open), pause (on_hold), close or mark a job filled. `is_public` turns the public apply page on or off.',
  parameters: {
    type: 'object',
    properties: { job_id: { type: 'string' }, status: { type: 'string', enum: ['open', 'on_hold', 'closed', 'filled'] }, is_public: { type: 'boolean' } },
    required: ['job_id', 'status'],
  },
  parse(raw) {
    const r = argsObject(raw, ['job_id', 'status', 'is_public'])
    const status = optEnum(r, 'status', ['open', 'on_hold', 'closed', 'filled'] as const)
    if (!status) throw new ToolInputError('`status` is required.')
    const pub = optBool(r, 'is_public')
    return { job_id: reqId(r, 'job_id'), status, ...(pub !== undefined ? { is_public: pub } : {}) }
  },
  async propose(a, ctx) {
    const actor = atsActorFor(ctx.caller)
    const [{ loadJob }, { canTransition }] = await Promise.all([import('@/lib/ats/http'), import('@/lib/ats/pipeline')])
    const job = await atsCall(() => loadJob(actor, a.job_id, 'edit'))
    if (!canTransition(job.status, a.status)) throw new ToolInputError(`A ${job.status.replace('_', ' ')} job can't become ${a.status.replace('_', ' ')}.`)
    const warnings: string[] = []
    if (a.status === 'open' && !job.description?.trim()) warnings.push('The job has no description.')
    if (a.status === 'open' && (a.is_public ?? job.is_public)) warnings.push('Candidates will be able to apply on the public job page.')
    return {
      title: `${a.status === 'open' ? 'Publish' : a.status === 'on_hold' ? 'Pause' : a.status === 'closed' ? 'Close' : 'Mark filled'} job “${clip(job.title, 80)}”`,
      preview: { job: job.title, status: { from: job.status, to: a.status }, public_apply_page: a.is_public ?? job.is_public, warnings },
    }
  },
  async execute(a, ctx) {
    const actor = atsActorFor(ctx.caller)
    const [{ loadJob }, { updateJob }] = await Promise.all([import('@/lib/ats/http'), import('@/lib/ats/jobs')])
    const job = await atsCall(() => loadJob(actor, a.job_id, 'edit'))
    await atsCall(() => updateJob(actor, job, { status: a.status, ...(a.is_public !== undefined ? { is_public: a.is_public } : {}) }))
    await audit(actor, 'ats.job.status', 'ats_job', job.id, `${job.status} → ${a.status}`)
    return { ok: true, message: `“${job.title}” is now ${a.status.replace('_', ' ')}.`, link: jobLink(job.id) }
  },
})

// ─── Applications ────────────────────────────────────────────────────────────

async function loadApp(actor: ReturnType<typeof atsActorFor>, id: string): Promise<{ app: AtsApplication; job: AtsJob; name: string }> {
  const [{ loadApplication }, { atsCandidates }] = await Promise.all([import('@/lib/ats/http'), import('@/lib/ats/db')])
  const { app, job } = await atsCall(() => loadApplication(actor, id))
  const c = await (await atsCandidates()).findOne({ tenant_id: actor.tenantId, id: app.candidate_id }, { projection: { _id: 0, name: 1 } })
  return { app, job, name: String(c?.name || 'the candidate') }
}

export interface MoveStageArgs { application_id: string; to_stage: string; reason?: string }

export const moveApplicationStageTool = writeTool<MoveStageArgs>({
  name: 'move_application_stage',
  risk: 'send',
  description: 'Move an applicant to another stage of the job\'s pipeline (stage id or name). Entering a stage can message the candidate (test invite, screening call, interview scheduling).',
  parameters: {
    type: 'object',
    properties: { application_id: { type: 'string' }, to_stage: { type: 'string', description: 'Stage id or name.' }, reason: { type: 'string', maxLength: 500 } },
    required: ['application_id', 'to_stage'],
  },
  parse(raw) {
    const r = argsObject(raw, ['application_id', 'to_stage', 'reason'])
    const reason = optString(r, 'reason', { max: 500 })
    return { application_id: reqId(r, 'application_id'), to_stage: reqString(r, 'to_stage', { max: 80 }), ...(reason ? { reason } : {}) }
  },
  async propose(a, ctx) {
    const actor = atsActorFor(ctx.caller)
    const { app, job, name } = await loadApp(actor, a.application_id)
    const to = resolveStage(job, a.to_stage)
    if (!to) throw new ToolInputError(`No stage “${a.to_stage}” in this job. Stages: ${job.pipeline.map((s) => s.name).join(', ')}.`)
    if (to.id === app.stage_id) throw new ToolInputError(`${name} is already in ${to.name}.`)
    if (app.status === 'withdrawn') throw new ToolInputError(`${name} withdrew this application.`)
    a.to_stage = to.id
    return {
      title: `Move ${name} to ${to.name} (${clip(job.title, 60)})`,
      preview: { candidate: name, job: job.title, from: stageName(job, app.stage_id), to: to.name, stage_type: to.type, reason: a.reason ?? '—', effect: to.type === 'rejected' ? 'Rejects the application (the candidate may be told).' : 'Starts that stage — it can send the candidate an invite or message.' },
    }
  },
  async execute(a, ctx) {
    const actor = atsActorFor(ctx.caller)
    const { moveApplication } = await import('@/lib/ats/engine')
    const { app, job, name } = await loadApp(actor, a.application_id)
    const to = resolveStage(job, a.to_stage)
    if (!to) return { ok: false, message: 'That stage is no longer in the pipeline.' }
    const updated = await atsCall(() => moveApplication(actor, app.id, to.id, { reason: a.reason }))
    await audit(actor, 'ats.application.move', 'ats_application', app.id, `${app.stage_id} → ${to.id}`)
    return { ok: true, message: `Moved ${name} to ${stageName(job, updated.stage_id)}.`, link: applicationLink(job.id, app.id) }
  },
})

export interface RejectArgs { application_id: string; reason: string }

export const rejectApplicationTool = writeTool<RejectArgs>({
  name: 'reject_application',
  risk: 'send',
  description: 'Reject an applicant (moves them to the job\'s Rejected stage with your reason; the candidate may be notified).',
  parameters: { type: 'object', properties: { application_id: { type: 'string' }, reason: { type: 'string', maxLength: 500 } }, required: ['application_id', 'reason'] },
  parse(raw) {
    const r = argsObject(raw, ['application_id', 'reason'])
    return { application_id: reqId(r, 'application_id'), reason: reqString(r, 'reason', { max: 500, min: 3 }) }
  },
  async propose(a, ctx) {
    const actor = atsActorFor(ctx.caller)
    const { app, job, name } = await loadApp(actor, a.application_id)
    const rejected = job.pipeline.find((s) => s.type === 'rejected')
    if (!rejected) throw new ToolInputError('This job has no Rejected stage.')
    if (app.status === 'rejected') throw new ToolInputError(`${name} is already rejected.`)
    return { title: `Reject ${name} for ${clip(job.title, 60)}`, preview: { candidate: name, job: job.title, current_stage: stageName(job, app.stage_id), reason: a.reason } }
  },
  async execute(a, ctx) {
    const actor = atsActorFor(ctx.caller)
    const { moveApplication } = await import('@/lib/ats/engine')
    const { app, job, name } = await loadApp(actor, a.application_id)
    const rejected = job.pipeline.find((s) => s.type === 'rejected')
    if (!rejected) return { ok: false, message: 'This job has no Rejected stage.' }
    await atsCall(() => moveApplication(actor, app.id, rejected.id, { reason: a.reason }))
    await audit(actor, 'ats.application.reject', 'ats_application', app.id, clip(a.reason, 200))
    return { ok: true, message: `Rejected ${name}.`, link: applicationLink(job.id, app.id) }
  },
})

export interface ShortlistArgs {
  job_id: string
  to_stage: string
  from_stage?: string
  min_match?: number
  application_ids?: string[]
  limit?: number
  [DRAFT_KEY]?: unknown
}

export const shortlistApplicantsTool = writeTool<ShortlistArgs>({
  name: 'shortlist_applicants',
  risk: 'send',
  description: 'Move several applicants of one job to a stage at once: the ones you name, or everyone in `from_stage` with a match score ≥ `min_match` (best first, up to `limit`). The preview lists exactly who moves.',
  parameters: {
    type: 'object',
    properties: {
      job_id: { type: 'string' },
      to_stage: { type: 'string' },
      from_stage: { type: 'string' },
      min_match: { type: 'integer', minimum: 0, maximum: 100 },
      application_ids: { type: 'array', items: { type: 'string' }, maxItems: 100 },
      limit: { type: 'integer', minimum: 1, maximum: 100 },
    },
    required: ['job_id', 'to_stage'],
  },
  parse(raw) {
    const r = argsObject(raw, ['job_id', 'to_stage', 'from_stage', 'min_match', 'application_ids', 'limit'])
    const a: ShortlistArgs = { job_id: reqId(r, 'job_id'), to_stage: reqString(r, 'to_stage', { max: 80 }) }
    const from = optString(r, 'from_stage', { max: 80 })
    if (from) a.from_stage = from
    const m = optInt(r, 'min_match', 0, 100)
    if (m !== undefined) a.min_match = m
    const ids = optIdArray(r, 'application_ids', 100)
    if (ids?.length) a.application_ids = ids
    const lim = optInt(r, 'limit', 1, 100)
    if (lim !== undefined) a.limit = lim
    if (!a.application_ids && !a.from_stage && a.min_match === undefined) throw new ToolInputError('Name the applicants (`application_ids`) or give `from_stage` / `min_match`.')
    return a
  },
  async propose(a, ctx) {
    const actor = atsActorFor(ctx.caller)
    const [{ loadJob }, { atsApplications, atsCandidates }] = await Promise.all([import('@/lib/ats/http'), import('@/lib/ats/db')])
    const job = await atsCall(() => loadJob(actor, a.job_id))
    const to = resolveStage(job, a.to_stage)
    if (!to) throw new ToolInputError(`No stage “${a.to_stage}”. Stages: ${job.pipeline.map((s) => s.name).join(', ')}.`)
    const filter: Doc = { tenant_id: actor.tenantId, job_id: job.id, status: 'active', stage_id: { $ne: to.id } }
    if (a.application_ids) filter.id = { $in: a.application_ids }
    if (a.from_stage) {
      const from = resolveStage(job, a.from_stage)
      if (!from) throw new ToolInputError(`No stage “${a.from_stage}”.`)
      filter.stage_id = from.id
    }
    if (a.min_match !== undefined) filter['match.score'] = { $gte: a.min_match }
    const apps = (await (await atsApplications()).find(filter, { projection: { _id: 0, id: 1, candidate_id: 1, stage_id: 1, match: 1 } }).sort({ 'match.score': -1 }).limit(a.limit ?? 50).toArray()) as AtsApplication[]
    if (!apps.length) throw new ToolInputError('No active applicants match. Check the stage and score filters (list_applicants).')
    const cands = await (await atsCandidates()).find({ tenant_id: actor.tenantId, id: { $in: apps.map((x) => x.candidate_id) } }, { projection: { _id: 0, id: 1, name: 1 } }).toArray()
    const names = new Map(cands.map((c) => [String(c.id), String(c.name)]))
    const list = apps.map((x) => ({ id: x.id, name: names.get(x.candidate_id) || 'Unknown', match: x.match ? Math.round(x.match.score) : null, from: stageName(job, x.stage_id) }))
    a.to_stage = to.id
    // Exactly these applicants move on confirm (sealed).
    a[DRAFT_KEY] = await sealDraft('shortlist_applicants', ctx.caller, { ids: list.map((x) => x.id) })
    return {
      title: `Move ${list.length} applicant${list.length === 1 ? '' : 's'} to ${to.name} (${clip(job.title, 60)})`,
      preview: { job: job.title, to: to.name, applicants: list.map((x) => ({ name: x.name, match: x.match, from: x.from })), effect: 'Each move starts that stage and can message the candidate.' },
    }
  },
  async execute(a, ctx) {
    const actor = atsActorFor(ctx.caller)
    const draft = await openDraft<{ ids: string[] }>('shortlist_applicants', ctx.caller, a[DRAFT_KEY])
    if (!draft?.ids?.length) return { ok: false, message: 'This shortlist expired. Ask the copilot to draft it again.' }
    const [{ loadJob }, { moveApplication }] = await Promise.all([import('@/lib/ats/http'), import('@/lib/ats/engine')])
    const job = await atsCall(() => loadJob(actor, a.job_id))
    const to = resolveStage(job, a.to_stage)
    if (!to) return { ok: false, message: 'That stage is no longer in the pipeline.' }
    let moved = 0
    const failed: string[] = []
    for (const id of draft.ids) {
      try {
        await moveApplication(actor, id, to.id, { reason: 'Shortlisted via AI copilot' })
        moved++
      } catch (e) {
        failed.push(`${id}: ${(e as Error).message}`.slice(0, 120))
      }
    }
    await audit(actor, 'ats.application.bulk_move', 'ats_job', job.id, `${moved} → ${to.id}`)
    return { ok: moved > 0, message: `Moved ${moved} of ${draft.ids.length} applicants to ${to.name}.${failed.length ? ` ${failed.length} could not be moved.` : ''}`, link: jobLink(job.id), data: { moved, failed: failed.slice(0, 10) } }
  },
})

// ─── Interviews, screening, HR ───────────────────────────────────────────────

export interface ScheduleInterviewArgs {
  application_id: string
  scheduled_at: string
  duration_min?: number
  provider?: 'livekit' | 'zoom' | 'google_meet' | 'teams' | 'manual'
  manual_url?: string
  timezone?: string
}

export const scheduleInterviewTool = writeTool<ScheduleInterviewArgs>({
  name: 'schedule_interview',
  risk: 'send',
  description: 'Schedule (or reschedule) the interview waiting for an applicant in an interview stage. Sends the calendar invite to the candidate and panel.',
  parameters: {
    type: 'object',
    properties: {
      application_id: { type: 'string' },
      scheduled_at: { type: 'string', description: 'ISO 8601 start, e.g. 2026-11-04T10:30:00+05:30.' },
      duration_min: { type: 'integer', minimum: 15, maximum: 480 },
      provider: { type: 'string', enum: ['livekit', 'zoom', 'google_meet', 'teams', 'manual'] },
      manual_url: { type: 'string' },
      timezone: { type: 'string', description: 'IANA zone, e.g. Asia/Kolkata.' },
    },
    required: ['application_id', 'scheduled_at'],
  },
  parse(raw) {
    const r = argsObject(raw, ['application_id', 'scheduled_at', 'duration_min', 'provider', 'manual_url', 'timezone'])
    const a: ScheduleInterviewArgs = { application_id: reqId(r, 'application_id'), scheduled_at: reqDateArg(r, 'scheduled_at') }
    const d = optInt(r, 'duration_min', 15, 480)
    if (d) a.duration_min = d
    const p = optEnum(r, 'provider', ['livekit', 'zoom', 'google_meet', 'teams', 'manual'] as const)
    if (p) a.provider = p
    const u = optString(r, 'manual_url', { max: 1000 })
    if (u) {
      if (!/^https:\/\//.test(u)) throw new ToolInputError('`manual_url` must be an https link.')
      a.manual_url = u
    }
    const tz = optString(r, 'timezone', { max: 60 })
    if (tz) a.timezone = tz
    if (Date.parse(a.scheduled_at) < Date.now()) throw new ToolInputError('`scheduled_at` is in the past.')
    return a
  },
  async propose(a, ctx) {
    const actor = atsActorFor(ctx.caller)
    const { app, job, name } = await loadApp(actor, a.application_id)
    const { atsInterviews } = await import('@/lib/ats/interviews/db')
    const iv = await (await atsInterviews()).findOne({ tenant_id: actor.tenantId, application_id: app.id, status: { $in: ['awaiting_schedule', 'scheduled'] } }, { projection: { _id: 0, id: 1, status: 1, panel: 1, duration_min: 1, stage_id: 1, scheduled_at: 1 } })
    if (!iv) throw new ToolInputError(`${name} has no interview waiting to be scheduled. Move them into an interview stage first.`)
    return {
      title: `${iv.status === 'scheduled' ? 'Reschedule' : 'Schedule'} ${name}'s interview for ${new Date(a.scheduled_at).toUTCString().slice(0, 22)} UTC`,
      preview: {
        candidate: name, job: job.title, stage: stageName(job, String(iv.stage_id)), when: a.scheduled_at, timezone: a.timezone ?? 'organisation default',
        duration_min: a.duration_min ?? iv.duration_min, meeting: a.provider ?? 'stage default', panel: (iv.panel || []).map((p: Doc) => p.name || p.email),
        ...(iv.scheduled_at ? { previously: iv.scheduled_at } : {}),
        effect: 'Sends calendar invites to the candidate and the panel.',
      },
    }
  },
  async execute(a, ctx) {
    const actor = atsActorFor(ctx.caller)
    const { app, job, name } = await loadApp(actor, a.application_id)
    const [{ atsInterviews }, { scheduleInterview }] = await Promise.all([import('@/lib/ats/interviews/db'), import('@/lib/ats/interviews/service')])
    const iv = await (await atsInterviews()).findOne({ tenant_id: actor.tenantId, application_id: app.id, status: { $in: ['awaiting_schedule', 'scheduled'] } }, { projection: { _id: 0, id: 1 } })
    if (!iv) return { ok: false, message: `${name} no longer has an interview to schedule.` }
    await atsCall(() => scheduleInterview(actor, String(iv.id), actor.tenantId, {
      scheduled_at: a.scheduled_at,
      ...(a.duration_min ? { duration_min: a.duration_min } : {}),
      ...(a.provider ? { provider: a.provider } : {}),
      ...(a.manual_url ? { manual_url: a.manual_url } : {}),
      ...(a.timezone ? { timezone: a.timezone } : {}),
    }))
    await audit(actor, 'ats.interview.schedule', 'ats_interview', String(iv.id), a.scheduled_at)
    return { ok: true, message: `Scheduled ${name}'s interview and sent the invites.`, link: applicationLink(job.id, app.id) }
  },
})

export const startBotScreeningTool = writeTool<{ application_id: string }>({
  name: 'start_bot_screening',
  risk: 'send',
  description: '(Re)start the screening bot (WhatsApp chat/call or phone call) for an applicant sitting in a bot-screening stage. Contacts the candidate.',
  parameters: { type: 'object', properties: { application_id: { type: 'string' } }, required: ['application_id'] },
  parse(raw) {
    return { application_id: reqId(argsObject(raw, ['application_id']), 'application_id') }
  },
  async propose(a, ctx) {
    const actor = atsActorFor(ctx.caller)
    const { app, job, name } = await loadApp(actor, a.application_id)
    const stage = job.pipeline.find((s) => s.id === app.stage_id)
    if (!stage || stage.type !== 'bot_screen' || app.status !== 'active') throw new ToolInputError(`${name} is not in an active bot-screening stage.`)
    const cfg = stage.config && 'channels' in stage.config ? stage.config : null
    return { title: `Start the screening bot for ${name}`, preview: { candidate: name, job: job.title, stage: stage.name, channels: cfg?.channels ?? [], questions: cfg?.questions?.length ?? 0, effect: 'Contacts the candidate on the first channel they agreed to.' } }
  },
  async execute(a, ctx) {
    const actor = atsActorFor(ctx.caller)
    const [{ loadVisibleApp }, { restartBotScreen }] = await Promise.all([import('@/lib/ats/screening/route-helpers'), import('@/lib/ats/screening/machine')])
    const hit = await loadVisibleApp(actor, a.application_id)
    if (!hit) return { ok: false, message: 'Application not found.' }
    const stage = hit.job.pipeline.find((s) => s.id === hit.app.stage_id)
    if (!stage || stage.type !== 'bot_screen' || hit.app.status !== 'active') return { ok: false, message: 'The application is no longer in an active bot-screening stage.' }
    const call = await restartBotScreen(hit.app, hit.job, hit.candidate)
    await audit(actor, 'ats.screening.start', 'application', hit.app.id, call ? `channel ${call.channel}` : 'no channel')
    if (!call) return { ok: false, message: 'No usable channel — check the phone number and consent.' }
    return { ok: true, message: `Started the screening bot (${String(call.channel).replace('_', ' ')}).`, link: applicationLink(hit.job.id, hit.app.id) }
  },
})

export interface HrDecisionArgs { application_id: string; decision: 'pass' | 'fail' | 'hold'; notes?: string; offered_ctc?: number; override_reason?: string }

export const recordHrDecisionTool = writeTool<HrDecisionArgs>({
  name: 'record_hr_decision',
  risk: 'update',
  description: 'Record the HR-round decision (pass / fail / hold) for an applicant in an HR round, with notes and an optional offered CTC. Pass needs the candidate\'s compensation form unless you give an override reason.',
  parameters: {
    type: 'object',
    properties: {
      application_id: { type: 'string' },
      decision: { type: 'string', enum: ['pass', 'fail', 'hold'] },
      notes: { type: 'string', maxLength: 2000 },
      offered_ctc: { type: 'number', minimum: 0 },
      override_reason: { type: 'string', maxLength: 300 },
    },
    required: ['application_id', 'decision'],
  },
  parse(raw) {
    const r = argsObject(raw, ['application_id', 'decision', 'notes', 'offered_ctc', 'override_reason'])
    const decision = optEnum(r, 'decision', ['pass', 'fail', 'hold'] as const)
    if (!decision) throw new ToolInputError('`decision` is required.')
    const a: HrDecisionArgs = { application_id: reqId(r, 'application_id'), decision }
    const notes = optString(r, 'notes', { max: 2000 })
    if (notes) a.notes = notes
    const ctc = optNumber(r, 'offered_ctc', 0, 1e10)
    if (ctc !== undefined) a.offered_ctc = ctc
    const ov = optString(r, 'override_reason', { max: 300 })
    if (ov) a.override_reason = ov
    return a
  },
  async propose(a, ctx) {
    const actor = atsActorFor(ctx.caller)
    const { app, job, name } = await loadApp(actor, a.application_id)
    const stage = job.pipeline.find((s) => s.id === app.stage_id)
    if (!stage || stage.type !== 'hr_round') throw new ToolInputError(`${name} is not in an HR round.`)
    return {
      title: `HR decision for ${name}: ${a.decision}`,
      preview: { candidate: name, job: job.title, decision: a.decision, notes: a.notes ?? '—', offered_ctc: a.offered_ctc ?? '—', override: a.override_reason ?? '—', effect: a.decision === 'pass' ? 'Moves them on per the stage rules.' : a.decision === 'fail' ? 'Applies the stage\'s fail rule (reject / hold / review).' : 'Puts the application on hold.' },
    }
  },
  async execute(a, ctx) {
    const actor = atsActorFor(ctx.caller)
    const { recordHrDecision } = await import('@/lib/ats/hr/service')
    const { app, job, name } = await loadApp(actor, a.application_id)
    await atsCall(() => recordHrDecision(actor, app.id, {
      decision: a.decision,
      ...(a.notes ? { notes: a.notes } : {}),
      ...(a.offered_ctc !== undefined ? { offered_ctc: a.offered_ctc } : {}),
      ...(a.override_reason ? { override: { reason: a.override_reason } } : {}),
    }))
    await audit(actor, 'ats.application.hr_decision', 'ats_application', app.id, `${a.decision}${a.override_reason ? ' (override)' : ''}`)
    return { ok: true, message: `Recorded “${a.decision}” for ${name}.`, link: applicationLink(job.id, app.id) }
  },
})

