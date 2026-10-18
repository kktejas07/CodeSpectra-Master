/**
 * Résumé sources — staff only, tenant scoped. A candidate's résumé is indexed
 * once per organisation whose tests they took: source_id = `${tenantKey}:${userId}`
 * ('_platform' for platform-run tests, superadmin only). Text = the latest
 * résumé-builder draft + the latest uploaded résumé's extracted text. Phone and
 * email are left out (not needed to search, and PII is minimised).
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
      .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
      .replace(/\+?\d[\d\s().-]{8,}\d/g, '[phone]')
    parts.push(`## Uploaded résumé${uploaded?.file_name ? ` (${str(uploaded.file_name, 120)})` : ''}\n${cleaned}`)
  }
  return parts.join('\n\n').slice(0, MAX_RESUME_CHARS)
}

function parseId(sourceId: string): { tenantKey: string; userId: string } | null {
  const sep = sourceId.indexOf(':')
  if (sep <= 0 || sep === sourceId.length - 1) return null
  return { tenantKey: sourceId.slice(0, sep), userId: sourceId.slice(sep + 1) }
}

export async function loadResume(db: Db, sourceId: string): Promise<ExtractedSource | null> {
  const parsed = parseId(sourceId)
  if (!parsed) return null
  const tenantId = parsed.tenantKey === PLATFORM_TENANT_KEY ? null : parsed.tenantKey
  // Only while the candidate is in one of this organisation's tests.
  const examIds = (await db.collection('exams').find(tenantId ? { tenant_id: tenantId } : { tenant_id: null }, { projection: { _id: 0, id: 1 } }).limit(5000).toArray())
    .map((e) => str(e.id, 200))
  if (!examIds.length) return null
  const sub = await db.collection('exam_submissions').findOne({ exam_id: { $in: examIds }, user_id: parsed.userId }, { projection: { _id: 0, email: 1 } })
  if (!sub) return null
  const [draft, uploaded] = await Promise.all([
    db.collection('resume_drafts').find({ user_id: parsed.userId }).sort({ updated_at: -1 }).limit(1).next(),
    db.collection('resumes').find({ user_id: parsed.userId }).sort({ is_primary: -1, uploaded_at: -1 }).limit(1).next(),
  ])
  const text = resumeText(draft as Doc | null, uploaded as Doc | null)
  if (!text.trim()) return null
  const name = await candidateName(db, parsed.userId, sub.email)
  return {
    type: 'resume',
    source_id: sourceId,
    tenant_id: tenantId,
    visibility: tenantId ? 'tenant' : 'platform_admin',
    title: `Résumé: ${name}`,
    url: null,
    text,
    metadata: { user_id: parsed.userId, staff_only: true },
  }
}

export async function listResumeIds(db: Db, limit: number, tenantId?: string | null): Promise<string[]> {
  const exams = await db.collection('exams').find(tenantId ? { tenant_id: tenantId } : {}, { projection: { _id: 0, id: 1, tenant_id: 1 } }).limit(5000).toArray()
  if (!exams.length) return []
  const tenantByExam = new Map(exams.map((e) => [str(e.id, 200), typeof e.tenant_id === 'string' && e.tenant_id ? e.tenant_id : PLATFORM_TENANT_KEY]))
  const subs = await db.collection('exam_submissions')
    .find({ exam_id: { $in: [...tenantByExam.keys()] } }, { projection: { _id: 0, exam_id: 1, user_id: 1 } })
    .limit(limit * 4).toArray()
  const pairs = new Set<string>()
  for (const s of subs) {
    const t = tenantByExam.get(str(s.exam_id, 200))
    const u = str(s.user_id, 200)
    if (t && u) pairs.add(`${t}:${u}`)
  }
  const users = [...new Set([...pairs].map((p) => p.slice(p.indexOf(':') + 1)))]
  if (!users.length) return []
  const [withDraft, withUpload] = await Promise.all([
    db.collection('resume_drafts').distinct('user_id', { user_id: { $in: users } }),
    db.collection('resumes').distinct('user_id', { user_id: { $in: users } }),
  ])
  const has = new Set([...withDraft, ...withUpload].map(String))
  return [...pairs].filter((p) => has.has(p.slice(p.indexOf(':') + 1))).slice(0, limit)
}
