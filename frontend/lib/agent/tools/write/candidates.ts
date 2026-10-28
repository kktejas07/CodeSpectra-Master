/**
 * Write tools around candidates: invite, remind, release scores, outcomes,
 * shortlist, revoke certificate. Each execute() calls the same lib/services
 * function the admin API routes use.
 */
import { getMongoDb } from '@/lib/mongodb'
import { ToolInputError } from '@/lib/agent/contract'
import { OUTCOME_STATUSES, OUTCOME_LABELS, parseOutcomeUpdate, type OutcomeStatus } from '@/lib/hiring-outcomes'
import { createCandidateInvite, pendingInvitesForExam, sendExamInviteReminders, EMAIL_RE } from '@/lib/services/invites'
import { previewExamRelease, releaseExamScores } from '@/lib/services/exam-release'
import { recordHiringOutcomes } from '@/lib/services/outcomes'
import { getExamResults } from '@/lib/services/exam-results'
import { findRevocableCertificate, revokeCertificate, revokeInputProblem, CERT_ID_RE } from '@/lib/services/certificates'
import { writeTool } from '../define'
import { argsObject, optDate, optEnum, optIdArray, optInt, optObject, optObjectArray, optString, reqId, reqString } from '../args'
import { friendlyServiceError, serviceUser, unwrap } from '../scope'
import { loadExam, testResultsLink } from '../loaders'
import { DRAFT_KEY, openDraft, sealDraft } from '../seal'
import { uploadText } from '../uploads'
import { rankResults } from '../read/tests'
import { clip } from '../output'

type Doc = Record<string, any>

// ─── invite_candidates ───────────────────────────────────────────────────────

export const MAX_INVITES_PER_ACTION = 200
const DAY = 86_400_000

export interface Recipient { email: string; name?: string }

export interface InviteArgs {
  test_id: string
  candidates?: Recipient[]
  csv_upload_id?: string
  deadline?: string
  message?: string
}

/** Emails from CSV/plain text: one person per line, `email` or `name,email` (pure). */
export function recipientsFromText(text: string): Recipient[] {
  const out: Recipient[] = []
  for (const line of text.split(/\r?\n/)) {
    const cells = line.split(/[,;\t]/).map((c) => c.trim().replace(/^"|"$/g, ''))
    const email = cells.find((c) => EMAIL_RE.test(c))
    if (!email) continue
    const name = cells.find((c) => c && c !== email && !/@/.test(c) && !/^(name|email|full name)$/i.test(c))
    out.push({ email, ...(name ? { name: name.slice(0, 120) } : {}) })
  }
  return out
}

/** Normalise, validate and dedupe recipients (pure). `already` = emails with a live invite. */
export function planRecipients(list: Recipient[], already: Set<string>): {
  send: Recipient[]
  skipped: Array<{ email: string; reason: string }>
} {
  const seen = new Set<string>()
  const send: Recipient[] = []
  const skipped: Array<{ email: string; reason: string }> = []
  for (const r of list) {
    const email = String(r.email || '').trim().toLowerCase()
    if (!email || !EMAIL_RE.test(email) || email.length > 254) { skipped.push({ email: email || '(empty)', reason: 'Invalid email' }); continue }
    if (seen.has(email)) { skipped.push({ email, reason: 'Duplicate in this list' }); continue }
    seen.add(email)
    if (already.has(email)) { skipped.push({ email, reason: 'Already invited and not submitted' }); continue }
    send.push({ email, ...(r.name ? { name: String(r.name).trim().slice(0, 120) } : {}) })
  }
  return { send, skipped }
}

async function liveInviteEmails(examId: string): Promise<Set<string>> {
  return new Set((await pendingInvitesForExam(examId)).map((i) => String(i.email || '').toLowerCase()))
}

async function inviteRecipients(ctx: Parameters<typeof uploadText>[0], a: InviteArgs): Promise<Recipient[]> {
  const list: Recipient[] = [...(a.candidates ?? [])]
  if (a.csv_upload_id) list.push(...recipientsFromText((await uploadText(ctx, a.csv_upload_id)).text))
  return list
}

