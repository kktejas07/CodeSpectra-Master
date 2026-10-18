/**
 * Résumé selection for the AI mock interview. The client sends a reference
 * (`{ kind, id }`) to one of its own saved résumé-builder drafts or uploaded
 * résumés; the server loads the text by id with an ownership check. When a
 * reference is given, any `resumeText` from the client is ignored.
 */
import { resumes } from '@/lib/db/content'
import { resumeDrafts, type ResumeBuilderData } from '@/app/api/resumes/_lib/builder-data'

export type ResumeRef = { kind: 'draft' | 'uploaded'; id: string }

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/
/** Same ceiling the parser gets either way. */
export const MAX_RESUME_CHARS = 20_000

/** undefined = no reference given; null = a reference was given but is malformed. */
export function parseResumeRef(raw: unknown): ResumeRef | null | undefined {
  if (raw === undefined || raw === null) return undefined
  if (typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if ((r.kind !== 'draft' && r.kind !== 'uploaded') || typeof r.id !== 'string' || !ID_RE.test(r.id)) return null
  return { kind: r.kind, id: r.id }
}

/** Plain-text résumé from builder data, for the parser. */
export function draftToResumeText(d: ResumeBuilderData): string {
  const lines: string[] = []
  const p = d.personal
  if (p.fullName) lines.push(p.fullName)
  const contact = [p.location, p.linkedin, p.portfolio].filter(Boolean).join(' · ')
  if (contact) lines.push(contact)
  if (d.summary.trim()) lines.push('', 'Summary', d.summary.trim())
  const exp = d.experience.filter((e) => e.role || e.company || e.description)
  if (exp.length) {
    lines.push('', 'Experience')
    for (const e of exp) {
      lines.push([e.role, e.company].filter(Boolean).join(' at ') + (e.dates ? ` (${e.dates})` : ''))
      if (e.description.trim()) lines.push(e.description.trim())
    }
  }
  const edu = d.education.filter((e) => e.degree || e.institution)
  if (edu.length) {
    lines.push('', 'Education')
    for (const e of edu) lines.push([e.degree, e.institution].filter(Boolean).join(', ') + (e.dates ? ` (${e.dates})` : ''))
  }
  if (d.skills.trim()) lines.push('', 'Skills', d.skills.trim())
  return lines.join('\n').trim().slice(0, MAX_RESUME_CHARS)
}

/**
 * Text of the caller's own résumé, or null when it doesn't exist, isn't
 * theirs, or has no text. (Contact details are left out of drafts: email and
 * phone aren't needed to tailor questions.)
 */
export async function loadOwnResumeText(userId: string, ref: ResumeRef): Promise<{ text: string; label: string } | null> {
  if (ref.kind === 'draft') {
    const draft = await (await resumeDrafts()).findOne({ id: ref.id, user_id: userId }, { projection: { _id: 0, name: 1, data: 1 } })
    if (!draft?.data) return null
    const text = draftToResumeText(draft.data)
    return text ? { text, label: draft.name } : null
  }
  const doc = await (await resumes()).findOne({ id: ref.id, user_id: userId }, { projection: { _id: 0, file_name: 1, text_content: 1 } })
  const text = (doc?.text_content ?? '').trim()
  return text ? { text: text.slice(0, MAX_RESUME_CHARS), label: doc!.file_name } : null
}
