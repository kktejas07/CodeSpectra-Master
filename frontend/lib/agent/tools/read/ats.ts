/**
 * Read tools for the hiring pipeline (ATS): jobs, applicants with match
 * scores, one application, interview scorecards, the funnel and background
 * check status. Same services and access rules as the hiring UI; every query
 * is pinned to the caller's organisation (atsActorFor).
 */
import { readTool } from '../define'
import { argsObject, optEnum, optInt, optString, paging, reqId } from '../args'
import { clip } from '../output'
import { applicantRow, atsActorFor, atsCall, jobLink, jobSummary, resolveStage, stageName } from '../ats-shared'
import type { AtsApplication, AtsCandidate, AtsJob } from '@/lib/ats/contract'

type Doc = Record<string, any>

const JOB_STATUSES = ['draft', 'open', 'on_hold', 'closed', 'filled', 'any'] as const

export const listJobsTool = readTool({
  name: 'list_jobs',
  description: 'List hiring-pipeline jobs in your organisation with status and applicant counts. Filter by status or a title search.',
  parameters: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: [...JOB_STATUSES] },
      q: { type: 'string', description: 'Words in the job title.' },
      page: { type: 'integer', minimum: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 50 },
    },
  },
  parse(raw) {
    const r = argsObject(raw, ['status', 'q', 'page', 'limit'])
    return { status: optEnum(r, 'status', JOB_STATUSES) ?? 'any', q: optString(r, 'q', { max: 100 }), ...paging(r, 20, 50) }
  },
  async run(a, ctx) {
    const actor = atsActorFor(ctx.caller)
    const [{ atsJobs, atsApplications }, { jobScopeFilter }] = await Promise.all([import('@/lib/ats/db'), import('@/lib/ats/http')])
    const scope = await jobScopeFilter(actor)
    if (!scope) return { data: { total: 0, jobs: [] } }
    const filter: Doc = { ...scope }
    if (a.status !== 'any') filter.status = a.status
    if (a.q) filter.title = { $regex: a.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }
    const col = await atsJobs()
    const [total, rows] = await Promise.all([
      col.countDocuments(filter),
      col.find(filter, { projection: { _id: 0, description: 0, requirements: 0, criteria: 0 } }).sort({ updated_at: -1 }).skip((a.page - 1) * a.limit).limit(a.limit).toArray() as Promise<AtsJob[]>,
    ])
    const counts = await (await atsApplications()).aggregate<{ _id: string; n: number }>([
      { $match: { tenant_id: actor.tenantId, job_id: { $in: rows.map((j) => j.id) } } },
      { $group: { _id: '$job_id', n: { $sum: 1 } } },
    ]).toArray()
    const byJob = new Map(counts.map((c) => [c._id, c.n]))
    return { data: { total, page: a.page, jobs: rows.map((j) => ({ ...jobSummary(j), applicants: byJob.get(j.id) ?? 0 })) } }
  },
})

export const getJobTool = readTool({
  name: 'get_job',
  description: 'One job: description, requirements, skills, the pipeline stages with how many applicants sit in each, and screening criteria.',
  parameters: { type: 'object', properties: { job_id: { type: 'string' } }, required: ['job_id'] },
  parse(raw) {
    return { job_id: reqId(argsObject(raw, ['job_id']), 'job_id') }
  },
  async run(a, ctx) {
    const actor = atsActorFor(ctx.caller)
    const [{ loadJob }, { stageCounts }] = await Promise.all([import('@/lib/ats/http'), import('@/lib/ats/jobs')])
    const job = await atsCall(() => loadJob(actor, a.job_id))
    const counts = await stageCounts(actor.tenantId, job.id)
    return {
      data: {
        ...jobSummary(job, counts),
        department: job.department ?? null,
        employment_type: job.employment_type ?? null,
        experience: { min: job.experience_min ?? null, max: job.experience_max ?? null },
        description: clip(job.description, 1500),
        requirements: clip(job.requirements, 800),
        stages: job.pipeline.map((s) => ({ id: s.id, name: s.name, type: s.type, advance: s.advance, on_fail: s.on_fail, applicants: counts[s.id] ?? 0 })),
        criteria: {
          must_have: (job.criteria?.must_have_skills ?? []).slice(0, 15),
          nice_to_have: (job.criteria?.nice_to_have_skills ?? []).slice(0, 15),
          min_years: job.criteria?.min_years ?? null,
          pass_score: job.criteria?.pass_score ?? null,
        },
      },
    }
  },
})