export const inviteCandidatesTool = writeTool<InviteArgs>({
  name: 'invite_candidates',
  risk: 'send',
  description:
    `Email invites to a test. Give a list of candidates (email, optional name) or an uploaded CSV id, an optional deadline and a short message. ` +
    `Duplicates and people already invited (not yet submitted) are skipped. At most ${MAX_INVITES_PER_ACTION} per action.`,
  parameters: {
    type: 'object',
    properties: {
      test_id: { type: 'string' },
      candidates: {
        type: 'array', maxItems: MAX_INVITES_PER_ACTION,
        items: { type: 'object', properties: { email: { type: 'string' }, name: { type: 'string' } }, required: ['email'] },
      },
      csv_upload_id: { type: 'string', description: 'Uploaded CSV/text with one candidate per line (name,email).' },
      deadline: { type: 'string', description: 'ISO date the invite expires (default 7 days, max 90).' },
      message: { type: 'string', maxLength: 1000, description: 'Short note added to the email.' },
    },
    required: ['test_id'],
  },
  parse(raw) {
    const r = argsObject(raw, ['test_id', 'candidates', 'csv_upload_id', 'deadline', 'message'])
    const rows = optObjectArray(r, 'candidates', MAX_INVITES_PER_ACTION)
    const candidates = rows?.map((c, i) => {
      try {
        const cr = argsObject(c, ['email', 'name'])
        const name = optString(cr, 'name', { max: 120 })
        return { email: reqString(cr, 'email', { max: 254 }), ...(name ? { name } : {}) }
      } catch (e) { throw new ToolInputError(`candidates[${i}]: ${(e as Error).message}`) }
    })
    const csv = optString(r, 'csv_upload_id', { max: 128 })
    if (!candidates?.length && !csv) throw new ToolInputError('Give `candidates` (emails) or a `csv_upload_id`.')
    const deadline = optDate(r, 'deadline')
    if (deadline) {
      const t = new Date(deadline).getTime()
      if (t <= Date.now()) throw new ToolInputError('`deadline` must be in the future.')
      if (t > Date.now() + 90 * DAY) throw new ToolInputError('`deadline` can be at most 90 days away.')
    }
    const message = optString(r, 'message', { max: 1000 })
    return { test_id: reqId(r, 'test_id'), ...(candidates ? { candidates } : {}), ...(csv ? { csv_upload_id: csv } : {}), ...(deadline ? { deadline } : {}), ...(message ? { message } : {}) }
  },
  async propose(a, ctx) {
    const exam = await loadExam(ctx.caller, a.test_id)
    const { send, skipped } = planRecipients(await inviteRecipients(ctx.caller, a), await liveInviteEmails(a.test_id))
    if (send.length === 0) throw new ToolInputError(`Nobody to invite: ${skipped.length ? skipped.slice(0, 3).map((s) => `${s.email} (${s.reason})`).join('; ') : 'the list is empty'}.`)
    if (send.length > MAX_INVITES_PER_ACTION) throw new ToolInputError(`That is ${send.length} people — invite at most ${MAX_INVITES_PER_ACTION} per action.`)
    const warnings: string[] = []
    if (!exam.published) warnings.push('This test is not published yet — candidates will not be able to start until it is.')
    return {
      title: `Invite ${send.length} candidate${send.length === 1 ? '' : 's'} to “${clip(exam.title, 80)}”`,
      preview: {
        fields: {
          Test: exam.title,
          Recipients: send.length,
          Expires: a.deadline ? a.deadline.slice(0, 10) : 'In 7 days',
          Message: a.message ? clip(a.message, 300) : '—',
        },
        sample: send.slice(0, 5),
        skipped: skipped.slice(0, 20),
        skipped_count: skipped.length,
        warnings,
      },
    }
  },
  async execute(a, ctx) {
    const user = serviceUser(ctx.caller)
    const exam = await loadExam(ctx.caller, a.test_id)
    // Re-plan at confirm: retry-safe (people invited by an earlier partial run are skipped).
    const { send, skipped } = planRecipients(await inviteRecipients(ctx.caller, a), await liveInviteEmails(a.test_id))
    if (send.length > MAX_INVITES_PER_ACTION) return { ok: false, message: `Invite at most ${MAX_INVITES_PER_ACTION} people per action.` }
    let sent = 0
    const failed: string[] = []
    const created: string[] = []
    for (const r of send) {
      const res = await createCandidateInvite(user, {
        email: r.email,
        full_name: r.name,
        target_url: `/assessment/${a.test_id}`,
        exam_title: String(exam.title || ''),
        ...(a.deadline ? { expires_at: a.deadline } : {}),
        ...(a.message ? { message: a.message } : {}),
      })
      if (!res.ok) { failed.push(`${r.email}: ${friendlyServiceError(res)}`); continue }
      created.push(res.data.invite_id)
      if (res.data.welcomeEmailSent) sent++
      else failed.push(`${r.email}: invite created, email not delivered (copy the link from the results page)`)
    }
    return {
      ok: created.length > 0 || send.length === 0,
      message: send.length === 0
        ? 'Everyone on the list was already invited.'
        : `Invited ${created.length} of ${send.length}; ${sent} email${sent === 1 ? '' : 's'} sent.${failed.length ? ` ${failed.length} problem${failed.length === 1 ? '' : 's'}.` : ''}`,
      link: testResultsLink(a.test_id),
      data: { invite_ids: created, emails_sent: sent, failed: failed.slice(0, 20), skipped: skipped.length },
    }
  },
})

