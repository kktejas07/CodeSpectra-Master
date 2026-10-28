/**
 * Jobs (requisitions) service: create / update / delete with pipeline and
 * criteria validation, status lifecycle and the legacy job-board mirror.
 * Callers pass an authorised AtsActor (routes check lib/ats/access first).
 */
import { getMongoDb } from '@/lib/mongodb'
import type { AtsActor, AtsApplication, AtsJob, JobStatus, PipelineStage } from './contract'
import { atsApplications, atsClients, atsJobs, newId, nowIso } from './db'
import { AtsError, moveApplication } from './engine'
import { hideLegacyPosting, syncLegacyPosting } from './legacy'
import {
  JOB_STATUSES, canTransition, defaultCriteria, defaultPipeline, planStageMoves, sanitizeCriteria,
  sanitizeJobFields, sanitizePipeline, validatePipeline,
} from './pipeline'

/** Exam ids (from `ids`) that belong to this tenant. */
export async function tenantExamIds(tenantId: string, ids: string[]): Promise<Set<string>> {
  const want = [...new Set(ids.filter(Boolean))]
  if (!want.length) return new Set()
  const db = await getMongoDb()
  const rows = await db.collection('exams').find({ id: { $in: want }, tenant_id: tenantId }, { projection: { _id: 0, id: 1 } }).toArray()
  return new Set(rows.map((r) => String(r.id)))
}

function examIdsOf(stages: PipelineStage[]): string[] {
  return stages.flatMap((s) => (s.config?.kind === 'assessment' && s.config.exam_id ? [s.config.exam_id] : []))
}

async function checkPipeline(tenantId: string, stages: PipelineStage[], status: JobStatus): Promise<void> {
  const owned = await tenantExamIds(tenantId, examIdsOf(stages))
  const errors = validatePipeline(stages, { tenantExamIds: owned, requireRunnable: status === 'open' })
  if (errors.length) throw new AtsError(400, errors.join('. '))
}

async function checkClient(tenantId: string, clientId: unknown): Promise<string | null> {
  if (clientId === null || clientId === undefined || clientId === '') return null
  const id = String(clientId).slice(0, 128)
  const c = await (await atsClients()).findOne({ id, tenant_id: tenantId }, { projection: { _id: 0, id: 1 } })
  if (!c) throw new AtsError(400, 'That client is not in your organisation')
  return id
}

function parseStatus(v: unknown): JobStatus | null {
  return JOB_STATUSES.find((s) => s === v) ?? null
}

export function publicJob(job: AtsJob) {
  return {
    id: job.id,
    title: job.title,
    department: job.department ?? null,
    location: job.location ?? null,
    work_mode: job.work_mode ?? null,
    employment_type: job.employment_type ?? null,
    experience_min: job.experience_min ?? null,
    experience_max: job.experience_max ?? null,
    salary: job.salary ?? null,
    openings: job.openings,
    description: job.description,
    requirements: job.requirements ?? null,
    skills: job.skills || [],
    legacy_job_id: job.legacy_job_id ?? null,
    created_at: job.created_at,
  }
}

export async function createJob(actor: AtsActor, body: Record<string, unknown>): Promise<AtsJob> {
  const fields = sanitizeJobFields(body)
  // Import from a legacy posting of this tenant (fields default from it).
  let legacyId: string | null = null
  if (typeof body.legacy_job_id === 'string' && body.legacy_job_id) {
    const db = await getMongoDb()
    const legacy = await db.collection('job_postings').findOne({ id: body.legacy_job_id.slice(0, 128), tenant_id: actor.tenantId })
    if (!legacy) throw new AtsError(400, 'That job posting is not in your organisation')
    const linked = await (await atsJobs()).findOne({ tenant_id: actor.tenantId, legacy_job_id: String(legacy.id) }, { projection: { id: 1 } })
    if (linked) throw new AtsError(409, 'That job posting is already linked to a hiring pipeline')
    legacyId = String(legacy.id)
    fields.title ||= String(legacy.title || '').slice(0, 160)
    fields.description ||= String(legacy.description || '').slice(0, 20_000)
    fields.requirements ??= legacy.requirements ? String(legacy.requirements).slice(0, 10_000) : null
    fields.location ??= legacy.location ? String(legacy.location).slice(0, 160) : null
    if (!fields.skills?.length && Array.isArray(legacy.skills)) fields.skills = legacy.skills.map(String).slice(0, 40)
    if (fields.salary === undefined && legacy.salary) fields.salary = legacy.salary
    if (fields.is_public === undefined) fields.is_public = legacy.is_active !== false
  }
  if (!fields.title) throw new AtsError(400, 'Give the job a title')
  const clientId = await checkClient(actor.tenantId, body.client_id)
  const status = parseStatus(body.status) ?? 'draft'
  if (status !== 'draft' && status !== 'open') throw new AtsError(400, 'A new job starts as a draft or open')
  let pipeline: PipelineStage[]
  if (body.pipeline !== undefined) {
    const p = sanitizePipeline(body.pipeline)
    if (p.errors.length) throw new AtsError(400, p.errors.join('. '))
    pipeline = p.stages
  } else {
    pipeline = defaultPipeline({ hasClient: !!clientId, examId: typeof body.exam_id === 'string' ? body.exam_id.slice(0, 128) : null })
  }
  await checkPipeline(actor.tenantId, pipeline, status)
  const ts = nowIso()
  const job: AtsJob = {
    id: newId(),
    tenant_id: actor.tenantId,
    client_id: clientId,
    title: fields.title,
    department: fields.department ?? null,
    location: fields.location ?? null,
    work_mode: fields.work_mode ?? null,
    employment_type: fields.employment_type ?? null,
    experience_min: fields.experience_min ?? null,
    experience_max: fields.experience_max ?? null,
    salary: fields.salary ?? null,
    openings: fields.openings ?? 1,
    description: fields.description || '',
    requirements: fields.requirements ?? null,
    skills: fields.skills || [],
    status,
    is_public: fields.is_public ?? false,
    recruiter_ids: fields.recruiter_ids?.length ? fields.recruiter_ids : actor.role === 'recruiter' ? [actor.userId] : [],
    hiring_manager_ids: fields.hiring_manager_ids || [],
    criteria: body.criteria !== undefined ? sanitizeCriteria(body.criteria, defaultCriteria(fields.skills || [])) : defaultCriteria(fields.skills || []),
    pipeline,
    legacy_job_id: legacyId,
    created_by: actor.userId,
    created_at: ts,
    updated_at: ts,
  }
  await (await atsJobs()).insertOne(job)
  void import('@/lib/rag/hooks').then((h) => h.knowledgeOnAtsJob(job.id, job.tenant_id)).catch(() => {}) // RAG-001
  if (legacyId) {
    const db = await getMongoDb()
    await db.collection('job_postings').updateOne({ id: legacyId, tenant_id: actor.tenantId }, { $set: { ats_job_id: job.id } })
  }
  const mirrored = await syncLegacyPosting(job)
  return { ...job, legacy_job_id: mirrored ?? legacyId }
}

