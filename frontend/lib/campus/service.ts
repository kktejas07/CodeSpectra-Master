/**
 * Campus service (server only): college onboarding, departments / batches,
 * placement staff, students (bulk CSV invite, verification), and the
 * student's own view. Drives / offers / stats live in ./drives.
 */
import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { getMongoDb } from '@/lib/mongodb'
import { newId, nowIso } from '@/lib/db/ids'
import { getAppOrigin } from '@/lib/app-origin'
import { logger } from '@/lib/logger'
import { sanitizeRegex } from '@/lib/sanitize'
import { CampusError, type StaffContext } from './access'
import { validateStudentCsv } from './csv'
import { decideInviteJoin, decideSelfJoin } from './rules'
import { clean, collegesCol, isDuplicateKey, studentsCol, usageCol, applicationsCol } from './store'
import {
  INVITE_DAILY_CAP, INVITE_TTL_DAYS, MAX_STAFF, batchesInputSchema, cleanDomains, collegeInputSchema, departmentsInputSchema,
  firstIssue, normRollNo, slugify, studentPatchSchema,
  type Batch, type CollegeDoc, type Department, type StudentDoc,
} from './types'

type Actor = { id: string; role: string; tenantId?: string | null; email: string }

export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex')

function shortId(prefix: string): string {
  return `${prefix}_${randomBytes(5).toString('hex')}`
}

// ─── College ────────────────────────────────────────────────────────────────

/** Create (or update) the college for an organisation. Tenant admins onboard their own organisation. */
export async function onboardCollege(actor: Actor, raw: unknown): Promise<CollegeDoc> {
  const parsed = collegeInputSchema.safeParse(raw)
  if (!parsed.success) throw new CampusError(firstIssue(parsed.error))
  const input = parsed.data
  let tenantId: string | null = null
  if (actor.role === 'superadmin') tenantId = input.tenant_id ?? null
  else if (actor.role === 'tenant_admin') tenantId = actor.tenantId ?? null
  if (!tenantId) throw new CampusError(actor.role === 'superadmin' ? 'Pick the organisation to set up as a college' : 'Only an organisation admin can set up a college', 403)
  const domains = cleanDomains(input.email_domains ?? [])
  if (!domains.ok) throw new CampusError(domains.error)

  const db = await getMongoDb()
  const tenant = await db.collection('tenants').findOne({ id: tenantId }, { projection: { _id: 0, id: 1, is_active: 1 } })
  if (!tenant || tenant.is_active === false) throw new CampusError('Organisation not found or inactive', 404)

  const col = await collegesCol()
  const now = nowIso()
  const existing = await col.findOne({ tenant_id: tenantId }, { projection: { _id: 0 } })
  if (existing) {
    await col.updateOne({ tenant_id: tenantId }, { $set: {
      name: input.name, city: input.city ?? null, state: input.state ?? null, email_domains: domains.domains,
      ...(input.league_public !== undefined ? { league_public: input.league_public } : {}), updated_at: now,
    } })
  } else {
    let slug = slugify(input.name) || `college-${tenantId.slice(0, 6)}`
    if (await col.findOne({ slug }, { projection: { _id: 1 } })) slug = `${slug}-${randomBytes(2).toString('hex')}`
    const doc: CollegeDoc = {
      tenant_id: tenantId, name: input.name, slug, city: input.city ?? null, state: input.state ?? null,
      email_domains: domains.domains, departments: [], batches: [], staff: [], league_public: input.league_public ?? true,
      created_by: actor.id, created_at: now, updated_at: now,
    }
    try { await col.insertOne(doc) } catch (e) {
      if (!isDuplicateKey(e)) throw e
    }
    // The organisation is now a college (other modules may branch on it).
    await db.collection('tenants').updateOne({ id: tenantId }, { $set: { kind: 'college' } })
  }
  return clean(await col.findOne({ tenant_id: tenantId }, { projection: { _id: 0 } }))!
}

