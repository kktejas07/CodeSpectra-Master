/**
 * Placement drives, applications, offers, placement stats and batch
 * readiness (server only). Officers act inside their own college (StaffContext);
 * students only ever read and write their own records.
 */
import 'server-only'
import { newId, nowIso } from '@/lib/db/ids'
import { logger } from '@/lib/logger'
import { CampusError, type StaffContext } from './access'
import { computeReadiness } from './readiness'
import { checkEligibility, driveAcceptsApplications } from './rules'
import { loadSignals, MAX_USERS } from './signals'
import { placementStats } from './stats'
import { applicationsCol, clean, collegesCol, drivesCol, isDuplicateKey, offersCol, studentsCol } from './store'
import {
  APPLICATION_STATUSES, DRIVE_STATUSES, driveInputSchema, firstIssue, offerInputSchema, OFFER_STATUSES,
  type ApplicationDoc, type ApplicationStatus, type CollegeDoc, type DriveDoc, type DriveStatus, type OfferDoc, type OfferStatus, type StudentDoc,
} from './types'

type Actor = { id: string; email: string; name?: string }

function gradYear(college: Pick<CollegeDoc, 'batches'>, batchId: string | null): number | null {
  return college.batches.find((b) => b.id === batchId)?.graduation_year ?? null
}

// ─── Drives ─────────────────────────────────────────────────────────────────

async function validateProcess(ctx: StaffContext, p: DriveDoc['process']): Promise<void> {
  if (p.mode === 'company_test' && p.pattern_id) {
    const { getPattern } = await import('@/lib/company-tests/db')
    const pat = await getPattern(p.pattern_id)
    if (!pat || !pat.active) throw new CampusError('That company test is not available')
  }
  if (p.mode === 'ats_job' && p.ats_job_id) {
    const { atsJobs } = await import('@/lib/ats/db')
    const job = await (await atsJobs()).findOne({ id: p.ats_job_id }, { projection: { _id: 0, id: 1, status: 1, is_public: 1 } })
    if (!job || !job.is_public) throw new CampusError('That job is not open for public applications — ask the company for a public job id')
  }
  void ctx
}

export async function listDrives(ctx: StaffContext, status?: string | null): Promise<Array<DriveDoc & { applicants: number }>> {
  const filter: Record<string, unknown> = { college_id: ctx.college.tenant_id }
  if (status && (DRIVE_STATUSES as readonly string[]).includes(status)) filter.status = status
  const rows = await (await drivesCol()).find(filter, { projection: { _id: 0 } }).sort({ 'schedule.apply_by': -1 }).limit(200).toArray()
  const counts = rows.length
    ? await (await applicationsCol()).aggregate<{ _id: string; n: number }>([{ $match: { drive_id: { $in: rows.map((d) => d.id) }, status: { $ne: 'withdrawn' } } }, { $group: { _id: '$drive_id', n: { $sum: 1 } } }]).toArray()
    : []
  const by = new Map(counts.map((c) => [c._id, c.n]))
  return rows.map((d) => ({ ...d, applicants: by.get(d.id) ?? 0 }))
}

export async function createDrive(ctx: StaffContext, raw: unknown): Promise<DriveDoc> {
  const parsed = driveInputSchema.safeParse(raw)
  if (!parsed.success) throw new CampusError(firstIssue(parsed.error))
  const input = parsed.data
  const depts = new Set(ctx.college.departments.map((d) => d.id))
  if (input.eligibility.department_ids.some((d) => !depts.has(d))) throw new CampusError('Eligibility lists a department that does not exist')
  const process = { mode: input.process.mode, pattern_id: input.process.pattern_id ?? null, ats_job_id: input.process.ats_job_id ?? null, external_url: input.process.external_url ?? null }
  await validateProcess(ctx, process)
  const now = nowIso()
  const doc: DriveDoc = {
    id: newId(), college_id: ctx.college.tenant_id, title: input.title,
    company: { name: input.company.name, tenant_id: input.company.tenant_id ?? null, website: input.company.website ?? null },
    role_title: input.role_title, description: input.description, ctc_minor_min: input.ctc_minor_min ?? null, ctc_minor_max: input.ctc_minor_max ?? null,
    currency: input.currency,
    eligibility: { min_cgpa: input.eligibility.min_cgpa ?? null, max_backlogs: input.eligibility.max_backlogs ?? null, department_ids: input.eligibility.department_ids, graduation_years: input.eligibility.graduation_years },
    schedule: { apply_by: new Date(input.schedule.apply_by).toISOString(), test_at: input.schedule.test_at ? new Date(input.schedule.test_at).toISOString() : null, interview_at: input.schedule.interview_at ? new Date(input.schedule.interview_at).toISOString() : null },
    process, status: 'draft', notified_at: null, created_by: ctx.user.id, created_at: now, updated_at: now,
  }
  await (await drivesCol()).insertOne(doc)
  return clean(doc)!
}