// ─── send_reminders ──────────────────────────────────────────────────────────

export interface RemindArgs { test_id: string; who?: 'not_started' | 'not_finished' }

async function reminderTargets(a: RemindArgs): Promise<Doc[]> {
  const pending = await pendingInvitesForExam(a.test_id)
  return a.who === 'not_started' ? pending.filter((i) => String(i.status || 'pending') === 'pending') : pending
}

export const sendRemindersTool = writeTool<RemindArgs>({
  name: 'send_reminders',
  risk: 'send',
  description: 'Email a reminder to invitees of a test who have not submitted (default), or only those who have not started.',
  parameters: {
    type: 'object',
    properties: { test_id: { type: 'string' }, who: { type: 'string', enum: ['not_started', 'not_finished'] } },
    required: ['test_id'],
  },
  parse(raw) {
    const r = argsObject(raw, ['test_id', 'who'])
    return { test_id: reqId(r, 'test_id'), who: optEnum(r, 'who', ['not_started', 'not_finished'] as const) ?? 'not_finished' }
  },
  async propose(a, ctx) {
    const exam = await loadExam(ctx.caller, a.test_id)
    const targets = await reminderTargets(a)
    if (targets.length === 0) throw new ToolInputError('Nobody to remind: every live invitee has submitted (or there are no live invites).')
    return {
      title: `Remind ${targets.length} candidate${targets.length === 1 ? '' : 's'} about “${clip(exam.title, 80)}”`,
      preview: {
        fields: { Test: exam.title, Recipients: targets.length, Who: a.who === 'not_started' ? 'Not started yet' : 'Not submitted yet' },
        sample: targets.slice(0, 5).map((i) => ({ email: i.email, name: i.full_name || null, expires_at: i.expires_at })),
      },
    }
  },
  async execute(a, ctx) {
    const targets = await reminderTargets(a)
    const r = await sendExamInviteReminders(serviceUser(ctx.caller), a.test_id, { onlyInviteIds: targets.map((i) => String(i.id)) })
    if (!r.ok) return { ok: false, message: friendlyServiceError(r) }
    return {
      ok: r.data.total === 0 || r.data.sent > 0,
      message: r.data.total === 0 ? 'Nobody left to remind.' : `Sent ${r.data.sent} of ${r.data.total} reminders.`,
      link: testResultsLink(a.test_id),
      data: r.data,
    }
  },
})

// ─── release_scores ──────────────────────────────────────────────────────────