/** Replace the department list, keeping ids stable; refuses to drop one that students use. */
export async function setDepartments(ctx: StaffContext, raw: unknown): Promise<Department[]> {
  const parsed = departmentsInputSchema.safeParse(raw)
  if (!parsed.success) throw new CampusError(firstIssue(parsed.error))
  const known = new Map(ctx.college.departments.map((d) => [d.id, d]))
  const codes = new Set<string>()
  const next: Department[] = parsed.data.map((d) => {
    const code = d.code.toUpperCase()
    if (codes.has(code)) throw new CampusError(`Department code ${code} is used twice`)
    codes.add(code)
    return { id: d.id && known.has(d.id) ? d.id : shortId('dep'), name: d.name, code }
  })
  const dropped = ctx.college.departments.filter((d) => !next.some((n) => n.id === d.id)).map((d) => d.id)
  if (dropped.length) {
    const used = await (await studentsCol()).countDocuments({ college_id: ctx.college.tenant_id, department_id: { $in: dropped } })
    if (used) throw new CampusError(`${used} students are still in a department you removed — move them first`, 409)
  }
  await (await collegesCol()).updateOne({ tenant_id: ctx.college.tenant_id }, { $set: { departments: next, updated_at: nowIso() } })
  return next
}

export async function setBatches(ctx: StaffContext, raw: unknown): Promise<Batch[]> {
  const parsed = batchesInputSchema.safeParse(raw)
  if (!parsed.success) throw new CampusError(firstIssue(parsed.error))
  const known = new Set(ctx.college.batches.map((b) => b.id))
  const depts = new Set(ctx.college.departments.map((d) => d.id))
  const next: Batch[] = parsed.data.map((b) => {
    const department_id = b.department_id || null
    if (department_id && !depts.has(department_id)) throw new CampusError(`Batch “${b.name}” points at a department that doesn't exist`)
    return { id: b.id && known.has(b.id) ? b.id : shortId('bat'), name: b.name, department_id, graduation_year: b.graduation_year }
  })
  const dropped = ctx.college.batches.filter((b) => !next.some((n) => n.id === b.id)).map((b) => b.id)
  if (dropped.length) {
    const used = await (await studentsCol()).countDocuments({ college_id: ctx.college.tenant_id, batch_id: { $in: dropped } })
    if (used) throw new CampusError(`${used} students are still in a batch you removed — move them first`, 409)
  }
  await (await collegesCol()).updateOne({ tenant_id: ctx.college.tenant_id }, { $set: { batches: next, updated_at: nowIso() } })
  return next
}

