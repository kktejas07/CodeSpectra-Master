/**
 * Read tools for tests (assessments): list, details, results, one candidate,
 * invites. Staff of the test's organisation only; no answer keys ever.
 */
import { getMongoDb } from '@/lib/mongodb'
import { ToolInputError } from '@/lib/agent/contract'
import { examIdFromTargetUrl, examPassPercent, identitySummary, isRiskProctorEvent, attemptSummary, submissionSectionScores } from '@/lib/exam-access'
import { resolveSections } from '@/lib/exam-sections'
import { sanitizeRegex } from '@/lib/sanitize'
import { OUTCOMES_COLLECTION } from '@/lib/hiring-outcomes'
import { getExamResults, type CandidateResultRow } from '@/lib/services/exam-results'
import { readTool } from '../define'
import { argsObject, optDate, optEnum, optInt, optString, paging, reqId, reqString, isEmail, optId } from '../args'
import { serviceUser, tenantFilter, unwrap } from '../scope'
import { loadExam, questionOutline, testLink, testResultsLink } from '../loaders'
import { clip } from '../output'

type Doc = Record<string, any>

const examSummary = (e: Doc) => ({
  id: e.id,
  title: clip(e.title, 120),
  role: clip(e.subject, 80) || null,
  level: e.level || null,
  status: e.published ? 'published' : 'draft',
  access: e.access_type || 'invite_only',
  duration_minutes: e.duration ?? null,
  questions: Array.isArray(e.questionList) ? e.questionList.length : Number(e.questions) || 0,
  pass_mark: examPassPercent(e),
  window: e.starts_at || e.ends_at ? { starts_at: e.starts_at || null, ends_at: e.ends_at || null } : null,
  created_at: e.createdAt || null,
  link: testLink(String(e.id)),
})

export const listTestsTool = readTool({
  name: 'list_tests',
  description: 'List your organisation\'s tests (assessments) with status, role, size and dates. Filter by status, role/title text and creation date. Use it to find a test id.',
  parameters: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['draft', 'published', 'any'], description: 'Default any.' },
      role: { type: 'string', description: 'Text matched against the test title and role/subject.', maxLength: 120 },
      created_after: { type: 'string', description: 'ISO date.' },
      created_before: { type: 'string', description: 'ISO date.' },
      page: { type: 'integer', minimum: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 50 },
    },
  },
  parse(raw) {
    const r = argsObject(raw, ['status', 'role', 'created_after', 'created_before', 'page', 'limit'])
    return {
      status: optEnum(r, 'status', ['draft', 'published', 'any'] as const) ?? 'any',
      role: optString(r, 'role', { max: 120 }),
      after: optDate(r, 'created_after'),
      before: optDate(r, 'created_before'),
      ...paging(r, 20, 50),
    }
  },
  async run(a, ctx) {
    const db = await getMongoDb()
    const filter: Doc = { ...tenantFilter(ctx.caller) }
    if (a.status === 'published') filter.published = true
    if (a.status === 'draft') filter.published = { $ne: true }
    if (a.role) {
      const re = { $regex: sanitizeRegex(a.role), $options: 'i' }
      filter.$or = [{ title: re }, { subject: re }]
    }
    if (a.after || a.before) filter.createdAt = { ...(a.after ? { $gte: a.after } : {}), ...(a.before ? { $lte: a.before } : {}) }
    const col = db.collection('exams')
    const [total, rows] = await Promise.all([
      col.countDocuments(filter),
      col.find(filter, { projection: { _id: 0, questionList: 0 } })
        .sort({ createdAt: -1 }).skip((a.page - 1) * a.limit).limit(a.limit).toArray(),
    ])
    // Question counts without loading the questions themselves.
    const counts = rows.length
      ? await col.aggregate([
          { $match: { id: { $in: rows.map((e) => e.id) } } },
          { $project: { _id: 0, id: 1, n: { $size: { $ifNull: ['$questionList', []] } } } },
        ]).toArray()
      : []
    const nById = new Map(counts.map((c) => [c.id, c.n]))
    const subs = rows.length
      ? await db.collection('exam_submissions').aggregate([
          { $match: { exam_id: { $in: rows.map((e) => e.id) } } },
          { $group: { _id: '$exam_id', submitted: { $sum: 1 }, released: { $sum: { $cond: [{ $eq: ['$score_released', true] }, 1, 0] } } } },
        ]).toArray()
      : []
    const subById = new Map(subs.map((s) => [s._id, s]))
    return {
      data: {
        total,
        page: a.page,
        tests: rows.map((e) => ({
          ...examSummary(e),
          questions: nById.get(e.id) ?? Number(e.questions) ?? 0,
          submissions: subById.get(e.id)?.submitted ?? 0,
          released: subById.get(e.id)?.released ?? 0,
        })),
      },
    }
  },
})

