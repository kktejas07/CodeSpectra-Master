/**
 * Intake: every way a candidate gets into a job — public apply page, bulk
 * résumé upload, manual / CSV add, talent pool. Candidates are deduped per
 * tenant (email, then phone); one application per (job, candidate).
 */
import { getMongoDb } from '@/lib/mongodb'
import { safeHttpUrl } from '@/lib/safe-html'
import type { AtsApplication, AtsCandidate, AtsJob, CandidateSource, ParsedResume } from './contract'
import { atsApplications, atsCandidates, isDuplicateKey, newId, nowIso } from './db'
import { startApplication } from './engine'
import { parseResumeText } from './parse'
import { countryFromE164, toE164 } from './phone'
import { scoreCandidate, toMatch } from './screening-score'

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
export const MAX_CSV_ROWS = 1000

export function normEmail(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim().toLowerCase().slice(0, 254) : ''
  return s && EMAIL_RE.test(s) ? s : null
}
export function normCountry(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim().toUpperCase() : ''
  return /^[A-Z]{2}$/.test(s) ? s : null
}
const cleanName = (v: unknown) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120) : '')

export interface CandidateInput {
  name?: string
  email?: string | null
  phone?: string | null
  country?: string | null
  location?: string | null
  user_id?: string | null
  resume?: { file_name: string; text: string; storage_url?: string | null } | null
  parsed?: ParsedResume | null
  source: CandidateSource
  consent?: { whatsapp?: boolean; calls?: boolean } | null
  tags?: string[]
  /**
   * false for guest applies: the email/phone is unproven, so an existing
   * record's résumé is never replaced and consent can only be withdrawn.
   * Default true (recruiter intake, signed-in applicants).
   */
  verified?: boolean
}

/**
 * Find-or-create the tenant's candidate (email first, then phone). An existing
 * record is enriched (new résumé, missing contact fields, latest consent) —
 * never overwritten with blanks.
 */
export async function upsertCandidate(tenantId: string, input: CandidateInput): Promise<{ candidate: AtsCandidate; created: boolean }> {
  const col = await atsCandidates()
  const email = normEmail(input.email ?? input.parsed?.email)
  const country = normCountry(input.country) ?? null
  const phone = toE164(input.phone ?? input.parsed?.phone ?? '', country) ?? null
  const ts = nowIso()
  const trusted = input.verified !== false
  // Unverified (guest) input never matches a record by phone alone: a typed-in
  // number must not attach an application to someone else's candidate.
  const find = async () =>
    ((email ? await col.findOne({ tenant_id: tenantId, email }, { projection: { _id: 0 } }) : null) ||
      (phone && (trusted || !email) ? await col.findOne({ tenant_id: tenantId, phone }, { projection: { _id: 0 } }) : null)) as AtsCandidate | null

  const resume = input.resume
    ? { file_name: input.resume.file_name, storage_url: input.resume.storage_url ?? null, text: input.resume.text, uploaded_at: ts }
    : null
  const consent = input.consent && (input.consent.whatsapp !== undefined || input.consent.calls !== undefined)
    ? { whatsapp: !!input.consent.whatsapp, calls: !!input.consent.calls, at: ts }
    : undefined

  const existing = await find()
  if (existing) {
    const set: Record<string, unknown> = { updated_at: ts }
    if (resume && (trusted || !existing.resume)) { set.resume = resume; if (input.parsed) set.parsed = input.parsed }
    else if (input.parsed && !existing.parsed) set.parsed = input.parsed
    if (trusted) {
      if (!existing.email && email) set.email = email
      if (!existing.phone && phone) set.phone = phone
      if (!existing.country && (country || countryFromE164(phone))) set.country = country || countryFromE164(phone)
      if (!existing.user_id && input.user_id) set.user_id = input.user_id
      if ((!existing.name || existing.name === existing.email) && cleanName(input.name)) set.name = cleanName(input.name)
    } else {
      // Unproven contact details are kept aside for a recruiter to confirm, never written onto the record
      // (the bot screen calls/messages `phone`).
      const differs = (email && email !== existing.email) || (phone && phone !== existing.phone)
      if (differs) set.unverified_contact = { email: email && email !== existing.email ? email : null, phone: phone && phone !== existing.phone ? phone : null, at: ts }
    }
    if (consent && trusted) set.consent = consent
    else if (consent && existing.consent) {
      // Unverified: may only turn consent off.
      set.consent = { whatsapp: !!existing.consent.whatsapp && consent.whatsapp, calls: !!existing.consent.calls && consent.calls, at: ts }
    }
    const tags = [...new Set([...(existing.tags || []), ...(input.tags || [])])].slice(0, 30)
    if (tags.length !== (existing.tags || []).length) set.tags = tags
    await col.updateOne({ id: existing.id, tenant_id: tenantId }, { $set: set })
    return { candidate: { ...existing, ...set } as AtsCandidate, created: false }
  }

  const name = cleanName(input.name) || cleanName(input.parsed?.name) || (email ? email.split('@')[0] : '') || 'Unnamed candidate'
  const doc: AtsCandidate = {
    id: newId(),
    tenant_id: tenantId,
    name,
    email,
    phone,
    country: country || countryFromE164(phone),
    user_id: input.user_id ?? null,
    resume,
    parsed: input.parsed ?? null,
    tags: (input.tags || []).slice(0, 30),
    source: input.source,
    ...(consent ? { consent } : {}),
    created_at: ts,
    updated_at: ts,
  }
  try {
    await col.insertOne(doc)
    return { candidate: doc, created: true }
  } catch (e) {
    if (!isDuplicateKey(e)) throw e
    const again = await find()
    if (!again) throw e
    return { candidate: again, created: false }
  }
}