/** Add a placement officer (an existing account) by email. */
export async function addStaff(ctx: StaffContext, emailRaw: unknown): Promise<CollegeDoc['staff']> {
  const email = String(emailRaw ?? '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new CampusError('Enter a valid email')
  if (ctx.college.staff.length >= MAX_STAFF) throw new CampusError(`Up to ${MAX_STAFF} placement officers`)
  const db = await getMongoDb()
  const user = await db.collection('user').findOne({ email: { $regex: `^${sanitizeRegex(email)}$`, $options: 'i' } }, { projection: { _id: 1, id: 1, name: 1, fullName: 1, role: 1 } })
  if (!user) throw new CampusError('No account uses that email yet — ask them to sign up first', 404)
  if (user.role === 'superadmin') throw new CampusError('That account is a platform admin')
  const userId = String(user.id || user._id)
  if (ctx.college.staff.some((s) => s.user_id === userId)) return ctx.college.staff
  const member = { user_id: userId, email, name: String(user.fullName || user.name || email.split('@')[0]).slice(0, 120), added_at: nowIso() }
  await (await collegesCol()).updateOne({ tenant_id: ctx.college.tenant_id, 'staff.user_id': { $ne: userId } }, { $push: { staff: member }, $set: { updated_at: nowIso() } })
  return [...ctx.college.staff, member]
}

export async function removeStaff(ctx: StaffContext, userId: string): Promise<CollegeDoc['staff']> {
  await (await collegesCol()).updateOne({ tenant_id: ctx.college.tenant_id }, { $pull: { staff: { user_id: userId } }, $set: { updated_at: nowIso() } })
  return ctx.college.staff.filter((s) => s.user_id !== userId)
}

// ─── Students ───────────────────────────────────────────────────────────────

export interface StudentFilter { department?: string | null; batch?: string | null; status?: string | null; q?: string | null; page?: number; limit?: number }

export async function listStudents(ctx: StaffContext, f: StudentFilter): Promise<{ total: number; items: StudentDoc[] }> {
  const filter: Record<string, unknown> = { college_id: ctx.college.tenant_id }
  if (f.department) filter.department_id = f.department
  if (f.batch) filter.batch_id = f.batch
  if (f.status && ['invited', 'pending', 'verified'].includes(f.status)) filter.status = f.status
  if (f.q) {
    const re = { $regex: sanitizeRegex(f.q.slice(0, 80)), $options: 'i' }
    filter.$or = [{ name: re }, { email: re }, { roll_no: re }]
  }
  const limit = Math.min(100, Math.max(1, f.limit ?? 50))
  const page = Math.max(1, f.page ?? 1)
  const col = await studentsCol()
  const [total, items] = await Promise.all([
    col.countDocuments(filter),
    col.find(filter, { projection: { _id: 0, invite_token_hash: 0 } }).sort({ name: 1 }).skip((page - 1) * limit).limit(limit).toArray(),
  ])
  return { total, items: items as StudentDoc[] }
}

/** Atomic per-college daily counter; returns how many sends are still allowed. */
async function reserveInvites(collegeId: string, want: number): Promise<number> {
  if (want <= 0) return 0
  const key = `invites:${collegeId}:${new Date().toISOString().slice(0, 10)}`
  const col = await usageCol()
  const r = await col.findOneAndUpdate({ key }, { $inc: { n: want }, $setOnInsert: { at: new Date() } }, { upsert: true, returnDocument: 'after' })
  const n = Number(r?.n ?? want)
  const over = Math.max(0, n - INVITE_DAILY_CAP)
  if (over > 0) await col.updateOne({ key }, { $inc: { n: -Math.min(over, want) } })
  return Math.max(0, want - over)
}

function esc(v: unknown): string {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

async function sendInviteEmail(to: string, name: string, college: string, token: string): Promise<boolean> {
  const { isUnsubscribed, listUnsubscribeHeaders, unsubscribeUrl } = await import('@/lib/automation/mailer')
  if (await isUnsubscribed(to, 'engagement')) return false
  const { appendUnsubscribeFooter } = await import('@/lib/notifications-delivery')
  const link = `${getAppOrigin()}/dashboard/campus?invite=${encodeURIComponent(token)}`
  // SEO-033: in the student's language when the address already has an account.
  const [{ emailTemplatesFor }, { localeForEmail }] = await Promise.all([import('@/lib/email-templates'), import('@/lib/i18n/recipient')])
  const msg = emailTemplatesFor(await localeForEmail(to)).notice({
    key: 'campusInvite',
    params: { college: esc(college), name: esc(name), days: INVITE_TTL_DAYS },
    subjectParams: { college, name, days: INVITE_TTL_DAYS },
    buttonUrl: esc(link),
  })
  const html = appendUnsubscribeFooter(msg.html, unsubscribeUrl(to, 'engagement'))
  const { sendEmail } = await import('@/lib/send-email')
  const r = await sendEmail(to, { subject: msg.subject, html }, undefined, { category: 'campus_invite', headers: listUnsubscribeHeaders(to, 'engagement') })
  return !!r?.success || !!r?.queued
}

function newInvite(): { token: string; hash: string; expires: string } {
  const token = randomBytes(24).toString('base64url')
  return { token, hash: hashToken(token), expires: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000).toISOString() }
}

/**
 * Bulk import from CSV. New emails get a record + invite; existing records
 * get the officer fields (roll no, department, batch, CGPA, backlogs) updated
 * and, if not joined yet, a fresh invite. `dryRun` validates only.
 */
export async function importStudents(ctx: StaffContext, csv: unknown, opts: { dryRun?: boolean; sendInvites?: boolean }) {
  if (typeof csv !== 'string' || !csv.trim()) throw new CampusError('Paste or upload a CSV file')
  if (csv.length > 2_000_000) throw new CampusError('That file is too large (2 MB max)', 413)
  const { rows, issues, total } = validateStudentCsv(csv, ctx.college)
  if (opts.dryRun || issues.length) return { total, valid: rows.length, issues: issues.slice(0, 200), created: 0, updated: 0, invited: 0, skipped_invites: 0 }

  const col = await studentsCol()
  const cid = ctx.college.tenant_id
  const existing = await col.find({ college_id: cid, email: { $in: rows.map((r) => r.email) } }, { projection: { _id: 0, id: 1, email: 1, user_id: 1 } }).toArray()
  const byEmail = new Map(existing.map((e) => [e.email, e]))
  // Roll numbers already used by a different email in this college.
  const rolls = rows.map((r) => r.roll_no).filter((x): x is string => !!x)
  const rollOwners = rolls.length ? await col.find({ college_id: cid, roll_no: { $in: rolls } }, { projection: { _id: 0, email: 1, roll_no: 1 } }).toArray() : []
  const conflicts = rollOwners.filter((o) => rows.some((r) => r.roll_no === o.roll_no && r.email !== o.email))
  if (conflicts.length) {
    return { total, valid: rows.length - conflicts.length, issues: conflicts.slice(0, 200).map((c) => ({ line: rows.find((r) => r.roll_no === c.roll_no)?.line ?? 0, message: `Roll number ${c.roll_no} belongs to another student already` })), created: 0, updated: 0, invited: 0, skipped_invites: 0 }
  }

  const now = nowIso()
  const toInvite: Array<{ email: string; name: string; token: string }> = []
  const ops = rows.map((r) => {
    const prev = byEmail.get(r.email)
    const inv = !prev?.user_id && opts.sendInvites !== false ? newInvite() : null
    if (inv) toInvite.push({ email: r.email, name: r.name, token: inv.token })
    const fields = { name: r.name, roll_no: r.roll_no, department_id: r.department_id, batch_id: r.batch_id, cgpa: r.cgpa, backlogs: r.backlogs, updated_at: now }
    if (prev) {
      return { updateOne: { filter: { college_id: cid, email: r.email }, update: { $set: { ...fields, ...(inv ? { invite_token_hash: inv.hash, invite_expires_at: inv.expires, invited_at: now } : {}) } } } }
    }
    const doc: StudentDoc = {
      id: newId(), college_id: cid, email: r.email, ...fields, user_id: null, status: 'invited', verified_via: null,
      invite_token_hash: inv?.hash ?? null, invite_expires_at: inv?.expires ?? null, invited_at: inv ? now : null, joined_at: null, created_at: now,
    }
    return { insertOne: { document: doc } }
  })
  const res = await col.bulkWrite(ops as never, { ordered: false })

  const allowed = await reserveInvites(cid, toInvite.length)
  const batch = toInvite.slice(0, allowed)
  // Sends run after the response (a few at a time); failures are logged without addresses.
  void (async () => {
    let failed = 0
    for (let i = 0; i < batch.length; i += 5) {
      const chunk = batch.slice(i, i + 5)
      const r = await Promise.allSettled(chunk.map((x) => sendInviteEmail(x.email, x.name, ctx.college.name, x.token)))
      failed += r.filter((x) => x.status === 'rejected').length
    }
    if (failed) logger.warn(`[campus] ${failed} invite emails failed for college ${cid}`)
  })().catch(() => {})
  return { total, valid: rows.length, issues: [], created: res.insertedCount, updated: res.modifiedCount, invited: batch.length, skipped_invites: toInvite.length - batch.length }
}

export async function patchStudent(ctx: StaffContext, id: string, raw: unknown): Promise<StudentDoc> {
  const parsed = studentPatchSchema.safeParse(raw)
  if (!parsed.success) throw new CampusError(firstIssue(parsed.error))
  const p = parsed.data
  const col = await studentsCol()
  const cur = await col.findOne({ id, college_id: ctx.college.tenant_id }, { projection: { _id: 0 } })
  if (!cur) throw new CampusError('Student not found', 404)
  if (p.department_id && !ctx.college.departments.some((d) => d.id === p.department_id)) throw new CampusError('Unknown department')
  if (p.batch_id && !ctx.college.batches.some((b) => b.id === p.batch_id)) throw new CampusError('Unknown batch')
  const set: Partial<StudentDoc> = { updated_at: nowIso() }
  if (p.name !== undefined) set.name = p.name
  if (p.roll_no !== undefined) set.roll_no = p.roll_no ? normRollNo(p.roll_no) : null
  if (p.department_id !== undefined) set.department_id = p.department_id || null
  if (p.batch_id !== undefined) set.batch_id = p.batch_id || null
  if (p.cgpa !== undefined) set.cgpa = p.cgpa === null ? null : Math.round(p.cgpa * 100) / 100
  if (p.backlogs !== undefined) set.backlogs = p.backlogs
  // An officer can verify a student who joined (account linked) but couldn't verify themselves.
  if (p.verify === true) {
    if (!cur.user_id) throw new CampusError('The student has to join first (send them the invite)', 409)
    set.status = 'verified'
    set.verified_via = 'officer'
  }
  try {
    await col.updateOne({ id, college_id: ctx.college.tenant_id }, { $set: set })
  } catch (e) {
    if (isDuplicateKey(e)) throw new CampusError('That roll number belongs to another student', 409)
    throw e
  }
  return clean(await col.findOne({ id }, { projection: { _id: 0 } }))!
}

export async function resendInvite(ctx: StaffContext, id: string): Promise<{ sent: boolean }> {
  const col = await studentsCol()
  const cur = await col.findOne({ id, college_id: ctx.college.tenant_id }, { projection: { _id: 0 } })
  if (!cur) throw new CampusError('Student not found', 404)
  if (cur.user_id) throw new CampusError('This student has already joined', 409)
  if ((await reserveInvites(ctx.college.tenant_id, 1)) < 1) throw new CampusError('Daily invite limit reached — try tomorrow', 429)
  const inv = newInvite()
  await col.updateOne({ id }, { $set: { invite_token_hash: inv.hash, invite_expires_at: inv.expires, invited_at: nowIso(), updated_at: nowIso() } })
  return { sent: await sendInviteEmail(cur.email, cur.name, ctx.college.name, inv.token) }
}

export async function removeStudent(ctx: StaffContext, id: string): Promise<void> {
  const col = await studentsCol()
  const cur = await col.findOne({ id, college_id: ctx.college.tenant_id }, { projection: { _id: 0, id: 1 } })
  if (!cur) throw new CampusError('Student not found', 404)
  const apps = await (await applicationsCol()).countDocuments({ student_id: id })
  if (apps) throw new CampusError('This student has drive applications — keep the record for placement history', 409)
  await col.deleteOne({ id, college_id: ctx.college.tenant_id })
}

// ─── Student side ───────────────────────────────────────────────────────────

/** Accept an invite link (signed in). */
export async function joinByInvite(user: Actor, token: unknown, rollNo: unknown): Promise<{ college: string; status: string; needs_roll_no?: boolean }> {
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) throw new CampusError('This invitation link is not valid', 404)
  const col = await studentsCol()
  const record = await col.findOne({ invite_token_hash: hashToken(token) }, { projection: { _id: 0 } })
  if (!record) throw new CampusError('This invitation link is not valid or was replaced by a newer one', 404)
  const college = await (await collegesCol()).findOne({ tenant_id: record.college_id }, { projection: { _id: 0, name: 1, email_domains: 1 } })
  if (!college) throw new CampusError('College not found', 404)
  // One account per college: refuse if this user already has another record here.
  const other = await col.findOne({ college_id: record.college_id, user_id: user.id, id: { $ne: record.id } }, { projection: { _id: 1 } })
  if (other) throw new CampusError('Your account is already linked to another student record at this college', 409)
  const d = decideInviteJoin({ record, userId: user.id, userEmail: user.email, domains: college.email_domains, rollNo })
  const now = nowIso()
  if (!d.ok) {
    // Link the account anyway (pending) so the officer can verify by hand; the roll number check can be retried.
    if (d.status === 400 || d.status === 403) {
      await col.updateOne({ id: record.id, $or: [{ user_id: null }, { user_id: user.id }] }, { $set: { user_id: user.id, joined_at: record.joined_at ?? now, status: record.status === 'verified' ? 'verified' : 'pending', updated_at: now } })
    }
    if (d.needs_roll_no && d.status === 400) return { college: college.name, status: 'pending', needs_roll_no: true }
    throw new CampusError(d.error, d.status)
  }
  const r = await col.updateOne(
    { id: record.id, $or: [{ user_id: null }, { user_id: user.id }] },
    { $set: { user_id: user.id, status: 'verified', verified_via: d.via, joined_at: record.joined_at ?? now, invite_token_hash: null, updated_at: now } },
  )
  if (!r.matchedCount) throw new CampusError('This invitation was already used by another account', 409)
  return { college: college.name, status: 'verified' }
}