export async function getDrive(ctx: StaffContext, id: string): Promise<DriveDoc> {
  const d = await (await drivesCol()).findOne({ id, college_id: ctx.college.tenant_id }, { projection: { _id: 0 } })
  if (!d) throw new CampusError('Drive not found', 404)
  return d
}

/** Edit a drive (full input) and/or change its status. Opening a drive notifies eligible students once. */
export async function updateDrive(ctx: StaffContext, id: string, raw: Record<string, unknown>): Promise<DriveDoc> {
  const cur = await getDrive(ctx, id)
  const col = await drivesCol()
  const set: Partial<DriveDoc> = { updated_at: nowIso() }
  if (raw.drive) {
    const parsed = driveInputSchema.safeParse(raw.drive)
    if (!parsed.success) throw new CampusError(firstIssue(parsed.error))
    const i = parsed.data
    const process = { mode: i.process.mode, pattern_id: i.process.pattern_id ?? null, ats_job_id: i.process.ats_job_id ?? null, external_url: i.process.external_url ?? null }
    await validateProcess(ctx, process)
    Object.assign(set, {
      title: i.title, company: { name: i.company.name, tenant_id: i.company.tenant_id ?? null, website: i.company.website ?? null },
      role_title: i.role_title, description: i.description, ctc_minor_min: i.ctc_minor_min ?? null, ctc_minor_max: i.ctc_minor_max ?? null, currency: i.currency,
      eligibility: { min_cgpa: i.eligibility.min_cgpa ?? null, max_backlogs: i.eligibility.max_backlogs ?? null, department_ids: i.eligibility.department_ids, graduation_years: i.eligibility.graduation_years },
      schedule: { apply_by: new Date(i.schedule.apply_by).toISOString(), test_at: i.schedule.test_at ? new Date(i.schedule.test_at).toISOString() : null, interview_at: i.schedule.interview_at ? new Date(i.schedule.interview_at).toISOString() : null },
      process,
    })
  }
  if (raw.status !== undefined) {
    if (!(DRIVE_STATUSES as readonly string[]).includes(String(raw.status))) throw new CampusError('Unknown status')
    set.status = raw.status as DriveStatus
  }
  await col.updateOne({ id, college_id: ctx.college.tenant_id }, { $set: set })
  const next = (await col.findOne({ id }, { projection: { _id: 0 } }))!
  if (next.status === 'open' && cur.status !== 'open') void notifyDriveOpen(next, ctx.college).catch((e) => logger.error('[campus] drive notify failed', (e as Error).message))
  return next
}

/** In-app + email + WhatsApp (consent checked downstream) to eligible, verified students. Runs once per drive. */
async function notifyDriveOpen(drive: DriveDoc, college: CollegeDoc): Promise<void> {
  const claim = await (await drivesCol()).updateOne({ id: drive.id, notified_at: null }, { $set: { notified_at: nowIso() } })
  if (!claim.modifiedCount) return
  const students = await (await studentsCol()).find({ college_id: college.tenant_id, status: 'verified', user_id: { $type: 'string' } }, { projection: { _id: 0, user_id: 1, department_id: 1, batch_id: 1, cgpa: 1, backlogs: 1, status: 1 } }).limit(20_000).toArray()
  const eligible = students.filter((s) => checkEligibility({ ...s, graduation_year: gradYear(college, s.batch_id) }, drive.eligibility).eligible).map((s) => s.user_id as string)
  if (!eligible.length) return
  const { notifyMany } = await import('@/lib/notifications')
  await notifyMany(eligible, {
    type: 'campus.drive_open',
    title: `New placement drive: ${drive.company.name}`,
    message: `${drive.role_title} — apply by ${new Date(drive.schedule.apply_by).toUTCString().slice(0, 16)}.`,
    link: '/dashboard/campus',
    icon: 'briefcase',
    metadata: { drive_id: drive.id },
    send_email: true,
    send_whatsapp: true,
  })
}