export const getTestTool = readTool({
  name: 'get_test',
  description: 'Settings, sections and a question summary (type, points, difficulty) for one test. Never includes answer keys.',
  parameters: {
    type: 'object',
    properties: { test_id: { type: 'string', description: 'Test id from list_tests.' } },
    required: ['test_id'],
  },
  parse(raw) {
    const r = argsObject(raw, ['test_id'])
    return { testId: reqId(r, 'test_id') }
  },
  async run(a, ctx) {
    const exam = await loadExam(ctx.caller, a.testId)
    const list = (Array.isArray(exam.questionList) ? exam.questionList : []) as Doc[]
    const byType: Record<string, number> = {}
    for (const q of list) byType[String(q.type || 'mcq')] = (byType[String(q.type || 'mcq')] || 0) + 1
    return {
      data: {
        ...examSummary(exam),
        settings: {
          screening_type: exam.screening_type || null,
          tech_stack: exam.techStack || [],
          allow_retake: exam.allow_retake === true,
          max_attempts: exam.max_attempts ?? 1,
          proctoring_mode: exam.proctoring_mode === 'strict' ? 'strict' : 'standard',
          require_id_verification: exam.require_id_verification !== false,
          require_face_capture: exam.require_face_capture !== false,
          no_camera_policy: exam.no_camera_policy === 'block' ? 'block' : 'allow_flag',
          issue_certificates: exam.issue_certificates !== false,
          kind: exam.kind === 'cad' ? 'cad' : 'standard',
        },
        total_points: list.reduce((s, q) => s + (Number(q.score ?? q.points) || 0), 0),
        questions_by_type: byType,
        sections: questionOutline(exam, { promptChars: 90 }),
      },
    }
  },
})

/** Candidate rows ranked by score (best first); unscored rows last. */
export function rankResults(rows: CandidateResultRow[]): Array<CandidateResultRow & { rank: number | null }> {
  const scored = rows.filter((r) => typeof r.score === 'number').sort((a, b) => (b.score as number) - (a.score as number))
  const out: Array<CandidateResultRow & { rank: number | null }> = []
  let prev: number | null = null
  let rank = 0
  scored.forEach((r, i) => {
    if (r.score !== prev) { rank = i + 1; prev = r.score }
    out.push({ ...r, rank })
  })
  for (const r of rows) if (typeof r.score !== 'number') out.push({ ...r, rank: null })
  return out
}

