/**
 * Bridge to the legacy job board (`job_postings`, public /jobs pages).
 *
 * ponytail: mirror, don't migrate — a public, open ATS job keeps one
 * job_postings row (linked both ways: ats_jobs.legacy_job_id ↔
 * job_postings.ats_job_id) so the existing /jobs list, detail page, SEO and
 * old job_applications all keep working untouched. The detail page sees
 * `ats_job_id` and applies through the ATS intake instead.
 */
import { getMongoDb } from '@/lib/mongodb'
import type { AtsJob } from './contract'
import { atsJobs, newId, nowIso } from './db'

export function legacyExperienceLabel(job: Pick<AtsJob, 'experience_min' | 'experience_max'>): string | null {
  const a = job.experience_min ?? null
  const b = job.experience_max ?? null
  if (a === null && b === null) return null
  if (a !== null && b !== null) return `${a}–${b} years`
  return a !== null ? `${a}+ years` : `Up to ${b} years`
}

const EMPLOYMENT_LABEL: Record<string, string> = {
  full_time: 'Full-time', part_time: 'Part-time', contract: 'Contract', internship: 'Internship',
}

async function companyFor(job: AtsJob): Promise<string | null> {
  const db = await getMongoDb()
  if (job.client_id) {
    const c = await db.collection('ats_clients').findOne({ id: job.client_id, tenant_id: job.tenant_id }, { projection: { name: 1 } })
    if (c?.name) return String(c.name)
  }
  const t = await db.collection('tenants').findOne({ id: job.tenant_id }, { projection: { name: 1 } })
  return t?.name ? String(t.name) : null
}

/** Fields of the mirrored posting. */
export function legacyFields(job: AtsJob, company: string | null) {
  return {
    title: job.title,
    company,
    location: [job.location, job.work_mode === 'remote' ? 'Remote' : job.work_mode === 'hybrid' ? 'Hybrid' : null].filter(Boolean).join(' · ') || null,
    job_type: job.employment_type ? EMPLOYMENT_LABEL[job.employment_type] ?? null : null,
    experience_level: legacyExperienceLabel(job),
    description: job.description || null,
    requirements: job.requirements || null,
    skills: job.skills || [],
    salary: job.salary && job.salary.min !== undefined && job.salary.max !== undefined
      ? { min: job.salary.min, max: job.salary.max, currency: job.salary.currency || 'INR' }
      : null,
    is_active: job.is_public && job.status === 'open',
  }
}

/**
 * Create / update / hide the mirrored job_postings row for an ATS job.
 * Returns the legacy id (or null when nothing is mirrored).
 */
export async function syncLegacyPosting(job: AtsJob): Promise<string | null> {
  const db = await getMongoDb()
  const col = db.collection('job_postings')
  const visible = job.is_public && job.status === 'open'
  if (!job.legacy_job_id && !visible) return null
  const fields = legacyFields(job, await companyFor(job))
  if (job.legacy_job_id) {
    const r = await col.updateOne(
      { id: job.legacy_job_id, tenant_id: job.tenant_id },
      { $set: { ...fields, ats_job_id: job.id, updated_at: nowIso() } },
    )
    if (r.matchedCount) return job.legacy_job_id
    if (!visible) return null
  }
  const id = newId()
  await col.insertOne({
    id,
    ...fields,
    benefits: null,
    applicants: 0,
    ats_job_id: job.id,
    tenant_id: job.tenant_id,
    created_by: job.created_by,
    created_at: nowIso(),
  })
  await (await atsJobs()).updateOne({ id: job.id, tenant_id: job.tenant_id }, { $set: { legacy_job_id: id } })
  return id
}

/** Hide the mirror (job deleted). Old job_applications stay readable. */
export async function hideLegacyPosting(job: Pick<AtsJob, 'legacy_job_id' | 'tenant_id'>): Promise<void> {
  if (!job.legacy_job_id) return
  const db = await getMongoDb()
  await db.collection('job_postings').updateOne({ id: job.legacy_job_id, tenant_id: job.tenant_id }, { $set: { is_active: false, updated_at: nowIso() } })
}