/** Match score at intake (no AI) so every application has one for sorting. */
export function intakeMatch(job: AtsJob, c: AtsCandidate, location?: string | null): AtsApplication['match'] {
  if (!c.resume?.text && !c.parsed) return null
  return toMatch(scoreCandidate({ ...job.criteria, use_ai_match: false }, { text: c.resume?.text || '', parsed: c.parsed, location }, job))
}

/** Create the application (or return the existing one) and run the first stage's entry effects. */
export async function createApplication(
  job: AtsJob,
  candidate: AtsCandidate,
  source: CandidateSource,
  opts: { location?: string | null } = {},
): Promise<{ application: AtsApplication; created: boolean }> {
  const col = await atsApplications()
  const existing = (await col.findOne({ tenant_id: job.tenant_id, job_id: job.id, candidate_id: candidate.id }, { projection: { _id: 0 } })) as AtsApplication | null
  if (existing) return { application: existing, created: false }
  const first = job.pipeline[0]
  if (!first) throw new Error('Job has no pipeline')
  const ts = nowIso()
  const app: AtsApplication = {
    id: newId(),
    tenant_id: job.tenant_id,
    job_id: job.id,
    candidate_id: candidate.id,
    client_id: job.client_id ?? null,
    stage_id: first.id,
    stage_entered_at: ts,
    status: 'active',
    match: intakeMatch(job, candidate, opts.location),
    results: [],
    history: [{ from: null, to: first.id, at: ts, by: 'system', auto: true, reason: `Added via ${source.replace('_', ' ')}` }],
    pending_move: null,
    source,
    rejection_reason: null,
    created_at: ts,
    updated_at: ts,
  }
  try {
    await col.insertOne(app)
  } catch (e) {
    if (!isDuplicateKey(e)) throw e
    const again = (await col.findOne({ job_id: job.id, candidate_id: candidate.id }, { projection: { _id: 0 } })) as AtsApplication | null
    if (again) return { application: again, created: false }
    throw e
  }
  try {
    await startApplication(app, job)
  } catch (e) {
    console.error('[ats/intake] stage entry failed:', app.id, e)
  }
  const fresh = (await col.findOne({ id: app.id, tenant_id: job.tenant_id }, { projection: { _id: 0 } })) as AtsApplication | null
  return { application: fresh ?? app, created: true }
}

/** Values the candidate stated on the apply form; they beat what the parser read. */
export type ParsedOverrides = Partial<Pick<ParsedResume, 'notice_days' | 'expected_salary' | 'current_salary' | 'location'>>

