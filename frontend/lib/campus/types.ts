/**
 * Campus placement portal — shared types, input schemas and small pure rules.
 * Client-safe (no I/O). Server code lives in ./store, ./access, ./service.
 *
 * Model (MongoDB):
 *   campus_colleges      one per college; `tenant_id` = the college's organisation (tenants.kind = 'college')
 *   campus_students      a student record of one college (invited / pending / verified), linked to a user once joined
 *   campus_drives        placement drives (company, eligibility, schedule, process)
 *   campus_applications  a student's application to a drive (one per drive + student)
 *   campus_offers        offers (CTC in integer minor units, joining date)
 *   campus_usage         invite email counters per college per day
 *
 * Roles: the organisation admin (tenant_admin) of a college tenant is the
 * college admin; they add placement officers (existing accounts) to `staff`.
 * Superadmin can open any college. Students only ever see their own records.
 */
import { z } from 'zod'

export const MAX_DEPARTMENTS = 100
export const MAX_BATCHES = 400
export const MAX_STAFF = 50
export const MAX_DOMAINS = 10
export const MAX_CSV_ROWS = 5000
export const INVITE_TTL_DAYS = 30
export const INVITE_DAILY_CAP = 3000

export interface Department { id: string; name: string; code: string }
export interface Batch { id: string; name: string; department_id: string | null; graduation_year: number }
export interface StaffMember { user_id: string; email: string; name: string; added_at: string }

export interface CollegeDoc {
  tenant_id: string
  name: string
  slug: string
  city: string | null
  state: string | null
  email_domains: string[]
  departments: Department[]
  batches: Batch[]
  staff: StaffMember[]
  /** Show the college on the public league pages (name + totals only). */
  league_public: boolean
  created_by: string
  created_at: string
  updated_at: string
}

export type StudentStatus = 'invited' | 'pending' | 'verified'
export type VerifiedVia = 'domain' | 'roll_no' | 'officer'

export interface StudentDoc {
  id: string
  college_id: string
  email: string
  name: string
  roll_no: string | null
  department_id: string | null
  batch_id: string | null
  /** 0–10, two decimals; set by the placement office only. */
  cgpa: number | null
  backlogs: number
  user_id: string | null
  status: StudentStatus
  verified_via: VerifiedVia | null
  invite_token_hash: string | null
  invite_expires_at: string | null
  invited_at: string | null
  joined_at: string | null
  created_at: string
  updated_at: string
}

export const DRIVE_STATUSES = ['draft', 'open', 'closed', 'completed'] as const
export type DriveStatus = (typeof DRIVE_STATUSES)[number]
export const DRIVE_MODES = ['company_test', 'ats_job', 'external'] as const
export type DriveMode = (typeof DRIVE_MODES)[number]

export interface EligibilityRules {
  min_cgpa: number | null
  max_backlogs: number | null
  /** Empty = every department. */
  department_ids: string[]
  /** Empty = every graduation year. */
  graduation_years: number[]
}

export interface DriveDoc {
  id: string
  college_id: string
  title: string
  company: { name: string; tenant_id: string | null; website: string | null }
  role_title: string
  description: string
  ctc_minor_min: number | null
  ctc_minor_max: number | null
  currency: string
  eligibility: EligibilityRules
  schedule: { apply_by: string; test_at: string | null; interview_at: string | null }
  process: { mode: DriveMode; pattern_id: string | null; ats_job_id: string | null; external_url: string | null }
  status: DriveStatus
  notified_at: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export const APPLICATION_STATUSES = ['applied', 'shortlisted', 'in_process', 'offered', 'rejected', 'withdrawn'] as const
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number]

export interface ApplicationDoc {
  id: string
  drive_id: string
  college_id: string
  student_id: string
  user_id: string
  status: ApplicationStatus
  ats_application_id: string | null
  applied_at: string
  updated_at: string
}

export const OFFER_STATUSES = ['offered', 'accepted', 'declined', 'revoked'] as const
export type OfferStatus = (typeof OFFER_STATUSES)[number]

export interface OfferDoc {
  id: string
  college_id: string
  drive_id: string | null
  student_id: string
  user_id: string | null
  company_name: string
  role_title: string
  /** Annual CTC in integer minor units (paise for INR, cents for USD). */
  ctc_minor: number
  currency: string
  /** YYYY-MM-DD or null. */
  joining_date: string | null
  status: OfferStatus
  /** Placement year = the student's graduation year. */
  year: number
  created_by: string
  created_at: string
  updated_at: string
}

// ─── Pure helpers ────────────────────────────────────────────────────────────

/** Free webmail domains can never be a college domain (anyone could sign up). */
export const PUBLIC_MAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.in', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
  'icloud.com', 'me.com', 'aol.com', 'proton.me', 'protonmail.com', 'rediffmail.com', 'zoho.com', 'yandex.com', 'gmx.com', 'mail.com',
])

const DOMAIN_RE = /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/

/** Normalise and validate a list of college email domains. Returns the clean list or an error. */
export function cleanDomains(raw: unknown): { ok: true; domains: string[] } | { ok: false; error: string } {
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/[\s,]+/) : []
  const out: string[] = []
  for (const r of list) {
    const d = String(r ?? '').trim().toLowerCase().replace(/^@/, '')
    if (!d) continue
    if (!DOMAIN_RE.test(d)) return { ok: false, error: `“${d.slice(0, 60)}” is not a valid domain` }
    if (PUBLIC_MAIL_DOMAINS.has(d)) return { ok: false, error: `${d} is a public email provider — use your college's own domain` }
    if (!out.includes(d)) out.push(d)
  }
  if (out.length > MAX_DOMAINS) return { ok: false, error: `Up to ${MAX_DOMAINS} domains` }
  return { ok: true, domains: out }
}