export const listApplicantsTool = readTool({
  name: 'list_applicants',
  description: 'Applicants for a job with their stage, status and résumé match score (0–100, with missing must-haves). Filter by stage (id or name), status or a minimum match; sort by match or most recent.',
  parameters: {
    type: 'object',
    properties: {
      job_id: { type: 'string' },
      stage: { type: 'string', description: 'Stage id or name, e.g. "Screening".' },
      status: { type: 'string', enum: ['active', 'on_hold', 'hired', 'rejected', 'withdrawn', 'any'] },
      min_match: { type: 'integer', minimum: 0, maximum: 100 },
      sort: { type: 'string', enum: ['match', 'recent'] },
      page: { type: 'integer', minimum: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 50 },
    },
    required: ['job_id'],
  },
  parse(raw) {
    const r = argsObject(raw, ['job_id', 'stage', 'status', 'min_match', 'sort', 'page', 'limit'])
    return {
      job_id: reqId(r, 'job_id'),
      stage: optString(r, 'stage', { max: 80 }),
      status: optEnum(r, 'status', ['active', 'on_hold', 'hired', 'rejected', 'withdrawn', 'any'] as const) ?? 'any',
      min_match: optInt(r, 'min_match', 0, 100),
      sort: optEnum(r, 'sort', ['match', 'recent'] as const) ?? 'match',
      ...paging(r, 20, 50),
    }
  },
  async run(a, ctx) {
    const actor = atsActorFor(ctx.caller)
    const [{ loadJob }, { atsApplications, atsCandidates }] = await Promise.all([import('@/lib/ats/http'), import('@/lib/ats/db')])
    const job = await atsCall(() => loadJob(actor, a.job_id))
    const filter: Doc = { tenant_id: actor.tenantId, job_id: job.id }
    if (a.stage) {
      const st = resolveStage(job, a.stage)
      if (!st) return { data: { error: `No stage called “${a.stage}”. Stages: ${job.pipeline.map((s) => s.name).join(', ')}.` } }
      filter.stage_id = st.id
    }
    if (a.status !== 'any') filter.status = a.status
    if (a.min_match !== undefined) filter['match.score'] = { $gte: a.min_match }
    const col = await atsApplications()
    const [total, apps] = await Promise.all([
      col.countDocuments(filter),
      col.find(filter, { projection: { _id: 0, compensation: 0, compensation_history: 0, history: 0, results: 0 } })
        .sort(a.sort === 'match' ? { 'match.score': -1, created_at: -1 } : { created_at: -1 })
        .skip((a.page - 1) * a.limit).limit(a.limit).toArray() as Promise<AtsApplication[]>,
    ])
    const cands = (await (await atsCandidates()).find({ tenant_id: actor.tenantId, id: { $in: apps.map((x) => x.candidate_id) } }, { projection: { _id: 0, id: 1, name: 1, email: 1, parsed: 1, tags: 1 } }).toArray()) as AtsCandidate[]
    const byId = new Map(cands.map((c) => [c.id, c]))
    return { data: { job: { id: job.id, title: job.title }, total, page: a.page, applicants: apps.map((x) => applicantRow(x, job, byId.get(x.candidate_id) ?? null)) } }
  },
})