export const releaseScoresTool = writeTool<{ test_id: string; pass_mark?: number }>({
  name: 'release_scores',
  risk: 'publish',
  description: 'Release graded scores for a test to candidates with a pass mark. Candidates at or above it get a verifiable certificate (if the test issues them). Work still awaiting review stays unreleased.',
  parameters: {
    type: 'object',
    properties: { test_id: { type: 'string' }, pass_mark: { type: 'integer', minimum: 0, maximum: 100, description: 'Percent; default the test\'s pass mark.' } },
    required: ['test_id'],
  },
  parse(raw) {
    const r = argsObject(raw, ['test_id', 'pass_mark'])
    const pass = optInt(r, 'pass_mark', 0, 100)
    return { test_id: reqId(r, 'test_id'), ...(pass !== undefined ? { pass_mark: pass } : {}) }
  },
  async propose(a, ctx) {
    const exam = await loadExam(ctx.caller, a.test_id)
    const p = unwrap(await previewExamRelease(serviceUser(ctx.caller), a.test_id, a.pass_mark))
    if (p.releasable === 0) {
      throw new ToolInputError(p.skipped_pending ? `Nothing to release yet: ${p.skipped_pending} submission(s) still need review.` : 'Nothing to release: every submission is already released.')
    }
    return {
      title: `Release scores for “${clip(exam.title, 80)}” (${p.releasable} candidate${p.releasable === 1 ? '' : 's'})`,
      preview: {
        fields: { 'Pass mark': `${p.cutoff}%`, Releasing: p.releasable, Passing: p.pass, 'Not passing': p.fail, 'Held back (needs review)': p.skipped_pending },
        certificates: p.issue_certificates ? `Up to ${p.certificates_estimate} certificate${p.certificates_estimate === 1 ? '' : 's'} will be issued` : 'Certificates are off for this test',
        notes: ['Candidates are notified in-app and by email.'],
      },
    }
  },
  async execute(a, ctx) {
    const r = await releaseExamScores(serviceUser(ctx.caller), a.test_id, a.pass_mark)
    if (!r.ok) return { ok: false, message: friendlyServiceError(r) }
    const d = r.data
    return {
      ok: true,
      message: `Released ${d.released} result${d.released === 1 ? '' : 's'} (${d.passed} passed, ${d.failed} not). ${d.certificates_issued ?? 0} certificate(s) issued.`,
      link: testResultsLink(a.test_id),
      data: d,
    }
  },
})

// ─── record_outcomes ─────────────────────────────────────────────────────────

export interface OutcomeArgs {
  test_id: string
  candidate_ids: string[]
  status?: OutcomeStatus
  rating?: { period: number; value: number; notes?: string }
}

function outcomeUpdate(a: OutcomeArgs) {
  const p = parseOutcomeUpdate({ exam_id: a.test_id, user_ids: a.candidate_ids, status: a.status ?? null, rating: a.rating ?? null })
  if (!p.ok) throw new ToolInputError(p.error)
  return p.value
}

async function submittedUsers(examId: string, ids: string[]): Promise<Map<string, string>> {
  const db = await getMongoDb()
  const subs = await db.collection('exam_submissions').find({ exam_id: examId, user_id: { $in: ids } }, { projection: { _id: 0, user_id: 1, email: 1 } }).toArray()
  return new Map(subs.map((s) => [String(s.user_id), String(s.email || '')]))
}

export const recordOutcomesTool = writeTool<OutcomeArgs>({
  name: 'record_outcomes',
  risk: 'update',
  description: `Record hiring outcomes (${OUTCOME_STATUSES.join(', ')}) and/or a 30/90/180-day performance rating (1–5, hired only) for candidates of a test. Candidate ids are user ids from get_test_results.`,
  parameters: {
    type: 'object',
    properties: {
      test_id: { type: 'string' },
      candidate_ids: { type: 'array', items: { type: 'string' }, maxItems: 200 },
      status: { type: 'string', enum: [...OUTCOME_STATUSES] },
      rating: {
        type: 'object',
        properties: { period: { type: 'integer', enum: [30, 90, 180] }, value: { type: 'integer', minimum: 1, maximum: 5 }, notes: { type: 'string', maxLength: 1000 } },
        required: ['period', 'value'],
      },
    },
    required: ['test_id', 'candidate_ids'],
  },
  parse(raw) {
    const r = argsObject(raw, ['test_id', 'candidate_ids', 'status', 'rating'])
    const rating = optObject(r, 'rating')
    let rt: OutcomeArgs['rating']
    if (rating) {
      const rr = argsObject(rating, ['period', 'value', 'notes'])
      const notes = optString(rr, 'notes', { max: 1000 })
      rt = { period: optInt(rr, 'period', 30, 180) ?? 0, value: optInt(rr, 'value', 1, 5) ?? 0, ...(notes ? { notes } : {}) }
    }
    const status = optEnum(r, 'status', OUTCOME_STATUSES)
    const a: OutcomeArgs = { test_id: reqId(r, 'test_id'), candidate_ids: optIdArray(r, 'candidate_ids', 200) ?? [], ...(status ? { status } : {}), ...(rt ? { rating: rt } : {}) }
    outcomeUpdate(a) // same validation the API uses
    return a
  },
  async propose(a, ctx) {
    const exam = await loadExam(ctx.caller, a.test_id)
    const subs = await submittedUsers(a.test_id, a.candidate_ids)
    const missing = a.candidate_ids.filter((id) => !subs.has(id))
    if (missing.length === a.candidate_ids.length) throw new ToolInputError('None of these candidates submitted this test.')
    const what = [a.status ? `mark as ${OUTCOME_LABELS[a.status].toLowerCase()}` : '', a.rating ? `${a.rating.period}-day rating ${a.rating.value}/5` : ''].filter(Boolean).join(' and ')
    return {
      title: `${what.charAt(0).toUpperCase()}${what.slice(1)} for ${subs.size} candidate${subs.size === 1 ? '' : 's'} on “${clip(exam.title, 60)}”`,
      preview: {
        fields: { Test: exam.title, Outcome: a.status ? OUTCOME_LABELS[a.status] : '—', Rating: a.rating ? `${a.rating.value}/5 at ${a.rating.period} days` : '—' },
        candidates: [...subs.values()].slice(0, 20),
        skipped: missing.length ? `${missing.length} without a submission will be skipped` : undefined,
        notes: a.rating ? ['Ratings apply only to hired candidates; others are skipped.'] : undefined,
      },
    }
  },
  async execute(a, ctx) {
    const r = await recordHiringOutcomes(serviceUser(ctx.caller), outcomeUpdate(a))
    if (!r.ok) return { ok: false, message: friendlyServiceError(r) }
    return {
      ok: true,
      message: `Updated ${r.data.updated.length} candidate${r.data.updated.length === 1 ? '' : 's'}${r.data.skipped.length ? `; skipped ${r.data.skipped.length}` : ''}.`,
      link: testResultsLink(a.test_id),
      data: r.data,
    }
  },
})