export function emailDomain(email: string): string {
  const at = email.lastIndexOf('@')
  return at >= 0 ? email.slice(at + 1).trim().toLowerCase() : ''
}

/** True when the email is on one of the college's domains (sub-domains count: cse.college.edu). */
export function onCollegeDomain(email: string, domains: readonly string[]): boolean {
  const d = emailDomain(email)
  if (!d) return false
  return domains.some((x) => d === x || d.endsWith(`.${x}`))
}

export function normRollNo(v: unknown): string {
  return String(v ?? '').trim().toUpperCase().replace(/\s+/g, '')
}

export function slugify(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 60)
}

/** CTC in minor units → display ("₹12.5 L" style is locale work for the UI; this is plain). */
export function formatMinor(minor: number | null | undefined, currency = 'INR'): string {
  if (minor === null || minor === undefined || !Number.isFinite(minor)) return '—'
  const major = minor / 100
  try {
    return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(major)
  } catch {
    return `${currency} ${Math.round(major)}`
  }
}

// ─── Input schemas (server validates every write with these) ────────────────

const isoDate = z.string().trim().refine((s) => Number.isFinite(Date.parse(s)), 'Enter a valid date')
const ymd = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
const year = z.number().int().min(2000).max(2100)
const minor = z.number().int().min(0).max(1e13)

export const collegeInputSchema = z.object({
  name: z.string().trim().min(2).max(160),
  city: z.string().trim().max(80).nullish(),
  state: z.string().trim().max(80).nullish(),
  email_domains: z.union([z.array(z.string()), z.string()]).optional(),
  league_public: z.boolean().optional(),
  /** Superadmin only: onboard this organisation as a college. */
  tenant_id: z.string().trim().min(1).max(80).optional(),
}).strict()

export const departmentsInputSchema = z.array(z.object({
  id: z.string().trim().max(40).optional(),
  name: z.string().trim().min(1).max(120),
  code: z.string().trim().min(1).max(20),
})).max(MAX_DEPARTMENTS)

export const batchesInputSchema = z.array(z.object({
  id: z.string().trim().max(40).optional(),
  name: z.string().trim().min(1).max(120),
  department_id: z.string().trim().max(40).nullish(),
  graduation_year: year,
})).max(MAX_BATCHES)

export const eligibilitySchema = z.object({
  min_cgpa: z.number().min(0).max(10).nullish(),
  max_backlogs: z.number().int().min(0).max(100).nullish(),
  department_ids: z.array(z.string().max(40)).max(MAX_DEPARTMENTS).default([]),
  graduation_years: z.array(year).max(10).default([]),
}).strict()

export const driveInputSchema = z.object({
  title: z.string().trim().min(3).max(160),
  company: z.object({
    name: z.string().trim().min(1).max(160),
    tenant_id: z.string().trim().max(80).nullish(),
    website: z.string().trim().url().max(300).nullish(),
  }).strict(),
  role_title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(8000).default(''),
  ctc_minor_min: minor.nullish(),
  ctc_minor_max: minor.nullish(),
  currency: z.string().trim().regex(/^[A-Z]{3}$/).default('INR'),
  eligibility: eligibilitySchema,
  schedule: z.object({ apply_by: isoDate, test_at: isoDate.nullish(), interview_at: isoDate.nullish() }).strict(),
  process: z.object({
    mode: z.enum(DRIVE_MODES),
    pattern_id: z.string().trim().max(120).nullish(),
    ats_job_id: z.string().trim().max(80).nullish(),
    external_url: z.string().trim().url().max(500).nullish(),
  }).strict(),
}).strict()
  .refine((d) => d.ctc_minor_min == null || d.ctc_minor_max == null || d.ctc_minor_min <= d.ctc_minor_max, { message: 'Minimum CTC is above the maximum', path: ['ctc_minor_max'] })
  .refine((d) => d.process.mode !== 'company_test' || !!d.process.pattern_id, { message: 'Pick the company test', path: ['process', 'pattern_id'] })
  .refine((d) => d.process.mode !== 'ats_job' || !!d.process.ats_job_id, { message: 'Enter the job id', path: ['process', 'ats_job_id'] })
  .refine((d) => d.process.mode !== 'external' || !!d.process.external_url, { message: 'Enter the application link', path: ['process', 'external_url'] })

export const offerInputSchema = z.object({
  student_id: z.string().trim().min(1).max(80),
  drive_id: z.string().trim().max(80).nullish(),
  company_name: z.string().trim().min(1).max(160),
  role_title: z.string().trim().min(1).max(160),
  ctc_minor: minor,
  currency: z.string().trim().regex(/^[A-Z]{3}$/).default('INR'),
  joining_date: ymd.nullish(),
  status: z.enum(OFFER_STATUSES).default('offered'),
}).strict()

export const studentPatchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  roll_no: z.string().trim().max(40).nullish(),
  department_id: z.string().trim().max(40).nullish(),
  batch_id: z.string().trim().max(40).nullish(),
  cgpa: z.number().min(0).max(10).nullish(),
  backlogs: z.number().int().min(0).max(100).optional(),
  verify: z.boolean().optional(),
}).strict()

/** Zod error → one sentence for the UI. */
export function firstIssue(e: z.ZodError): string {
  const i = e.issues[0]
  if (!i) return 'Check the form and try again'
  const path = i.path.filter((p) => typeof p === 'string').join('.')
  return path ? `${path.replace(/_/g, ' ')}: ${i.message}` : i.message
}