// ─── Applications (officer) ─────────────────────────────────────────────────

export interface ApplicantRow {
  application_id: string
  student_id: string
  name: string
  email: string
  roll_no: string | null
  department_id: string | null
  batch_id: string | null
  cgpa: number | null
  status: ApplicationStatus
  applied_at: string
  /** Best completed company-test attempt on the drive's pattern since applying. */
  test: { percent: number; passed: boolean; at: string } | null
}

export async function driveApplicants(ctx: StaffContext, drive: DriveDoc): Promise<ApplicantRow[]> {
  const apps = await (await applicationsCol()).find({ drive_id: drive.id, college_id: ctx.college.tenant_id }, { projection: { _id: 0 } }).sort({ applied_at: 1 }).limit(5000).toArray()
  if (!apps.length) return []
  const students = await (await studentsCol()).find({ id: { $in: apps.map((a) => a.student_id) } }, { projection: { _id: 0, invite_token_hash: 0 } }).toArray()
  const sById = new Map(students.map((s) => [s.id, s]))
  const tests = new Map<string, ApplicantRow['test']>()
  if (drive.process.mode === 'company_test' && drive.process.pattern_id) {
    const { getMongoDb } = await import('@/lib/mongodb')
    const db = await getMongoDb()
    const since = apps.reduce((m, a) => (a.applied_at < m ? a.applied_at : m), apps[0].applied_at)
    const rows = await db.collection('company_test_attempts')
      .find({ userId: { $in: apps.map((a) => a.user_id) }, patternId: drive.process.pattern_id, status: 'completed', completedAt: { $gte: since } }, { projection: { _id: 0, userId: 1, completedAt: 1, 'result.percent': 1, 'result.passed': 1 } })
      .limit(20_000).toArray()
    const appliedAt = new Map(apps.map((a) => [a.user_id, a.applied_at]))
    for (const r of rows) {
      const uid = String(r.userId)
      if (String(r.completedAt) < (appliedAt.get(uid) ?? '')) continue
      const pct = Number(r.result?.percent) || 0
      const prev = tests.get(uid)
      if (!prev || pct > prev.percent) tests.set(uid, { percent: pct, passed: r.result?.passed === true, at: String(r.completedAt) })
    }
  }
  return apps.map((a) => {
    const s = sById.get(a.student_id)
    return {
      application_id: a.id, student_id: a.student_id, name: s?.name ?? 'Student', email: s?.email ?? '', roll_no: s?.roll_no ?? null,
      department_id: s?.department_id ?? null, batch_id: s?.batch_id ?? null, cgpa: s?.cgpa ?? null,
      status: a.status, applied_at: a.applied_at, test: tests.get(a.user_id) ?? null,
    }
  })
}

export async function setApplicationStatus(ctx: StaffContext, appId: string, statusRaw: unknown): Promise<ApplicationDoc> {
  const status = String(statusRaw ?? '') as ApplicationStatus
  if (!(APPLICATION_STATUSES as readonly string[]).includes(status) || status === 'withdrawn') throw new CampusError('Unknown status')
  const col = await applicationsCol()
  const r = await col.findOneAndUpdate({ id: appId, college_id: ctx.college.tenant_id }, { $set: { status, updated_at: nowIso() } }, { returnDocument: 'after', projection: { _id: 0 } })
  if (!r) throw new CampusError('Application not found', 404)
  return r
}

// ─── Offers ─────────────────────────────────────────────────────────────────