export const getApplicationTool = readTool({
  name: 'get_application',
  description: 'One application: candidate summary (staff view, no salary), stage history, stage results (scores and summaries), any suggested move and interviews.',
  parameters: { type: 'object', properties: { application_id: { type: 'string' } }, required: ['application_id'] },
  parse(raw) {
    return { application_id: reqId(argsObject(raw, ['application_id']), 'application_id') }
  },
  async run(a, ctx) {
    const actor = atsActorFor(ctx.caller)
    const [{ loadApplication }, { atsCandidates }, { atsInterviews }, { STAFF_ONLY_RESULT_STAGES }] = await Promise.all([
      import('@/lib/ats/http'), import('@/lib/ats/db'), import('@/lib/ats/interviews/db'), import('@/lib/ats/access-rules'),
    ])
    const { app, job } = await atsCall(() => loadApplication(actor, a.application_id))
    const cand = (await (await atsCandidates()).findOne({ tenant_id: actor.tenantId, id: app.candidate_id }, { projection: { _id: 0, name: 1, email: 1, parsed: 1, tags: 1, source: 1 } })) as AtsCandidate | null
    const ivs = await (await atsInterviews()).find({ tenant_id: actor.tenantId, application_id: app.id }, { projection: { _id: 0, id: 1, stage_id: 1, status: 1, scheduled_at: 1, mode: 1, scorecards: 1 } }).limit(10).toArray()
    return {
      data: {
        ...applicantRow(app, job, cand),
        job: { id: job.id, title: job.title, link: jobLink(job.id) },
        source: app.source,
        rejection_reason: app.rejection_reason ?? null,
        summary: clip(cand?.parsed?.summary, 400),
        titles: (cand?.parsed?.titles || []).slice(0, 5),
        results: (app.results || [])
          // HR round / BGV outcomes are compensation / verification data — summarised only.
          .map((r) => ({ stage: stageName(job, r.stage_id), outcome: r.outcome, score: r.score ?? null, summary: STAFF_ONLY_RESULT_STAGES.has(String(job.pipeline.find((s) => s.id === r.stage_id)?.type)) ? undefined : clip(r.summary, 200), at: r.at })),
        history: (app.history || []).slice(-10).map((h) => ({ from: h.from ? stageName(job, h.from) : null, to: stageName(job, h.to), at: h.at, auto: h.auto, reason: clip(h.reason, 160) })),
        interviews: ivs.map((iv) => ({ id: iv.id, stage: stageName(job, String(iv.stage_id)), status: iv.status, scheduled_at: iv.scheduled_at ?? null, mode: iv.mode, scorecards: Array.isArray(iv.scorecards) ? iv.scorecards.length : 0 })),
        stages: job.pipeline.map((s) => ({ id: s.id, name: s.name, type: s.type })),
      },
    }
  },
})

export const getInterviewScorecardsTool = readTool({
  name: 'get_interview_scorecards',
  description: 'Interview scorecards for an application: each interviewer\'s ratings and recommendation, plus the AI panel summary when there is one.',
  parameters: { type: 'object', properties: { application_id: { type: 'string' } }, required: ['application_id'] },
  parse(raw) {
    return { application_id: reqId(argsObject(raw, ['application_id']), 'application_id') }
  },
  async run(a, ctx) {
    const actor = atsActorFor(ctx.caller)
    const [{ loadApplication }, { atsInterviews }] = await Promise.all([import('@/lib/ats/http'), import('@/lib/ats/interviews/db')])
    const { app, job } = await atsCall(() => loadApplication(actor, a.application_id))
    const ivs = await (await atsInterviews()).find({ tenant_id: actor.tenantId, application_id: app.id }, { projection: { _id: 0, token_nonce: 0, host_url: 0 } }).limit(10).toArray()
    return {
      data: {
        application_id: app.id,
        interviews: ivs.map((iv: Doc) => {
          const names = new Map<string, string>((iv.panel || []).map((p: Doc) => [String(p.user_id), String(p.name || p.email || 'Interviewer')]))
          return {
            id: iv.id,
            stage: stageName(job, String(iv.stage_id)),
            status: iv.status,
            scheduled_at: iv.scheduled_at ?? null,
            scorecards: (iv.scorecards || []).map((c: Doc) => ({ interviewer: names.get(String(c.interviewer_id)) || 'Former panel member', recommendation: c.recommendation, ratings: c.ratings, notes: clip(c.notes, 300), submitted_at: c.submitted_at })),
            ai_summary: clip(iv.ai_summary, 600) || null,
          }
        }),
      },
    }
  },
})