/** Join a college with a college-domain email (no invite). */
export async function selfJoin(user: Actor, slugRaw: unknown, rollRaw: unknown, nameRaw: unknown): Promise<{ college: string; status: string }> {
  const slug = String(slugRaw ?? '').trim().toLowerCase()
  if (!/^[a-z0-9-]{2,80}$/.test(slug)) throw new CampusError('Pick your college')
  const college = await (await collegesCol()).findOne({ slug }, { projection: { _id: 0, tenant_id: 1, name: 1, email_domains: 1 } })
  if (!college) throw new CampusError('College not found', 404)
  const roll = normRollNo(rollRaw)
  if (!roll || roll.length > 40) throw new CampusError('Enter your roll number')
  const col = await studentsCol()
  const email = user.email.toLowerCase()
  const [byEmail, byRoll, mine] = await Promise.all([
    col.findOne({ college_id: college.tenant_id, email }, { projection: { _id: 0, id: 1, user_id: 1 } }),
    col.findOne({ college_id: college.tenant_id, roll_no: roll }, { projection: { _id: 0, id: 1, user_id: 1, email: 1 } }),
    col.findOne({ college_id: college.tenant_id, user_id: user.id }, { projection: { _id: 0, id: 1 } }),
  ])
  if (mine) return { college: college.name, status: 'already_joined' }
  const d = decideSelfJoin({ userId: user.id, userEmail: email, domains: college.email_domains, byEmail, byRoll })
  if (!d.ok) throw new CampusError(d.error, d.status)
  const now = nowIso()
  if (d.action === 'link') {
    await col.updateOne({ id: d.studentId }, { $set: { user_id: user.id, status: 'verified', verified_via: 'domain', joined_at: now, invite_token_hash: null, updated_at: now } })
    return { college: college.name, status: 'verified' }
  }
  const name = String(nameRaw ?? '').trim().slice(0, 120) || email.split('@')[0]
  const doc: StudentDoc = {
    id: newId(), college_id: college.tenant_id, email, name, roll_no: roll, department_id: null, batch_id: null, cgpa: null, backlogs: 0,
    user_id: user.id, status: 'verified', verified_via: 'domain', invite_token_hash: null, invite_expires_at: null, invited_at: null,
    joined_at: now, created_at: now, updated_at: now,
  }
  try { await col.insertOne(doc) } catch (e) {
    if (isDuplicateKey(e)) throw new CampusError('That roll number or email is already on record — contact your placement office', 409)
    throw e
  }
  return { college: college.name, status: 'verified' }
}

/** Colleges open for self-join (name + slug only). */
export async function listJoinableColleges(): Promise<Array<{ slug: string; name: string; city: string | null }>> {
  const rows = await (await collegesCol()).find({ 'email_domains.0': { $exists: true } }, { projection: { _id: 0, slug: 1, name: 1, city: 1 } }).sort({ name: 1 }).limit(500).toArray()
  return rows.map((r) => ({ slug: r.slug, name: r.name, city: r.city ?? null }))
}