export async function createOffer(ctx: StaffContext, raw: unknown): Promise<OfferDoc> {
  const parsed = offerInputSchema.safeParse(raw)
  if (!parsed.success) throw new CampusError(firstIssue(parsed.error))
  const i = parsed.data
  const student = await (await studentsCol()).findOne({ id: i.student_id, college_id: ctx.college.tenant_id }, { projection: { _id: 0, id: 1, user_id: 1, batch_id: 1 } })
  if (!student) throw new CampusError('Student not found', 404)
  const year = gradYear(ctx.college, student.batch_id)
  if (year === null) throw new CampusError('Put the student in a batch first (the placement year comes from it)')
  if (i.drive_id) await getDrive(ctx, i.drive_id)
  const now = nowIso()
  const doc: OfferDoc = {
    id: newId(), college_id: ctx.college.tenant_id, drive_id: i.drive_id ?? null, student_id: student.id, user_id: student.user_id,
    company_name: i.company_name, role_title: i.role_title, ctc_minor: i.ctc_minor, currency: i.currency, joining_date: i.joining_date ?? null,
    status: i.status, year, created_by: ctx.user.id, created_at: now, updated_at: now,
  }
  await (await offersCol()).insertOne(doc)
  if (i.drive_id) await (await applicationsCol()).updateOne({ drive_id: i.drive_id, student_id: student.id }, { $set: { status: 'offered', updated_at: now } })
  if (student.user_id) {
    void import('@/lib/notifications').then(({ notify }) => notify({
      user_id: student.user_id!, type: 'campus.offer', title: `Offer recorded: ${i.company_name}`,
      message: `${i.role_title}. Check the details on your campus page.`, link: '/dashboard/campus', icon: 'award', send_email: true, send_whatsapp: true,
    })).catch(() => {})
  }
  return clean(doc)!
}

export async function updateOffer(ctx: StaffContext, id: string, raw: Record<string, unknown>): Promise<OfferDoc> {
  const set: Partial<OfferDoc> = { updated_at: nowIso() }
  if (raw.status !== undefined) {
    if (!(OFFER_STATUSES as readonly string[]).includes(String(raw.status))) throw new CampusError('Unknown status')
    set.status = raw.status as OfferStatus
  }
  if (raw.joining_date !== undefined) {
    if (raw.joining_date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(raw.joining_date))) throw new CampusError('Use YYYY-MM-DD')
    set.joining_date = raw.joining_date === null ? null : String(raw.joining_date)
  }
  if (raw.ctc_minor !== undefined) {
    const n = Number(raw.ctc_minor)
    if (!Number.isInteger(n) || n < 0 || n > 1e13) throw new CampusError('CTC must be a whole number of minor units')
    set.ctc_minor = n
  }
  const r = await (await offersCol()).findOneAndUpdate({ id, college_id: ctx.college.tenant_id }, { $set: set }, { returnDocument: 'after', projection: { _id: 0 } })
  if (!r) throw new CampusError('Offer not found', 404)
  return r
}

export async function listOffers(ctx: StaffContext, year?: number | null): Promise<Array<OfferDoc & { student_name: string }>> {
  const filter: Record<string, unknown> = { college_id: ctx.college.tenant_id }
  if (year) filter.year = year
  const rows = await (await offersCol()).find(filter, { projection: { _id: 0 } }).sort({ created_at: -1 }).limit(2000).toArray()
  const names = rows.length ? await (await studentsCol()).find({ id: { $in: [...new Set(rows.map((o) => o.student_id))] } }, { projection: { _id: 0, id: 1, name: 1 } }).toArray() : []
  const by = new Map(names.map((n) => [n.id, n.name]))
  return rows.map((o) => ({ ...o, student_name: by.get(o.student_id) ?? 'Student' }))
}

export async function collegeStats(ctx: StaffContext) {
  const [students, offers] = await Promise.all([
    (await studentsCol()).find({ college_id: ctx.college.tenant_id }, { projection: { _id: 0, id: 1, department_id: 1, batch_id: 1 } }).limit(100_000).toArray(),
    (await offersCol()).find({ college_id: ctx.college.tenant_id }, { projection: { _id: 0, student_id: 1, ctc_minor: 1, status: 1, currency: 1 } }).limit(100_000).toArray(),
  ])
  return placementStats(students.map((s) => ({ id: s.id, department_id: s.department_id, graduation_year: gradYear(ctx.college, s.batch_id) })), offers)
}