// ─── shortlist_candidates ────────────────────────────────────────────────────

export interface ShortlistArgs { test_id: string; top_n?: number; min_score?: number; released_only?: boolean; [DRAFT_KEY]?: unknown }

/** Who a shortlist rule picks from ranked rows (pure). */
export function pickShortlist(
  rows: Array<{ userId: string; score: number | null; status: string; released: boolean; needsReview: boolean; outcome?: string | null }>,
  rule: { top_n?: number; min_score?: number; released_only?: boolean },
): string[] {
  let pool = rows.filter((r) => r.status === 'completed' && r.userId && typeof r.score === 'number' && !r.needsReview)
  if (rule.released_only) pool = pool.filter((r) => r.released)
  pool = pool.filter((r) => !r.outcome || r.outcome === 'shortlisted')
  pool.sort((x, y) => (y.score as number) - (x.score as number))
  if (rule.min_score !== undefined) pool = pool.filter((r) => (r.score as number) >= (rule.min_score as number))
  if (rule.top_n !== undefined) pool = pool.slice(0, rule.top_n)
  return pool.map((r) => r.userId)
}

export const shortlistCandidatesTool = writeTool<ShortlistArgs>({
  name: 'shortlist_candidates',
  risk: 'update',
  description: 'Mark the top N candidates of a test, or everyone at or above a score, as shortlisted. Skips candidates still needing review and those with a later outcome already.',
  parameters: {
    type: 'object',
    properties: {
      test_id: { type: 'string' },
      top_n: { type: 'integer', minimum: 1, maximum: 200 },
      min_score: { type: 'integer', minimum: 0, maximum: 100, description: 'Percent cutoff.' },
      released_only: { type: 'boolean', description: 'Only candidates whose scores are released.' },
    },
    required: ['test_id'],
  },
  parse(raw) {
    const r = argsObject(raw, ['test_id', 'top_n', 'min_score', 'released_only'])
    const top = optInt(r, 'top_n', 1, 200)
    const min = optInt(r, 'min_score', 0, 100)
    if (top === undefined && min === undefined) throw new ToolInputError('Give `top_n` or `min_score` (or both).')
    return { test_id: reqId(r, 'test_id'), ...(top !== undefined ? { top_n: top } : {}), ...(min !== undefined ? { min_score: min } : {}), ...(r.released_only === true ? { released_only: true } : {}) }
  },
  async propose(a, ctx) {
    const res = unwrap(await getExamResults(serviceUser(ctx.caller), a.test_id))
    const ids = pickShortlist(res.results, a)
    if (ids.length === 0) throw new ToolInputError('No candidates match that rule (graded submissions only).')
    a[DRAFT_KEY] = await sealDraft('shortlist_candidates', ctx.caller, { user_ids: ids })
    const ranked = rankResults(res.results.filter((r) => ids.includes(r.userId)))
    return {
      title: `Shortlist ${ids.length} candidate${ids.length === 1 ? '' : 's'} on “${clip(res.exam.title, 70)}”`,
      preview: {
        fields: { Rule: [a.top_n ? `top ${a.top_n}` : '', a.min_score !== undefined ? `score ≥ ${a.min_score}%` : ''].filter(Boolean).join(', '), Candidates: ids.length },
        candidates: ranked.slice(0, 25).map((r) => ({ rank: r.rank, name: clip(r.name, 60), email: r.email, score: r.score })),
      },
    }
  },
  async execute(a, ctx) {
    const sealed = await openDraft<{ user_ids: string[] }>('shortlist_candidates', ctx.caller, a[DRAFT_KEY])
    const ids = sealed?.user_ids ?? pickShortlist(unwrap(await getExamResults(serviceUser(ctx.caller), a.test_id)).results, a)
    if (!ids.length) return { ok: false, message: 'No candidates match that rule any more.' }
    const p = parseOutcomeUpdate({ exam_id: a.test_id, user_ids: ids, status: 'shortlisted' })
    if (!p.ok) return { ok: false, message: p.error }
    const r = await recordHiringOutcomes(serviceUser(ctx.caller), p.value)
    if (!r.ok) return { ok: false, message: friendlyServiceError(r) }
    return { ok: true, message: `Shortlisted ${r.data.updated.length} candidate${r.data.updated.length === 1 ? '' : 's'}.`, link: testResultsLink(a.test_id), data: r.data }
  },
})