export function applyOverrides(parsed: ParsedResume | null, o?: ParsedOverrides): ParsedResume | null {
  if (!o) return parsed
  const clean = Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== '')) as ParsedOverrides
  if (!Object.keys(clean).length) return parsed
  return { ...(parsed ?? { skills: [], titles: [], companies: [], education: [], parser: 'heuristic' as const }), ...clean }
}

/** One résumé text → parsed candidate → application. */
export async function intakeResume(
  job: AtsJob,
  r: { file_name: string; text: string; storage_url?: string | null },
  extra: Omit<CandidateInput, 'resume' | 'parsed'> & { ai?: boolean; overrides?: ParsedOverrides },
): Promise<{ candidate: AtsCandidate; application: AtsApplication; created: boolean; candidateCreated: boolean; flags: string[] }> {
  const res = await parseResumeText(r.text, { ai: extra.ai !== false, country: extra.country, tenantId: job.tenant_id })
  const flags = res.flags
  const parsed = applyOverrides(res.parsed, extra.overrides)
  const { ai: _ai, overrides: _o, ...rest } = extra
  const { candidate, created: candidateCreated } = await upsertCandidate(job.tenant_id, { ...rest, resume: r, parsed })
  const { application, created } = await createApplication(job, candidate, extra.source, { location: extra.location })
  return { candidate, application, created, candidateCreated, flags }
}

// ─── CSV ────────────────────────────────────────────────────────────────────

/** RFC-4180-ish CSV → rows of cells. Pure. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let q = false
  const s = String(text || '').replace(/^﻿/, '')
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (q) {
      if (ch === '"' && s[i + 1] === '"') { cell += '"'; i++ }
      else if (ch === '"') q = false
      else cell += ch
    } else if (ch === '"') q = true
    else if (ch === ',') { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++
      row.push(cell); cell = ''
      if (row.some((c) => c.trim())) rows.push(row)
      row = []
    } else cell += ch
  }
  row.push(cell)
  if (row.some((c) => c.trim())) rows.push(row)
  return rows
}

export interface CsvCandidateRow {
  line: number
  name: string
  email: string | null
  phone: string | null
  country: string | null
  resume_url: string | null
  error?: string
}

/** Header-aware CSV of name,email,phone,country[,resume_url]. Pure. */
export function parseCandidateCsv(text: string): CsvCandidateRow[] {
  const rows = parseCsv(text)
  if (!rows.length) return []
  const head = rows[0].map((h) => h.trim().toLowerCase().replace(/[^a-z_]/g, ''))
  const hasHeader = head.includes('email') || head.includes('name') || head.includes('phone')
  const idx = (names: string[], fallback: number) => {
    if (!hasHeader) return fallback
    const i = head.findIndex((h) => names.includes(h))
    return i
  }
  const iName = idx(['name', 'fullname', 'full_name', 'candidate'], 0)
  const iEmail = idx(['email', 'emailaddress', 'email_address', 'mail'], 1)
  const iPhone = idx(['phone', 'mobile', 'phonenumber', 'phone_number', 'whatsapp'], 2)
  const iCountry = idx(['country', 'country_code', 'countrycode'], 3)
  const iUrl = idx(['resume_url', 'resumeurl', 'resume', 'cv', 'cv_url'], 4)
  const out: CsvCandidateRow[] = []
  rows.slice(hasHeader ? 1 : 0, (hasHeader ? 1 : 0) + MAX_CSV_ROWS).forEach((r, k) => {
    const cell = (i: number) => (i >= 0 ? (r[i] ?? '').trim() : '')
    const country = normCountry(cell(iCountry))
    const rawEmail = cell(iEmail)
    const email = normEmail(rawEmail)
    const phone = toE164(cell(iPhone), country)
    const row: CsvCandidateRow = {
      line: k + (hasHeader ? 2 : 1),
      name: cleanName(cell(iName)),
      email,
      phone,
      country,
      resume_url: safeHttpUrl(cell(iUrl)),
    }
    if (rawEmail && !email) row.error = 'Invalid email'
    else if (!email && !phone) row.error = 'Needs an email or phone number'
    else if (cell(iPhone) && !phone) row.error = 'Invalid phone number'
    out.push(row)
  })
  return out
}

