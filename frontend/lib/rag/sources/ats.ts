/**
 * Hiring pipeline sources (RAG-001).
 *
 *  ats_job          one per job — title, JD, requirements, skills, pipeline,
 *                   status. Tenant scoped (visibility 'tenant': that
 *                   organisation's admins only; public apply pages are served
 *                   elsewhere, never from the knowledge base).
 *  ats_application  one per application — staff only, tenant scoped,
 *                   PII-minimised: name, stage, status, match score + reasons,
 *                   parsed skills / titles / companies / years / education and
 *                   a capped résumé excerpt with emails and phone numbers
 *                   removed. Never: phone, email, address, salary or
 *                   compensation, BGV data, HR forms, interview notes.
 *                   Withdrawn applications are dropped from the index.
 */
import type { Db } from 'mongodb'
import type { ExtractedSource } from '../types'
import { arr, fields, str, strList, type Doc } from './util'

const MAX_RESUME_EXCERPT = 6000

/** Remove contact details from free text (emails, phone numbers, URLs with query strings). */
export function redactContacts(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[redacted]')
    .replace(/\+?\d[\d\s().-]{8,}\d/g, '[redacted]')
    .replace(/https?:\/\/\S+\?\S+/g, '[redacted]')
}

export function atsJobSource(job: Doc): ExtractedSource | null {
  const id = str(job.id, 200)
  const tenant = str(job.tenant_id, 200)
  if (!id || !tenant) return null
  const pipeline = arr(job.pipeline).map((s) => str(s.name, 80)).filter(Boolean)
  const exp = job.experience_min != null || job.experience_max != null ? `${job.experience_min ?? 0}–${job.experience_max ?? '…'} years` : ''
  const parts = [
    fields([
      ['Status', job.status],
      ['Department', job.department],
      ['Location', job.location],
      ['Work mode', job.work_mode],
      ['Employment type', job.employment_type],
      ['Experience', exp],
      ['Openings', job.openings],
      ['Skills', strList(job.skills, 40, 60)],
      ['Must-have skills', strList((job.criteria as Doc | undefined)?.must_have_skills, 30, 60)],
      ['Nice-to-have skills', strList((job.criteria as Doc | undefined)?.nice_to_have_skills, 30, 60)],
      ['Pipeline', pipeline.join(' → ')],
    ]),
  ]
  const desc = str(job.description, 20_000).trim()
  if (desc) parts.push(`## Job description\n${desc}`)
  const req = str(job.requirements, 10_000).trim()
  if (req) parts.push(`## Requirements\n${req}`)
  return {
    type: 'ats_job',
    source_id: id,
    tenant_id: tenant,
    visibility: 'tenant',
    title: `Job: ${str(job.title, 160) || 'Untitled'}`,
    url: `/dashboard/hiring/jobs/${id}`,
    text: parts.join('\n\n'),
    chunk: { splitOnSection: true },
  }
}

export function atsApplicationSource(app: Doc, job: Doc | null, cand: Doc | null): ExtractedSource | null {
  const id = str(app.id, 200)
  const tenant = str(app.tenant_id, 200)
  if (!id || !tenant || !job || !cand) return null
  if (app.status === 'withdrawn') return null
  const stage = arr(job.pipeline).find((s) => s.id === app.stage_id)
  const parsed = (cand.parsed && typeof cand.parsed === 'object' ? cand.parsed : {}) as Doc
  const match = (app.match && typeof app.match === 'object' ? app.match : null) as Doc | null
  const edu = arr(parsed.education).map((e) => [str(e.degree, 80), str(e.field, 80), str(e.institution, 120)].filter(Boolean).join(', ')).filter(Boolean)
  const parts = [
    fields([
      ['Job', job.title],
      ['Stage', stage?.name ?? app.stage_id],
      ['Status', app.status],
      ['Match score', match ? Math.round(Number(match.score) || 0) : null],
      ['Missing must-haves', strList(match?.missing_must, 10, 60)],
      ['Match reasons', strList(match?.reasons, 6, 160).join('; ')],
      ['Years of experience', parsed.total_years],
      ['Skills', strList(parsed.skills, 40, 60)],
      ['Titles', strList(parsed.titles, 8, 100)],
      ['Companies', strList(parsed.companies, 8, 100)],
      ['Education', edu.join(' | ')],
      ['Location', parsed.location],
      ['Notice period (days)', parsed.notice_days],
      ['Source', app.source],
      ['Tags', strList(cand.tags, 10, 40)],
      ['Applied', str(app.created_at, 30).slice(0, 10)],
    ]),
  ]
  const summary = str(parsed.summary, 1500).trim()
  if (summary) parts.push(`## Summary\n${redactContacts(summary)}`)
  const resume = str((cand.resume as Doc | undefined)?.text, 60_000).trim()
  if (resume) parts.push(`## Résumé excerpt\n${redactContacts(resume).slice(0, MAX_RESUME_EXCERPT)}`)
  return {
    type: 'ats_application',
    source_id: id,
    tenant_id: tenant,
    visibility: 'tenant',
    title: `Applicant: ${str(cand.name, 120) || 'Unknown'} — ${str(job.title, 120)}`,
    url: `/dashboard/hiring/jobs/${str(job.id, 200)}?application=${id}`,
    text: parts.join('\n\n'),
    metadata: { staff_only: true, job_id: str(job.id, 200), candidate_id: str(cand.id, 200) },
    chunk: { splitOnSection: true },
  }
}

export async function loadAtsJob(db: Db, id: string): Promise<ExtractedSource | null> {
  const job = await db.collection('ats_jobs').findOne({ id }, { projection: { _id: 0 } })
  return job ? atsJobSource(job as Doc) : null
}

export async function loadAtsApplication(db: Db, id: string): Promise<ExtractedSource | null> {
  const app = (await db.collection('ats_applications').findOne({ id }, { projection: { _id: 0, compensation: 0, compensation_history: 0, history: 0 } })) as Doc | null
  if (!app) return null
  const [job, cand] = await Promise.all([
    db.collection('ats_jobs').findOne({ id: app.job_id, tenant_id: app.tenant_id }, { projection: { _id: 0, id: 1, title: 1, pipeline: 1 } }),
    db.collection('ats_candidates').findOne({ id: app.candidate_id, tenant_id: app.tenant_id }, { projection: { _id: 0, id: 1, name: 1, parsed: 1, tags: 1, 'resume.text': 1 } }),
  ])
  return atsApplicationSource(app, job as Doc | null, cand as Doc | null)
}

export async function listAtsJobIds(db: Db, limit: number, tenantId?: string | null): Promise<string[]> {
  const rows = await db.collection('ats_jobs').find(tenantId ? { tenant_id: tenantId } : {}, { projection: { _id: 0, id: 1 } }).limit(limit).toArray()
  return rows.map((r) => str(r.id, 200)).filter(Boolean)
}

export async function listAtsApplicationIds(db: Db, limit: number, tenantId?: string | null): Promise<string[]> {
  const rows = await db.collection('ats_applications')
    .find({ ...(tenantId ? { tenant_id: tenantId } : {}), status: { $ne: 'withdrawn' } }, { projection: { _id: 0, id: 1 } })
    .limit(limit).toArray()
  return rows.map((r) => str(r.id, 200)).filter(Boolean)
}