// ─── revoke_certificate ──────────────────────────────────────────────────────

export const revokeCertificateTool = writeTool<{ certificate_id: string; reason: string }>({
  name: 'revoke_certificate',
  risk: 'delete',
  description: 'Revoke one issued certificate with a reason (the public verify page then shows it as revoked). Certificate ids are in get_test_results.',
  parameters: {
    type: 'object',
    properties: { certificate_id: { type: 'string' }, reason: { type: 'string', maxLength: 500 } },
    required: ['certificate_id', 'reason'],
  },
  parse(raw) {
    const r = argsObject(raw, ['certificate_id', 'reason'])
    const id = reqString(r, 'certificate_id', { max: 100 })
    const reason = reqString(r, 'reason', { max: 500 })
    if (!CERT_ID_RE.test(id)) throw new ToolInputError('Invalid certificate id.')
    const problem = revokeInputProblem(id, reason)
    if (problem) throw new ToolInputError(problem)
    return { certificate_id: id, reason }
  },
  async propose(a, ctx) {
    const cert = await findRevocableCertificate(serviceUser(ctx.caller), a.certificate_id)
    if (!cert) throw new ToolInputError('Certificate not found (or not one of your organisation\'s).')
    if (cert.revoked_at) throw new ToolInputError('This certificate is already revoked.')
    const db = await getMongoDb()
    const holder = cert.user_id ? await db.collection('user').findOne(
      { $or: [{ id: String(cert.user_id) }, { _id: String(cert.user_id) }] } as never,
      { projection: { name: 1, fullName: 1, email: 1 } },
    ) : null
    return {
      title: `Revoke certificate ${a.certificate_id}`,
      preview: {
        fields: {
          Certificate: String(cert.title || cert.certification_title || cert.certification_id || a.certificate_id),
          Holder: holder ? `${holder.fullName || holder.name || ''} ${holder.email ? `<${holder.email}>` : ''}`.trim() : String(cert.user_id || '—'),
          Issued: String(cert.issued_at || '—'),
          Reason: a.reason,
        },
        notes: ['This cannot be undone. The verify page will show the certificate as revoked.'],
      },
    }
  },
  async execute(a, ctx) {
    const r = await revokeCertificate(serviceUser(ctx.caller), a.certificate_id, a.reason, 'agent')
    if (!r.ok) return { ok: false, message: friendlyServiceError(r) }
    return { ok: true, message: 'Certificate revoked.', data: r.data }
  },
})