export const getTestResultsTool = readTool({
  name: 'get_test_results',
  description: 'Ranked results for one test: score, section scores, integrity flags, review/identity flags, release state and outcome per candidate. Paginated.',
  parameters: {
    type: 'object',
    properties: {
      test_id: { type: 'string' },
      status: { type: 'string', enum: ['all', 'submitted', 'not_submitted', 'needs_review', 'unreleased'], description: 'Default all.' },
      page: { type: 'integer', minimum: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 50, description: 'Default 20.' },
    },
    required: ['test_id'],
  },
  parse(raw) {
    const r = argsObject(raw, ['test_id', 'status', 'page', 'limit'])
    return {
      testId: reqId(r, 'test_id'),
      status: optEnum(r, 'status', ['all', 'submitted', 'not_submitted', 'needs_review', 'unreleased'] as const) ?? 'all',
      ...paging(r, 20, 50),
    }
  },
  async run(a, ctx) {
    const res = unwrap(await getExamResults(serviceUser(ctx.caller), a.testId))
    let rows = rankResults(res.results)
    const submitted = rows.filter((r) => r.status === 'completed')
    if (a.status === 'submitted') rows = rows.filter((r) => r.status === 'completed')
    if (a.status === 'not_submitted') rows = rows.filter((r) => r.status !== 'completed')
    if (a.status === 'needs_review') rows = rows.filter((r) => r.needsReview || r.identityReview)
    if (a.status === 'unreleased') rows = rows.filter((r) => r.status === 'completed' && !r.released)
    const scores = submitted.map((r) => r.score).filter((s): s is number => typeof s === 'number')
    const pass = typeof res.exam.passing_score === 'number' ? res.exam.passing_score : null
    const page = rows.slice((a.page - 1) * a.limit, a.page * a.limit)
    return {
      data: {
        test: { id: res.exam.id, title: res.exam.title, pass_mark: pass, sections: res.exam.sections, link: testResultsLink(a.testId) },
        summary: {
          candidates: res.results.length,
          submitted: submitted.length,
          released: submitted.filter((r) => r.released).length,
          needs_review: submitted.filter((r) => r.needsReview).length,
          identity_review: submitted.filter((r) => r.identityReview).length,
          average_score: scores.length ? Math.round(scores.reduce((x, y) => x + y, 0) / scores.length) : null,
          passing: pass === null ? null : scores.filter((s) => s >= pass).length,
        },
        total: rows.length,
        page: a.page,
        rows: page.map((r) => ({
          rank: r.rank,
          user_id: r.userId || null,
          name: clip(r.name, 60),
          email: r.email,
          status: r.status,
          score: r.score,
          sections: (r.sectionScores || []).map((s) => ({ title: s.title, percent: s.percent })),
          integrity_flags: r.proctoringFlags,
          needs_review: r.needsReview,
          identity_review: r.identityReview === true,
          released: r.released,
          outcome: r.outcome ?? null,
          certificate: r.certificate ? (r.certificate.revokedAt ? 'revoked' : 'issued') : null,
          certificate_id: r.certificate?.id ?? null,
          attempt: r.attemptNo ? `${r.attemptNo}/${r.maxAttempts}` : null,
          submitted_at: r.submittedAt,
        })),
      },
    }
  },
})