// ─── Talent pool ────────────────────────────────────────────────────────────

export interface PoolEntry {
  id: string // candidate id, or `user:<id>` for a past applicant on the legacy job board
  name: string
  kind: 'candidate' | 'past_applicant'
  score: number
  reasons: string[]
  missing_must: string[]
  skills: string[]
  total_years: number | null
  location: string | null
}

/** Past applicants to this tenant's legacy job-board postings: user id → résumé text. */
async function legacyApplicants(tenantId: string, limit = 500): Promise<Map<string, { name: string; email: string | null; text: string }>> {
  const db = await getMongoDb()
  const postings = await db.collection('job_postings').find({ tenant_id: tenantId }, { projection: { _id: 0, id: 1 } }).limit(1000).toArray()
  const out = new Map<string, { name: string; email: string | null; text: string }>()
  if (!postings.length) return out
  const apps = await db.collection('job_applications')
    .find({ job_id: { $in: postings.map((p) => String(p.id)) } }, { projection: { _id: 0, user_id: 1, resume_id: 1 } })
    .limit(limit)
    .toArray()
  const userIds = [...new Set(apps.map((a) => String(a.user_id)))]
  if (!userIds.length) return out
  const [users, resumes] = await Promise.all([
    db.collection('user').find({ $or: [{ id: { $in: userIds } }, { _id: { $in: userIds } }] } as never, { projection: { id: 1, _id: 1, name: 1, fullName: 1, email: 1 } }).toArray(),
    db.collection('resumes').find({ user_id: { $in: userIds } }, { projection: { _id: 0, user_id: 1, text_content: 1, is_primary: 1, uploaded_at: 1 } }).toArray(),
  ])
  for (const u of users) {
    const uid = String(u.id || u._id)
    const mine = resumes.filter((r) => String(r.user_id) === uid).sort((a, b) => Number(!!b.is_primary) - Number(!!a.is_primary) || String(b.uploaded_at).localeCompare(String(a.uploaded_at)))
    out.set(uid, { name: String(u.fullName || u.name || u.email || 'Applicant'), email: normEmail(u.email), text: String(mine[0]?.text_content || '') })
  }
  return out
}

/**
 * Suggested matches for a job from this tenant's own candidates and its past
 * job-board applicants — never another tenant's people. Already-applied are left out.
 */
export async function talentPool(job: AtsJob, opts: { limit?: number; q?: string } = {}): Promise<PoolEntry[]> {
  const limit = Math.max(1, Math.min(100, opts.limit ?? 30))
  const [cands, applied] = await Promise.all([
    (await atsCandidates()).find({ tenant_id: job.tenant_id }, { projection: { _id: 0 } }).sort({ updated_at: -1 }).limit(3000).toArray() as Promise<AtsCandidate[]>,
    (await atsApplications()).find({ tenant_id: job.tenant_id, job_id: job.id }, { projection: { _id: 0, candidate_id: 1 } }).limit(50_000).toArray(),
  ])
  const inJob = new Set(applied.map((a) => String(a.candidate_id)))
  const criteria = { ...job.criteria, use_ai_match: false }
  const q = (opts.q || '').trim().toLowerCase()
  const entries: PoolEntry[] = []
  const knownEmails = new Set<string>()
  for (const c of cands) {
    if (c.email) knownEmails.add(c.email)
    if (inJob.has(c.id)) continue
    const text = c.resume?.text || ''
    if (q && !`${c.name} ${c.email || ''} ${text}`.toLowerCase().includes(q)) continue
    const s = scoreCandidate(criteria, { text, parsed: c.parsed }, job)
    entries.push({
      id: c.id, name: c.name, kind: 'candidate', score: s.score, reasons: s.reasons.slice(0, 4), missing_must: s.missing_must,
      skills: (c.parsed?.skills || []).slice(0, 12), total_years: c.parsed?.total_years ?? null, location: c.parsed?.location ?? null,
    })
  }
  try {
    for (const [uid, u] of await legacyApplicants(job.tenant_id)) {
      if (u.email && knownEmails.has(u.email)) continue // already an ATS candidate
      if (q && !`${u.name} ${u.email || ''} ${u.text}`.toLowerCase().includes(q)) continue
      const s = scoreCandidate(criteria, { text: u.text, parsed: null }, job)
      entries.push({ id: `user:${uid}`, name: u.name, kind: 'past_applicant', score: s.score, reasons: s.reasons.slice(0, 4), missing_must: s.missing_must, skills: [], total_years: null, location: null })
    }
  } catch (e) {
    console.error('[ats/intake] legacy applicants lookup failed:', e)
  }
  return entries.sort((a, b) => b.score - a.score).slice(0, limit)
}

