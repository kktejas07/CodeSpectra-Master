/**
 * Public apply (ATS apply page + the legacy /jobs detail page for mirrored
 * jobs). Signed-in applicants are identified by their session; guests give
 * email + phone + résumé and are treated as unverified (see upsertCandidate).
 */
import { getMongoDb } from '@/lib/mongodb'
import type { AtsApplication, AtsJob, Compensation } from './contract'
import { compensationToOverrides } from './compensation'
import { intakeResume, upsertCandidate, createApplication, normEmail, applyOverrides, type ParsedOverrides } from './intake'
import { toE164 } from './phone'

export interface ApplyInput {
  user?: { id: string; email: string; name?: string } | null
  name?: string
  email?: string
  phone?: string
  country?: string | null
  location?: string | null
  cover_letter?: string | null
  consent?: { whatsapp: boolean; calls: boolean }
  resume?: { file_name: string; text: string } | null
  /** Stated on the form: notice period (days), current / expected annual salary. */
  overrides?: ParsedOverrides
  /** Validated on the form (parseCompensation, source 'apply'); stored on the application. */
  compensation?: Compensation | null
}

export class ApplyError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

async function primaryResume(userId: string): Promise<{ file_name: string; text: string } | null> {
  const db = await getMongoDb()
  const rows = await db.collection('resumes')
    .find({ user_id: userId }, { projection: { _id: 0, file_name: 1, text_content: 1, is_primary: 1, uploaded_at: 1 } })
    .sort({ uploaded_at: -1 })
    .limit(10)
    .toArray()
  const r = rows.find((x) => x.is_primary && x.text_content) || rows.find((x) => x.text_content)
  return r ? { file_name: String(r.file_name || 'Résumé'), text: String(r.text_content).slice(0, 60_000) } : null
}

export async function applyToJob(job: AtsJob, input: ApplyInput): Promise<{ application: AtsApplication; created: boolean }> {
  if (!(job.is_public && job.status === 'open')) throw new ApplyError(404, 'This job is no longer open')
  const signedIn = !!input.user
  const email = signedIn ? normEmail(input.user!.email) : normEmail(input.email)
  if (!email) throw new ApplyError(400, 'Enter a valid email address')
  const phone = input.phone ? toE164(input.phone, input.country) : null
  if (input.phone && !phone) throw new ApplyError(400, 'Enter a valid phone number with the country code')
  if (!signedIn && !phone) throw new ApplyError(400, 'Enter your phone number')
  const resume = input.resume ?? (signedIn ? await primaryResume(input.user!.id) : null)
  if (!resume && !signedIn) throw new ApplyError(400, 'Attach your résumé')

  const base = {
    name: input.name || input.user?.name,
    email,
    phone,
    country: input.country ?? null,
    location: input.location ?? null,
    user_id: input.user?.id ?? null,
    source: 'apply_page' as const,
    consent: input.consent ?? { whatsapp: false, calls: false },
    verified: signedIn,
    tags: [],
  }
  const compensation = input.compensation ?? null
  // Stated compensation beats the legacy fields (both feed the screening salary / notice checks).
  const overrides: ParsedOverrides = { ...input.overrides, ...(compensation ? compensationToOverrides(compensation) : {}), location: input.location ?? undefined }
  let out: { application: AtsApplication; created: boolean }
  if (resume) {
    const r = await intakeResume(job, resume, { ...base, ai: true, overrides, compensation })
    out = { application: r.application, created: r.created }
  } else {
    const { candidate } = await upsertCandidate(job.tenant_id, { ...base, parsed: applyOverrides(null, overrides) })
    out = await createApplication(job, candidate, 'apply_page', { location: input.location, compensation })
  }
  if (out.created && input.cover_letter) {
    const { atsApplications } = await import('./db')
    await (await atsApplications()).updateOne(
      { id: out.application.id, tenant_id: job.tenant_id },
      { $set: { cover_letter: input.cover_letter.slice(0, 5000) } },
    )
  }
  if (out.created && job.legacy_job_id) {
    const db = await getMongoDb()
    await db.collection('job_postings').updateOne({ id: job.legacy_job_id, tenant_id: job.tenant_id }, { $inc: { applicants: 1 } }).catch(() => {})
  }
  return out
}