export const getCandidateTool = readTool({
  name: 'get_candidate',
  description: 'One candidate on one test: attempt summary, section scores, proctoring summary, identity review and hiring outcome. Staff only. Find the candidate with get_test_results first.',
  parameters: {
    type: 'object',
    properties: {
      test_id: { type: 'string' },
      candidate: { type: 'string', description: 'The candidate\'s user id or email.' },
    },
    required: ['test_id', 'candidate'],
  },
  parse(raw) {
    const r = argsObject(raw, ['test_id', 'candidate'])
    const candidate = reqString(r, 'candidate', { max: 254 })
    if (!isEmail(candidate.toLowerCase()) && !/^[A-Za-z0-9_-]{1,128}$/.test(candidate)) throw new ToolInputError('`candidate` must be a user id or an email.')
    return { testId: reqId(r, 'test_id'), candidate }
  },
  async run(a, ctx) {
    const exam = await loadExam(ctx.caller, a.testId)
    const db = await getMongoDb()
    const who = a.candidate.trim()
    const byEmail = isEmail(who.toLowerCase())
    const subFilter = byEmail
      ? { exam_id: a.testId, email: { $regex: `^${sanitizeRegex(who)}$`, $options: 'i' } }
      : { exam_id: a.testId, user_id: who }
    const subs = await db.collection('exam_submissions').find(subFilter, { projection: { _id: 0, answers: 0, code: 0 } }).toArray()
    const sub = subs.sort((x, y) => String(y.created_at || '').localeCompare(String(x.created_at || '')))[0] as Doc | undefined
    const userId = sub?.user_id ? String(sub.user_id) : byEmail ? null : who
    const invite = await db.collection('candidate_invites').findOne(
      {
        $and: [
          { $or: [{ exam_id: a.testId }, { target_url: { $regex: `/assessment/${sanitizeRegex(a.testId)}(?:[/?]|$)` } }] },
          byEmail ? { email: who.toLowerCase() } : { user_id: who },
        ],
      },
      { sort: { created_at: -1 }, projection: { _id: 0, token: 0 } },
    )
    if (!sub && !invite) throw new ToolInputError('No submission or invite for that candidate on this test.')

    let proctoring: Doc | null = null
    if (userId) {
      const events = await db.collection('proctor_events')
        .find({ session_kind: 'exam', session_id: a.testId, user_id: userId }, { projection: { _id: 0, event_type: 1 } })
        .limit(2000).toArray()
      const byType: Record<string, number> = {}
      let risk = 0
      for (const e of events) {
        byType[String(e.event_type)] = (byType[String(e.event_type)] || 0) + 1
        if (isRiskProctorEvent(e.event_type)) risk++
      }
      proctoring = { risk_events: risk, total_events: events.length, by_type: byType }
    }
    const outcome = userId ? await db.collection(OUTCOMES_COLLECTION).findOne({ exam_id: a.testId, user_id: userId }, { projection: { _id: 0 } }) : null
    const summary = sub ? attemptSummary(sub, exam) : null
    const pctOf = (s?: { score: number; max_score: number } | null) => (s && s.max_score > 0 ? Math.round((s.score / s.max_score) * 100) : null)
    const ic = sub?.identity_check ?? null
    return {
      data: {
        test: { id: exam.id, title: exam.title, pass_mark: examPassPercent(exam), sections: resolveSections(exam).map((s) => s.title) },
        candidate: { user_id: userId, email: sub?.email || invite?.email || (byEmail ? who : null), name: invite?.full_name || null },
        invite: invite ? { status: invite.status, sent_at: invite.created_at, expires_at: invite.expires_at, delivery: invite.delivery_status || null } : null,
        attempt: sub && summary ? {
          status: sub.has_pending_review === true ? 'needs_review' : 'graded',
          score_percent: pctOf(summary.latest),
          best_percent: pctOf(summary.best),
          attempt: `${summary.attempt_no}/${summary.max_attempts}`,
          released: summary.latest.released,
          passed: typeof sub.passed === 'boolean' ? sub.passed : null,
          submitted_at: sub.submitted_at || sub.created_at || null,
          time_minutes: typeof sub.total_time_ms === 'number' ? Math.round(sub.total_time_ms / 60000) : null,
          sections: submissionSectionScores(exam, sub).map((s) => ({ title: s.title, percent: s.percent })),
        } : null,
        proctoring,
        identity: ic ? identitySummary(ic as Doc) : null,
        outcome: outcome ? {
          status: outcome.status ?? null,
          ratings: outcome.ratings ?? null,
          last_change: Array.isArray(outcome.history) ? outcome.history[outcome.history.length - 1] ?? null : null,
        } : null,
        link: testResultsLink(a.testId),
      },
    }
  },
})

// ─── Invites ─────────────────────────────────────────────────────────────────

export type InviteState = 'pending' | 'started' | 'submitted' | 'expired'

/** Where an invite stands for its test (pure). */
export function inviteState(inv: Doc, submitted: boolean, now = Date.now()): InviteState {
  if (submitted) return 'submitted'
  const status = String(inv.status || 'pending')
  if (status === 'expired' || status === 'revoked') return 'expired'
  const exp = new Date(String(inv.expires_at || '')).getTime()
  if (Number.isFinite(exp) && exp < now) return 'expired'
  if (status === 'used' || status === 'active') return 'started'
  return 'pending'
}