// ─── Readiness ──────────────────────────────────────────────────────────────

export async function batchReadiness(ctx: StaffContext, f: { department?: string | null; batch?: string | null }) {
  const filter: Record<string, unknown> = { college_id: ctx.college.tenant_id }
  if (f.department) filter.department_id = f.department
  if (f.batch) filter.batch_id = f.batch
  const students = await (await studentsCol()).find(filter, { projection: { _id: 0, id: 1, name: 1, department_id: 1, batch_id: 1, user_id: 1 } }).sort({ name: 1 }).limit(MAX_USERS).toArray()
  const signals = await loadSignals(students.map((s) => s.user_id).filter((x): x is string => !!x))
  return { truncated: students.length >= MAX_USERS, ...computeReadiness(students, signals) }
}

// ─── Student side ───────────────────────────────────────────────────────────

/** Everything a student may see about their own campus life (all colleges they joined). */
export async function studentView(user: Actor) {
  const records = await (await studentsCol()).find({ user_id: user.id }, { projection: { _id: 0, invite_token_hash: 0 } }).limit(5).toArray()
  if (!records.length) return { memberships: [] }
  const colleges = await (await collegesCol()).find({ tenant_id: { $in: records.map((r) => r.college_id) } }, { projection: { _id: 0 } }).toArray()
  const cBy = new Map(colleges.map((c) => [c.tenant_id, c]))
  const now = new Date()
  const memberships = []
  for (const s of records) {
    const college = cBy.get(s.college_id)
    if (!college) continue
    const year = gradYear(college, s.batch_id)
    const [drives, apps, offers] = await Promise.all([
      (await drivesCol()).find({ college_id: s.college_id, status: { $in: ['open', 'closed', 'completed'] } }, { projection: { _id: 0, created_by: 0, notified_at: 0 } }).sort({ 'schedule.apply_by': -1 }).limit(100).toArray(),
      (await applicationsCol()).find({ student_id: s.id }, { projection: { _id: 0 } }).toArray(),
      (await offersCol()).find({ student_id: s.id }, { projection: { _id: 0, created_by: 0 } }).sort({ created_at: -1 }).toArray(),
    ])
    const aBy = new Map(apps.map((a) => [a.drive_id, a]))
    memberships.push({
      college: { id: college.tenant_id, name: college.name, slug: college.slug },
      student: {
        id: s.id, name: s.name, email: s.email, roll_no: s.roll_no, status: s.status, cgpa: s.cgpa, backlogs: s.backlogs,
        department: college.departments.find((d) => d.id === s.department_id)?.name ?? null,
        batch: college.batches.find((b) => b.id === s.batch_id)?.name ?? null,
      },
      drives: drives.map((d) => {
        const e = checkEligibility({ ...s, graduation_year: year }, d.eligibility)
        const app = aBy.get(d.id)
        return {
          id: d.id, title: d.title, company: d.company.name, role_title: d.role_title, description: d.description,
          ctc_minor_min: d.ctc_minor_min, ctc_minor_max: d.ctc_minor_max, currency: d.currency, schedule: d.schedule, status: d.status,
          process: { mode: d.process.mode, pattern_id: d.process.pattern_id, external_url: d.process.external_url },
          eligible: e.eligible, reasons: e.reasons, open: driveAcceptsApplications(d, now),
          application: app ? { id: app.id, status: app.status, applied_at: app.applied_at } : null,
        }
      }),
      offers,
    })
  }
  return { memberships }
}

