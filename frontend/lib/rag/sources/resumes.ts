/**
 * Résumé sources — staff only, tenant scoped (RAG-004).
 *
 * A candidate's résumé is indexed for an organisation ONLY when they shared it
 * with that organisation: they applied to one of its job postings with that
 * résumé attached (job_applications.resume_id). Taking a test is not sharing a
 * résumé, and private résumé-builder drafts are never indexed. Applicants in
 * the hiring pipeline are indexed separately as `ats_application` sources.
 *
 * source_id = `${tenantKey}:${userId}` ('_platform' for platform-run postings,
 * superadmin only). Text = the shared résumés' extracted text with emails and
 * phone numbers removed. A deleted account (no user row) returns null, so the
 * source is removed on its next turn; account deletion also purges directly
 * (lib/rag/hooks knowledgeOnUserDeleted).
 */
import type { Db } from 'mongodb'
import type { ExtractedSource } from '../types'
import { PLATFORM_TENANT_KEY } from '../types'
import { arr, str, type Doc } from './util'
import { candidateName } from './assessments'

const MAX_RESUME_CHARS = 40_000

export function resumeText(draft: Doc | null, uploaded: Doc | null): string {
  const parts: string[] = []
  const d = (draft?.data && typeof draft.data === 'object' ? draft.data : null) as Doc | null
  if (d) {
    const p = (d.personal && typeof d.personal === 'object' ? d.personal : {}) as Doc
    if (p.location) parts.push(`- Location: ${str(p.location, 120)}`)
    if (p.linkedin) parts.push(`- LinkedIn: ${str(p.linkedin, 300)}`)
    if (p.portfolio) parts.push(`- Portfolio: ${str(p.portfolio, 300)}`)
    if (d.summary) parts.push(`## Summary\n${str(d.summary, 3000)}`)
    const exp = arr(d.experience)
    if (exp.length) {
      parts.push('## Experience')
      for (const e of exp) parts.push(`### ${[str(e.role, 160), str(e.company, 160)].filter(Boolean).join(' at ')}${e.dates ? ` (${str(e.dates, 80)})` : ''}\n${str(e.description, 4000)}`)
    }
    const edu = arr(d.education)
    if (edu.length) parts.push(`## Education\n${edu.map((e) => `- ${[str(e.degree, 160), str(e.institution, 160), str(e.dates, 80)].filter(Boolean).join(', ')}`).join('\n')}`)
    if (d.skills) parts.push(`## Skills\n${str(d.skills, 2000)}`)
  }
  const up = str(uploaded?.text_content, MAX_RESUME_CHARS)
  if (up.trim()) {
    const cleaned = up
      .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[redacted]')
      .replace(/\+?\d[\d\s().-]{8,}\d/g, '[redacted]')
    parts.push(`## Uploaded résumé${uploaded?.file_name ? ` (${str(uploaded.file_name, 120)})` : ''}\n${cleaned}`)
  }
  return parts.join('\n\n').slice(0, MAX_RESUME_CHARS)
}

function parseId(sourceId: string): { tenantKey: string; userId: string } | null {
  const sep = sourceId.indexOf(':')
  if (sep <= 0 || sep === sourceId.length - 1) return null
  return { tenantKey: sourceId.slice(0, sep), userId: sourceId.slice(sep + 1) }
}

/** Résumé ids (resumes.id) this user attached to job applications at this organisation. */
async function sharedResumeIds(db: Db, tenantId: string | null, userId: string): Promise<string[]> {
  const apps = await db.collection('job_applications')
    .find({ user_id: userId, resume_id: { $type: 'string' } }, { projection: { _id: 0, job_id: 1, resume_id: 1 } })
    .limit(500).toArray()
  if (!apps.length) return []
  const jobs = await db.collection('job_postings')
    .find({ id: { $in: apps.map((a) => str(a.job_id, 200)) }, ...(tenantId ? { tenant_id: tenantId } : { tenant_id: { $in: [null, ''] } }) }, { projection: { _id: 0, id: 1 } })
    .toArray()
  const ok = new Set(jobs.map((j) => str(j.id, 200)))
  return [...new Set(apps.filter((a) => ok.has(str(a.job_id, 200))).map((a) => str(a.resume_id, 200)).filter(Boolean))]
}

export async function loadResume(db: Db, sourceId: string): Promise<ExtractedSource | null> {
  const parsed = parseId(sourceId)
  if (!parsed) return null
  const tenantId = parsed.tenantKey === PLATFORM_TENANT_KEY ? null : parsed.tenantKey
  // Deleted account → nothing to index (and the old chunks are removed).
  const user = await db.collection('user').findOne({ $or: [{ id: parsed.userId }, { _id: parsed.userId }] } as never, { projection: { _id: 1, email: 1 } })
  if (!user) return null
  const shared = await sharedResumeIds(db, tenantId, parsed.userId)
  if (!shared.length) return null
  const docs = await db.collection('resumes').find({ id: { $in: shared }, user_id: parsed.userId }).sort({ uploaded_at: -1 }).limit(3).toArray()
  const text = docs.map((d) => resumeText(null, d as Doc)).filter((t) => t.trim()).join('\n\n').slice(0, MAX_RESUME_CHARS)
  if (!text.trim()) return null
  const name = await candidateName(db, parsed.userId, (user as Doc).email)
  return {
    type: 'resume',
    source_id: sourceId,
    tenant_id: tenantId,
    visibility: tenantId ? 'tenant' : 'platform_admin',
    title: `Résumé: ${name}`,
    url: null,
    text,
    metadata: { user_id: parsed.userId, staff_only: true, shared_resume_ids: shared.slice(0, 5) },
  }
}

export async function listResumeIds(db: Db, limit: number, tenantId?: string | null): Promise<string[]> {
  // Résumés shared through job applications only (see the header).
  const jobs = await db.collection('job_postings').find(tenantId ? { tenant_id: tenantId } : {}, { projection: { _id: 0, id: 1, tenant_id: 1 } }).limit(20_000).toArray()
  if (!jobs.length) return []
  const tenantByJob = new Map(jobs.map((j) => [str(j.id, 200), typeof j.tenant_id === 'string' && j.tenant_id ? j.tenant_id : PLATFORM_TENANT_KEY]))
  const apps = await db.collection('job_applications')
    .find({ job_id: { $in: [...tenantByJob.keys()] }, resume_id: { $type: 'string' } }, { projection: { _id: 0, job_id: 1, user_id: 1 } })
    .limit(limit * 4).toArray()
  const pairs = new Set<string>()
  for (const a of apps) {
    const t = tenantByJob.get(str(a.job_id, 200))
    const u = str(a.user_id, 200)
    if (t && u) pairs.add(`${t}:${u}`)
  }
  return [...pairs].slice(0, limit)
}