export const listInvitesTool = readTool({
  name: 'list_invites',
  description: 'Candidate invites with their state: pending (not started), started, submitted or expired. Optionally for one test.',
  parameters: {
    type: 'object',
    properties: {
      test_id: { type: 'string', description: 'Optional: only this test.' },
      status: { type: 'string', enum: ['pending', 'started', 'submitted', 'expired', 'any'] },
      page: { type: 'integer', minimum: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 50 },
    },
  },
  parse(raw) {
    const r = argsObject(raw, ['test_id', 'status', 'page', 'limit'])
    return {
      testId: optId(r, 'test_id'),
      status: optEnum(r, 'status', ['pending', 'started', 'submitted', 'expired', 'any'] as const) ?? 'any',
      ...paging(r, 25, 50),
    }
  },
  async run(a, ctx) {
    const db = await getMongoDb()
    let examIds: string[]
    const titles = new Map<string, string>()
    if (a.testId) {
      const exam = await loadExam(ctx.caller, a.testId)
      examIds = [a.testId]
      titles.set(a.testId, String(exam.title || ''))
    } else {
      const exams = await db.collection('exams').find(tenantFilter(ctx.caller), { projection: { _id: 0, id: 1, title: 1 } })
        .sort({ createdAt: -1 }).limit(500).toArray()
      examIds = exams.map((e) => String(e.id))
      for (const e of exams) titles.set(String(e.id), String(e.title || ''))
    }
    if (examIds.length === 0) return { data: { total: 0, invites: [] } }
    const all = !a.testId && ctx.caller.role === 'superadmin' && !ctx.caller.tenantId
    const invites = await db.collection('candidate_invites').find(
      all ? {} : { $or: [{ exam_id: { $in: examIds } }, { target_url: { $in: examIds.map((id) => `/assessment/${id}`) } }] },
      { projection: { _id: 0, token: 0 } },
    ).sort({ created_at: -1 }).limit(2000).toArray()
    const known = new Set(examIds)
    const scoped = invites
      .map((inv) => ({ inv, examId: String(inv.exam_id || examIdFromTargetUrl(inv.target_url) || '') }))
      .filter((x) => x.examId && known.has(x.examId))
    const subs = await db.collection('exam_submissions').find(
      { exam_id: { $in: [...new Set(scoped.map((x) => x.examId))] } },
      { projection: { _id: 0, exam_id: 1, email: 1, user_id: 1 } },
    ).toArray()
    const done = new Set(subs.flatMap((s) => [`${s.exam_id}|${String(s.email || '').toLowerCase()}`, `${s.exam_id}|${s.user_id || ''}`]))
    const now = Date.now()
    const rows = scoped.map(({ inv, examId }) => {
      const submitted = done.has(`${examId}|${String(inv.email || '').toLowerCase()}`) || (!!inv.user_id && done.has(`${examId}|${inv.user_id}`))
      return { inv, examId, state: inviteState(inv, submitted, now) }
    })
    const counts = { pending: 0, started: 0, submitted: 0, expired: 0 } as Record<InviteState, number>
    for (const r of rows) counts[r.state]++
    const filtered = a.status === 'any' ? rows : rows.filter((r) => r.state === a.status)
    const page = filtered.slice((a.page - 1) * a.limit, a.page * a.limit)
    return {
      data: {
        counts,
        total: filtered.length,
        page: a.page,
        invites: page.map(({ inv, examId, state }) => ({
          invite_id: inv.id,
          email: inv.email,
          name: clip(inv.full_name, 60),
          test_id: examId,
          test: clip(titles.get(examId), 80),
          state,
          sent_at: inv.created_at || null,
          expires_at: inv.expires_at || null,
          delivery: inv.delivery_status || null,
        })),
      },
    }
  },
})
