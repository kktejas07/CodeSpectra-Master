/**
 * Job matching (server only).
 *   job_match_prefs   one per learner: city / country / relocate / years / expected salary (minor units)
 *
 * Learner side: open public ATS jobs scored against the learner's verified
 * passport + prefs ("jobs for you"), and apply with a chosen résumé version.
 * Recruiter side: "best matches" for a job among learners who opted in to
 * talent discovery (lib/talent consent rules) — summary only, never contact.
 */
import 'server-only'
import { z } from 'zod'
import type { APIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { nowIso } from '@/lib/db/ids'
import type { AtsActor, AtsJob } from '@/lib/ats/contract'
import { matchScore, rankMatches, toMatchLevel, type MatchProfile, type MatchResult } from './score'

export class MatchError extends Error {
  constructor(message: string, public status = 400, public code?: string) { super(message) }
}

export interface MatchPrefsDoc {
  user_id: string
  city: string | null
  country: string | null
  open_to_relocate: boolean
  experience_years: number | null
  expected_salary_minor: number | null
  currency: string | null
  updated_at: string
}

export const prefsSchema = z.object({
  city: z.string().trim().max(80).nullable().optional(),
  country: z.string().trim().regex(/^[A-Za-z]{2}$/).transform((s) => s.toUpperCase()).nullable().optional(),
  open_to_relocate: z.boolean().optional(),
  experience_years: z.number().min(0).max(60).nullable().optional(),
  expected_salary_minor: z.number().int().min(0).max(1e13).nullable().optional(),
  currency: z.string().trim().regex(/^[A-Z]{3}$/).nullable().optional(),
}).strict()

let indexed: Promise<unknown> | null = null
async function prefsCol() {
  const col = (await getMongoDb()).collection<MatchPrefsDoc>('job_match_prefs')
  if (!indexed) indexed = col.createIndex({ user_id: 1 }, { unique: true, name: 'job_match_prefs_user' }).catch(() => { indexed = null })
  await indexed
  return col
}

export async function getPrefs(userId: string): Promise<MatchPrefsDoc> {
  const d = await (await prefsCol()).findOne({ user_id: userId }, { projection: { _id: 0 } })
  if (d) return d
  // First visit: start from the talent profile (city / country) when there is one.
  const db = await getMongoDb()
  const p = await db.collection('skill_passports').findOne({ user_id: userId }, { projection: { _id: 0, 'talent.city': 1, 'talent.country': 1 } })
  return { user_id: userId, city: p?.talent?.city ?? null, country: p?.talent?.country ?? null, open_to_relocate: false, experience_years: null, expected_salary_minor: null, currency: null, updated_at: '' }
}

export async function savePrefs(userId: string, raw: unknown): Promise<MatchPrefsDoc> {
  const p = prefsSchema.safeParse(raw)
  if (!p.success) throw new MatchError(p.error.issues[0]?.message || 'Invalid input', 400, 'invalid_request')
  const set = { ...Object.fromEntries(Object.entries(p.data).filter(([, v]) => v !== undefined)), updated_at: nowIso() }
  const col = await prefsCol()
  await col.updateOne({ user_id: userId }, { $set: set, $setOnInsert: { user_id: userId } }, { upsert: true })
  return getPrefs(userId)
}

async function learnerProfile(userId: string): Promise<MatchProfile> {
  const { ownerPassport } = await import('@/lib/passport/db')
  const [pass, prefs] = await Promise.all([ownerPassport(userId), getPrefs(userId)])
  return {
    skills: [
      ...pass.summary.skills.map((s) => ({ skill: s.skill, level: toMatchLevel(s.level) })),
      ...pass.summary.selfReported.map((s) => ({ skill: s, level: 'self' as const })),
    ],
    city: prefs.city, country: prefs.country, open_to_relocate: prefs.open_to_relocate,
    experience_years: prefs.experience_years, expected_salary_minor: prefs.expected_salary_minor, currency: prefs.currency,
  }
}

const JOB_FIELDS = { _id: 0, id: 1, tenant_id: 1, title: 1, department: 1, location: 1, work_mode: 1, employment_type: 1, experience_min: 1, experience_max: 1, salary: 1, skills: 1, created_at: 1, legacy_job_id: 1 } as const

export interface JobMatchRow {
  id: string
  title: string
  company: string
  location: string | null
  work_mode: string | null
  employment_type: string | null
  salary: AtsJob['salary'] | null
  created_at: string
  match: MatchResult
  applied: boolean
}

/** Open public jobs ranked for this learner (top 50), with the reasons. */
export async function jobsForYou(userId: string, opts: { min?: number } = {}): Promise<{ jobs: JobMatchRow[]; verified_skills: number; prefs: MatchPrefsDoc }> {
  const profile = await learnerProfile(userId)
  const { atsJobs, atsApplications, atsCandidates } = await import('@/lib/ats/db')
  const jobs = (await (await atsJobs()).find({ status: 'open', is_public: true }, { projection: JOB_FIELDS }).sort({ created_at: -1 }).limit(400).toArray()) as AtsJob[]
  const db = await getMongoDb()
  const tenants = jobs.length ? await db.collection('tenants').find({ id: { $in: [...new Set(jobs.map((j) => j.tenant_id))] } }, { projection: { _id: 0, id: 1, name: 1 } }).toArray() : []
  const tname = new Map(tenants.map((t) => [String(t.id), String(t.name || '')]))
  const cands = await (await atsCandidates()).find({ user_id: userId } as never, { projection: { _id: 0, id: 1 } }).limit(100).toArray()
  const applied = new Set(cands.length
    ? (await (await atsApplications()).find({ candidate_id: { $in: cands.map((c) => c.id) } } as never, { projection: { _id: 0, job_id: 1 } }).limit(1000).toArray()).map((a) => a.job_id)
    : [])
  const rows: JobMatchRow[] = jobs.map((j) => ({
    id: j.id, title: j.title, company: tname.get(j.tenant_id) || '', location: j.location ?? null, work_mode: j.work_mode ?? null,
    employment_type: j.employment_type ?? null, salary: j.salary ?? null, created_at: j.created_at,
    match: matchScore(j, profile), applied: applied.has(j.id),
  }))
  const min = opts.min ?? 0
  const verified = profile.skills.filter((s) => s.level !== 'self').length
  return { jobs: rankMatches(rows.filter((r) => r.match.score >= min)).slice(0, 50), verified_skills: verified, prefs: await getPrefs(userId) }
}

/** Apply to an open public ATS job with one of your saved résumé versions (sent as text for screening). */
export async function applyWithVersion(user: APIUser, jobId: string, draftId: string, coverLetter?: string | null) {
  const { atsJobs } = await import('@/lib/ats/db')
  const job = (await (await atsJobs()).findOne({ id: jobId, status: 'open', is_public: true }, { projection: { _id: 0 } })) as AtsJob | null
  if (!job) throw new MatchError('This job is no longer open', 404, 'job_not_open')
  const { resumeDrafts } = await import('@/app/api/resumes/_lib/builder-data')
  const draft = await (await resumeDrafts()).findOne({ id: draftId, user_id: user.id }, { projection: { _id: 0 } })
  if (!draft) throw new MatchError('Résumé version not found', 404, 'resume_version_missing')
  const { resumeToText, sanitizeBuilderData, EMPTY_RESUME } = await import('@/lib/resume/builder')
  // Older drafts predate projects / certificates / achievements: normalise first.
  const data = sanitizeBuilderData(draft.data) ?? EMPTY_RESUME
  const text = resumeToText(data)
  if (text.length < 80) throw new MatchError('Add more to this résumé version before applying.', 400, 'resume_version_thin')
  const { applyToJob, ApplyError } = await import('@/lib/ats/apply')
  try {
    const r = await applyToJob(job, {
      user: { id: user.id, email: user.email, name: user.fullName || user.name },
      resume: { file_name: `${draft.name || 'Resume'}.txt`.slice(0, 120), text: text.slice(0, 60_000) },
      cover_letter: coverLetter ? coverLetter.slice(0, 5000) : null,
      location: data.personal.location || null,
    })
    return { application_id: r.application.id, created: r.created }
  } catch (e) {
    if (e instanceof ApplyError) throw new MatchError(e.message, e.status)
    throw e
  }
}

export interface BestMatchRow {
  handle: string
  name: string
  city: string | null
  country: string | null
  graduation_year: number | null
  availability: string | null
  match: MatchResult
}

/** Recruiter: opted-in learners whose verified skills fit this job best (top 30). */
export async function bestMatches(actor: AtsActor, job: AtsJob, req?: Request): Promise<{ results: BestMatchRow[]; considered: number }> {
  const { getTalentSettings } = await import('@/lib/talent/db')
  const settings = await getTalentSettings()
  if (!settings.enabled) throw new MatchError('Talent search is turned off on this platform.', 403, 'talent_off')
  const { rateLimitRedis } = await import('@/lib/upstash-rate-limit')
  const rl = await rateLimitRedis(`talent-matches:${actor.userId}`, settings.searches_per_hour_per_user, 3_600_000)
  if (!rl.ok) throw new MatchError('Too many searches. Try again later.', 429, 'rate_limited')
  const { canonicalSkill } = await import('@/lib/ats/skills')
  const { buildSearchFilter } = await import('@/lib/talent/core')
  const wanted = [...new Set((job.skills || []).map((s) => canonicalSkill(s)).filter(Boolean))].slice(0, 40)
  const base = buildSearchFilter({ skills: [], min_level: 'beginner', page: 1, limit: 1 }, actor.tenantId)
  const filter = wanted.length ? { $and: [base, { 'skills_index.skill': { $in: wanted } }] } : base
  const { passports } = await import('@/lib/passport/db')
  const rows = await (await passports()).find(filter as never, {
    // Summary fields only (no user id, contact or consent record) — same as talent search.
    projection: { _id: 0, handle: 1, display_name: 1, skills_index: 1, computed_at: 1, 'talent.city': 1, 'talent.country': 1, 'talent.graduation_year': 1, 'talent.availability': 1 },
  }).sort({ computed_at: -1 }).limit(500).toArray()
  const scored = rows.map((r) => {
    const t = (r as { talent?: Record<string, unknown> }).talent || {}
    const profile: MatchProfile = {
      skills: (r.skills_index || []).map((s) => ({ skill: s.skill, level: toMatchLevel(s.level) })),
      city: (t.city as string) ?? null, country: (t.country as string) ?? null,
    }
    // Location compares the job with the learner's city; years / salary are private to the learner.
    return {
      handle: String(r.handle), name: String(r.display_name || 'Learner'), city: profile.city ?? null, country: profile.country ?? null,
      graduation_year: typeof t.graduation_year === 'number' ? t.graduation_year : null, availability: (t.availability as string) ?? null,
      match: matchScore({ ...job, experience_min: null, experience_max: null, salary: null }, profile), created_at: r.computed_at,
    }
  })
  const ranked = rankMatches(scored).slice(0, 30).map(({ created_at: _c, ...rest }) => rest)
  const { auditAts } = await import('@/lib/ats/access')
  void auditAts(actor, 'talent.best_matches', 'ats_job', job.id, JSON.stringify({ skills: wanted.length, results: ranked.length }), req).catch(() => {})
  return { results: ranked, considered: rows.length }
}