export const getHiringFunnelTool = readTool({
  name: 'get_hiring_funnel',
  description: 'Hiring funnel: applicants reaching each stage, conversion %, median days in stage, time to hire, sources and rejection reasons — for one job or all jobs.',
  parameters: {
    type: 'object',
    properties: { job_id: { type: 'string' }, since: { type: 'string', description: 'YYYY-MM-DD' } },
  },
  parse(raw) {
    const r = argsObject(raw, ['job_id', 'since'])
    const since = optString(r, 'since', { max: 10 })
    return { job_id: r.job_id ? reqId(r, 'job_id') : undefined, since: since && /^\d{4}-\d{2}-\d{2}$/.test(since) ? since : undefined }
  },
  async run(a, ctx) {
    const actor = atsActorFor(ctx.caller)
    const [{ atsJobs, atsApplications }, { jobScopeFilter }, { computeAnalytics }] = await Promise.all([
      import('@/lib/ats/db'), import('@/lib/ats/http'), import('@/lib/ats/analytics'),
    ])
    const scope = await jobScopeFilter(actor)
    if (!scope) return { data: { error: 'Not allowed' } }
    const jobs = (await (await atsJobs()).find({ ...scope, ...(a.job_id ? { id: a.job_id } : {}) }, { projection: { _id: 0 } }).limit(2000).toArray()) as AtsJob[]
    if (a.job_id && !jobs.length) return { data: { error: 'Job not found. Use list_jobs.' } }
    const filter: Doc = { tenant_id: actor.tenantId, job_id: { $in: jobs.map((j) => j.id) } }
    if (a.since) filter.created_at = { $gte: `${a.since}T00:00:00.000Z` }
    const apps = (await (await atsApplications()).find(filter, { projection: { _id: 0, id: 1, job_id: 1, stage_id: 1, status: 1, source: 1, history: 1, created_at: 1, rejection_reason: 1, candidate_id: 1, tenant_id: 1 } }).limit(50_000).toArray()) as AtsApplication[]
    return { data: { job_id: a.job_id ?? null, since: a.since ?? null, ...computeAnalytics(apps, jobs, { jobId: a.job_id ?? null }) } }
  },
})

export const getBgvStatusTool = readTool({
  name: 'get_bgv_status',
  description: 'Background-check (BGV) status: for one application, or every open case in your organisation (e.g. "which offers are waiting on BGV"). Status and per-check status only — never documents or personal data.',
  parameters: {
    type: 'object',
    properties: {
      application_id: { type: 'string' },
      status: { type: 'string', enum: ['open', 'consider', 'clear', 'any'], description: 'When listing: open = not finished yet.' },
      limit: { type: 'integer', minimum: 1, maximum: 50 },
    },
  },
  parse(raw) {
    const r = argsObject(raw, ['application_id', 'status', 'limit'])
    return {
      application_id: r.application_id ? reqId(r, 'application_id') : undefined,
      status: optEnum(r, 'status', ['open', 'consider', 'clear', 'any'] as const) ?? 'open',
      limit: optInt(r, 'limit', 1, 50) ?? 20,
    }
  },
  async run(a, ctx) {
    const actor = atsActorFor(ctx.caller)
    const summary = (c: Doc) => ({
      case_id: c.id,
      application_id: c.application_id,
      status: c.status,
      region: c.region,
      checks: (c.checks || []).map((k: Doc) => ({ type: k.type, status: k.status })),
      submitted_at: c.submitted_at ?? null,
      deadline: c.deadline ?? null,
      adverse_action_open: !!(c.adverse_action && c.adverse_action.pre_adverse_sent_at && !c.adverse_action.final_sent_at),
      updated_at: c.updated_at,
    })
    if (a.application_id) {
      const [{ loadApplication }, { latestCaseForApplication }] = await Promise.all([import('@/lib/ats/http'), import('@/lib/ats/bgv/service')])
      const { app } = await atsCall(() => loadApplication(actor, a.application_id!))
      const c = await latestCaseForApplication(actor.tenantId, app.id)
      return { data: c ? summary(c as unknown as Doc) : { application_id: app.id, status: 'none', note: 'No background check has been started for this application.' } }
    }
    const { bgvCases } = await import('@/lib/ats/bgv/db')
    const filter: Doc = { tenant_id: actor.tenantId }
    if (a.status === 'open') filter.status = { $in: ['invited', 'in_progress', 'submitted', 'verifying'] }
    else if (a.status !== 'any') filter.status = a.status
    const rows = await (await bgvCases()).find(filter, { projection: { _id: 0, id: 1, application_id: 1, status: 1, region: 1, checks: 1, submitted_at: 1, deadline: 1, adverse_action: 1, updated_at: 1 } }).sort({ updated_at: -1 }).limit(a.limit).toArray()
    // The check list carries type + status only (summary()), never data or documents.
    return { data: { total: rows.length, cases: rows.map((r) => summary(r as Doc)) } }
  },
})