export async function stageCounts(tenantId: string, jobId: string): Promise<Record<string, number>> {
  const rows = (await (await atsApplications())
    .find({ tenant_id: tenantId, job_id: jobId }, { projection: { _id: 0, stage_id: 1 } })
    .limit(50_000)
    .toArray()) as Pick<AtsApplication, 'stage_id'>[]
  const out: Record<string, number> = {}
  for (const r of rows) out[r.stage_id] = (out[r.stage_id] || 0) + 1
  return out
}

export async function updateJob(actor: AtsActor, job: AtsJob, body: Record<string, unknown>): Promise<AtsJob> {
  const fields = sanitizeJobFields(body)
  if ('title' in fields && !fields.title) throw new AtsError(400, 'Give the job a title')
  const set: Record<string, unknown> = { ...fields, updated_at: nowIso() }
  if ('client_id' in body) set.client_id = await checkClient(actor.tenantId, body.client_id)
  if (body.criteria !== undefined) set.criteria = sanitizeCriteria(body.criteria, job.criteria)

  let status = job.status
  if (body.status !== undefined) {
    const to = parseStatus(body.status)
    if (!to) throw new AtsError(400, 'Unknown job status')
    if (!canTransition(job.status, to)) throw new AtsError(400, `A ${job.status.replace('_', ' ')} job can't become ${to.replace('_', ' ')}`)
    if (to === 'open' && (fields.openings ?? job.openings) <= 0) throw new AtsError(400, 'Add at least one opening before reopening the job')
    status = to
    set.status = to
  }

  let pipeline = job.pipeline
  let moves: { from: string; to: string }[] = []
  if (body.pipeline !== undefined) {
    const p = sanitizePipeline(body.pipeline)
    if (p.errors.length) throw new AtsError(400, p.errors.join('. '))
    pipeline = p.stages
    const rawMoves = body.stage_moves && typeof body.stage_moves === 'object' ? (body.stage_moves as Record<string, unknown>) : {}
    const plan = planStageMoves(job.pipeline, pipeline, await stageCounts(job.tenant_id, job.id), Object.fromEntries(Object.entries(rawMoves).map(([k, v]) => [k, String(v)])))
    if (plan.errors.length) throw new AtsError(400, plan.errors.join('. '))
    moves = plan.moves
    set.pipeline = pipeline
  }
  if (body.pipeline !== undefined || set.status === 'open') await checkPipeline(job.tenant_id, pipeline, status)

  const jobs = await atsJobs()
  const r = await jobs.updateOne({ id: job.id, tenant_id: job.tenant_id, updated_at: job.updated_at }, { $set: set })
  if (!r.matchedCount) throw new AtsError(409, 'This job was just changed by someone else — refresh and try again')
  void import('@/lib/rag/hooks').then((h) => h.knowledgeOnAtsJob(job.id, job.tenant_id)).catch(() => {}) // RAG-001
  const updated = { ...job, ...set } as AtsJob

  // Candidates in removed stages go to the chosen target (with history + entry effects).
  for (const m of moves) {
    const stuck = (await (await atsApplications())
      .find({ tenant_id: job.tenant_id, job_id: job.id, stage_id: m.from }, { projection: { _id: 0, id: 1 } })
      .limit(5000)
      .toArray()) as Pick<AtsApplication, 'id'>[]
    for (const a of stuck) {
      await moveApplication(actor, a.id, m.to, { reason: 'Stage removed from the pipeline' }).catch((e) => console.error('[ats/jobs] re-home failed', a.id, e))
    }
  }
  const legacy = await syncLegacyPosting(updated)
  return { ...updated, legacy_job_id: legacy ?? updated.legacy_job_id ?? null }
}

export async function deleteJob(job: AtsJob): Promise<void> {
  const n = await (await atsApplications()).countDocuments({ tenant_id: job.tenant_id, job_id: job.id })
  if (n > 0) throw new AtsError(409, `This job has ${n} application${n === 1 ? '' : 's'}. Close it instead so the history is kept.`)
  await (await atsJobs()).deleteOne({ id: job.id, tenant_id: job.tenant_id })
  void import('@/lib/rag/hooks').then((h) => h.knowledgeOnAtsJob(job.id, job.tenant_id)).catch(() => {}) // RAG-001
  await hideLegacyPosting(job)
}