export async function applyToDrive(user: Actor, driveId: string): Promise<{ application: ApplicationDoc; next: { kind: string; href: string | null }; warning?: string }> {
  const drive = await (await drivesCol()).findOne({ id: driveId }, { projection: { _id: 0 } })
  if (!drive) throw new CampusError('Drive not found', 404)
  const student = await (await studentsCol()).findOne({ college_id: drive.college_id, user_id: user.id }, { projection: { _id: 0, invite_token_hash: 0 } })
  if (!student) throw new CampusError('This drive is for another college', 403)
  if (!driveAcceptsApplications(drive)) throw new CampusError('Applications for this drive are closed', 409)
  const college = await (await collegesCol()).findOne({ tenant_id: drive.college_id }, { projection: { _id: 0, batches: 1 } })
  const e = checkEligibility({ ...student, graduation_year: gradYear(college ?? { batches: [] }, student.batch_id) }, drive.eligibility)
  if (!e.eligible) throw new CampusError(e.reasons[0] ?? 'You are not eligible for this drive', 403)

  const col = await applicationsCol()
  const now = nowIso()
  const existing = await col.findOne({ drive_id: drive.id, student_id: student.id }, { projection: { _id: 0 } })
  let application: ApplicationDoc
  if (existing && existing.status !== 'withdrawn') application = existing
  else if (existing) {
    await col.updateOne({ id: existing.id }, { $set: { status: 'applied', applied_at: now, updated_at: now } })
    application = { ...existing, status: 'applied', applied_at: now, updated_at: now }
  } else {
    application = { id: newId(), drive_id: drive.id, college_id: drive.college_id, student_id: student.id, user_id: user.id, status: 'applied', ats_application_id: null, applied_at: now, updated_at: now }
    try { await col.insertOne(application) } catch (err) {
      if (!isDuplicateKey(err)) throw err
      application = (await col.findOne({ drive_id: drive.id, student_id: student.id }, { projection: { _id: 0 } }))!
    }
  }

  let warning: string | undefined
  // ATS job pipeline: apply through the same code as the public apply page (signed-in, primary résumé).
  if (drive.process.mode === 'ats_job' && drive.process.ats_job_id && !application.ats_application_id) {
    try {
      const { atsJobs } = await import('@/lib/ats/db')
      const { applyToJob } = await import('@/lib/ats/apply')
      const job = await (await atsJobs()).findOne({ id: drive.process.ats_job_id }, { projection: { _id: 0 } })
      if (job) {
        const r = await applyToJob(job, { user: { id: user.id, email: user.email, name: student.name } })
        await col.updateOne({ id: application.id }, { $set: { ats_application_id: r.application.id, status: 'in_process', updated_at: nowIso() } })
        application = { ...application, ats_application_id: r.application.id, status: 'in_process' }
      }
    } catch (err) {
      // The campus application stands; the officer sees it wasn't forwarded (no ats_application_id).
      warning = `Saved your application, but it couldn't be sent to the company's job yet: ${(err as Error).message}`
    }
  }
  const next = drive.process.mode === 'company_test' && drive.process.pattern_id
    ? { kind: 'company_test', href: `/dashboard/company-tests/${encodeURIComponent(drive.process.pattern_id)}` }
    : drive.process.mode === 'external' ? { kind: 'external', href: drive.process.external_url } : { kind: 'ats_job', href: '/dashboard/jobs' }
  return { application, next, ...(warning ? { warning } : {}) }
}

export async function withdraw(user: Actor, driveId: string): Promise<void> {
  const r = await (await applicationsCol()).updateOne({ drive_id: driveId, user_id: user.id, status: { $in: ['applied', 'shortlisted'] } }, { $set: { status: 'withdrawn', updated_at: nowIso() } })
  if (!r.matchedCount) throw new CampusError('Nothing to withdraw (in-process or decided applications stay on record)', 409)
}

/** Officer: a student's record + their own drive history (for the drawer). */
export async function studentDetail(ctx: StaffContext, id: string): Promise<{ student: StudentDoc; applications: ApplicationDoc[]; offers: OfferDoc[] }> {
  const student = await (await studentsCol()).findOne({ id, college_id: ctx.college.tenant_id }, { projection: { _id: 0, invite_token_hash: 0 } })
  if (!student) throw new CampusError('Student not found', 404)
  const [applications, offers] = await Promise.all([
    (await applicationsCol()).find({ student_id: id }, { projection: { _id: 0 } }).toArray(),
    (await offersCol()).find({ student_id: id }, { projection: { _id: 0 } }).toArray(),
  ])
  return { student, applications, offers }
}