/** Add pool entries to a job. Ids are re-checked against this tenant. */
export async function addFromPool(job: AtsJob, ids: string[]): Promise<{ id: string; ok: boolean; application_id?: string; duplicate?: boolean; error?: string }[]> {
  const out: { id: string; ok: boolean; application_id?: string; duplicate?: boolean; error?: string }[] = []
  const legacy = ids.some((i) => i.startsWith('user:')) ? await legacyApplicants(job.tenant_id, 5000) : new Map()
  const col = await atsCandidates()
  for (const id of ids.slice(0, 200)) {
    try {
      let cand: AtsCandidate | null = null
      if (id.startsWith('user:')) {
        const uid = id.slice(5)
        const u = legacy.get(uid)
        if (!u) { out.push({ id, ok: false, error: 'Not one of your applicants' }); continue }
        cand = (await upsertCandidate(job.tenant_id, {
          name: u.name, email: u.email, user_id: uid, source: 'talent_pool',
          ...(u.text ? { resume: { file_name: 'Job board résumé', text: u.text.slice(0, 60_000) }, parsed: (await parseResumeText(u.text, { ai: false })).parsed } : {}),
        })).candidate
      } else {
        cand = (await col.findOne({ id, tenant_id: job.tenant_id }, { projection: { _id: 0 } })) as AtsCandidate | null
        if (!cand) { out.push({ id, ok: false, error: 'Candidate not found' }); continue }
      }
      const r = await createApplication(job, cand, 'talent_pool')
      out.push({ id, ok: true, application_id: r.application.id, duplicate: !r.created })
    } catch (e) {
      console.error('[ats/intake] pool add failed:', id, e)
      out.push({ id, ok: false, error: 'Could not add' })
    }
  }
  return out
}

/** Manual add (recruiter form) or one CSV row. */
export async function addManualCandidate(
  job: AtsJob,
  input: { name?: string; email?: string | null; phone?: string | null; country?: string | null; resume_text?: string | null; resume_url?: string | null; source: 'manual' | 'csv' | 'referral'; tags?: string[] },
): Promise<{ candidate: AtsCandidate; application: AtsApplication; created: boolean }> {
  const text = typeof input.resume_text === 'string' ? input.resume_text.slice(0, 60_000) : ''
  const parsed = text.trim().length >= 30 ? (await parseResumeText(text, { ai: true, country: input.country })).parsed : null
  const url = safeHttpUrl(input.resume_url ?? '')
  const resume = text.trim() || url ? { file_name: url ? url.split('/').pop()?.slice(0, 120) || 'Résumé link' : 'Pasted résumé', text, storage_url: url } : null
  const { candidate } = await upsertCandidate(job.tenant_id, {
    name: input.name, email: input.email, phone: input.phone, country: input.country, source: input.source,
    resume, parsed, tags: input.tags,
  })
  const r = await createApplication(job, candidate, input.source)
  return { candidate, application: r.application, created: r.created }
}

/** Recruiter-facing candidate summary for board cards. */
export function candidateSummary(c: AtsCandidate | null | undefined) {
  if (!c) return null
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    country: c.country ?? null,
    total_years: c.parsed?.total_years ?? null,
    location: c.parsed?.location ?? null,
    skills: (c.parsed?.skills || []).slice(0, 8),
    titles: (c.parsed?.titles || []).slice(0, 2),
    tags: c.tags || [],
    source: c.source,
  }
}

