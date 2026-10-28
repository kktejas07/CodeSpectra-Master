/** Read tools: recruiter analytics (funnel, pass rates, predictive validity) and plan usage. */
import { getMongoDb } from '@/lib/mongodb'
import { examIdFromTargetUrl } from '@/lib/exam-access'
import { getPredictiveValidity } from '@/lib/services/validity'
import { readTool } from '../define'
import { argsObject, optId } from '../args'
import { serviceUser, tenantFilter, unwrap } from '../scope'
import { loadExam } from '../loaders'
import { inviteState, type InviteState } from './tests'
import { clip } from '../output'

type Doc = Record<string, any>

const rate = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null)

export const getAnalyticsTool = readTool({
  name: 'get_analytics',
  description: 'Recruiter analytics for your tests (or one test): invite → start → submit → release funnel, pass rates, and the predictive-validity summary (do scores predict hiring outcomes).',
  parameters: { type: 'object', properties: { test_id: { type: 'string', description: 'Optional: one test.' } } },
  parse(raw) {
    const r = argsObject(raw, ['test_id'])
    return { testId: optId(r, 'test_id') }
  },
  async run(a, ctx) {
    const db = await getMongoDb()
    let exams: Doc[]
    if (a.testId) exams = [await loadExam(ctx.caller, a.testId)]
    else {
      exams = await db.collection('exams').find(tenantFilter(ctx.caller), { projection: { _id: 0, id: 1, title: 1, passing_score: 1 } })
        .sort({ createdAt: -1 }).limit(500).toArray()
    }
    const ids = exams.map((e) => String(e.id))
    const known = new Set(ids)
    const [invites, subs] = ids.length
      ? await Promise.all([
          db.collection('candidate_invites').find(
            { $or: [{ exam_id: { $in: ids } }, { target_url: { $in: ids.map((id) => `/assessment/${id}`) } }] },
            { projection: { _id: 0, exam_id: 1, target_url: 1, email: 1, user_id: 1, status: 1, expires_at: 1, created_at: 1 } },
          ).limit(20000).toArray(),
          db.collection('exam_submissions').find(
            { exam_id: { $in: ids } },
            { projection: { _id: 0, exam_id: 1, email: 1, user_id: 1, score_released: 1, passed: 1, score: 1, max_score: 1, has_pending_review: 1 } },
          ).limit(50000).toArray(),
        ])
      : [[], []]
    const done = new Set(subs.flatMap((s) => [`${s.exam_id}|${String(s.email || '').toLowerCase()}`, `${s.exam_id}|${s.user_id || ''}`]))
    // One row per person per test (re-invites expire the old row and add a new one).
    const latest = new Map<string, Doc>()
    for (const inv of invites) {
      const examId = String(inv.exam_id || examIdFromTargetUrl(inv.target_url) || '')
      if (!known.has(examId)) continue
      const k = `${examId}|${String(inv.email || inv.user_id || '').toLowerCase()}`
      const prev = latest.get(k)
      if (!prev || String(inv.created_at || '') > String(prev.created_at || '')) latest.set(k, { ...inv, _exam: examId })
    }
    const states: Record<InviteState, number> = { pending: 0, started: 0, submitted: 0, expired: 0 }
    for (const inv of latest.values()) {
      const submitted = done.has(`${inv._exam}|${String(inv.email || '').toLowerCase()}`) || (!!inv.user_id && done.has(`${inv._exam}|${inv.user_id}`))
      states[inviteState(inv, submitted)]++
    }
    const released = subs.filter((s) => s.score_released === true)
    const passed = released.filter((s) => s.passed === true).length
    const invited = latest.size
    const perTest = a.testId ? null : exams.slice(0, 10).map((e) => {
      const es = subs.filter((s) => s.exam_id === e.id)
      const er = es.filter((s) => s.score_released === true)
      return { id: e.id, title: clip(e.title, 80), submitted: es.length, released: er.length, pass_rate: rate(er.filter((s) => s.passed === true).length, er.length) }
    })
    const validity = unwrap(await getPredictiveValidity(serviceUser(ctx.caller), a.testId ?? null))
    const rep = validity.report
    return {
      data: {
        scope: a.testId ? { test_id: a.testId, title: exams[0]?.title } : { tests: ids.length },
        funnel: {
          invited,
          started: states.started + states.submitted,
          submitted: subs.length,
          released: released.length,
          passed,
          not_started: states.pending,
          expired_without_submitting: states.expired,
          start_rate: rate(states.started + states.submitted, invited),
          completion_rate: rate(states.submitted, invited),
          pass_rate_of_released: rate(passed, released.length),
          awaiting_review: subs.filter((s) => s.has_pending_review === true).length,
        },
        per_test: perTest,
        predictive_validity: {
          outcomes_recorded: rep.total,
          counts: rep.counts,
          min_sample: rep.minSample,
          score_vs_hire: rep.hire,
          score_vs_performance: rep.performance,
          hire_rate_by_score_band: rep.bands.map((b) => ({ band: b.label, candidates: b.candidates, hire_rate: b.hireRate })),
          excluded: validity.excluded,
          note: rep.hire.enough ? 'r is the Pearson correlation (−1…1).' : `Not enough decided outcomes yet (need ${rep.minSample}).`,
        },
      },
    }
  },
})

export const getPlanUsageTool = readTool({
  name: 'get_plan_usage',
  description: 'Your organisation\'s plan: entitlements, limits and current usage (assessments this month, seats) plus your AI credit balance.',
  parameters: { type: 'object', properties: {} },
  parse(raw) {
    argsObject(raw, [])
    return {}
  },
  async run(_a, ctx) {
    const [{ getTenantEntitlements, windowStart }, { limitFor, featureEnabled, LIMIT_KEYS }, { getUserAiCredits }] = await Promise.all([
      import('@/lib/entitlements'),
      import('@/lib/entitlements-core'),
      import('@/lib/user-credits'),
    ])
    const credits = await getUserAiCredits(ctx.caller.userId).catch(() => null)
    const tenantId = ctx.caller.tenantId
    if (!tenantId) {
      return { data: { plan: 'platform', note: 'Superadmins are not subject to plan limits. Pick an organisation to see its plan.', ai_credits: credits } }
    }
    const db = await getMongoDb()
    const [{ planKey, plan }, assessmentsThisMonth, { seatsInUse }] = await Promise.all([
      getTenantEntitlements(tenantId),
      db.collection('exams').countDocuments({ tenant_id: tenantId, createdAt: { $gte: windowStart('month') } }),
      import('@/lib/org-invitations'),
    ])
    const seats = await seatsInUse(tenantId)
    const fmt = (n: number) => (Number.isFinite(n) ? n : 'unlimited')
    const limits = Object.fromEntries(LIMIT_KEYS.map((k) => [k, fmt(limitFor(plan, k))]))
    const features = plan.features.filter((f) => f.type === 'boolean').map((f) => ({ key: f.key, label: f.label, enabled: featureEnabled(plan, f.key) }))
    const aLimit = limitFor(plan, 'max_assessments_per_month')
    const sLimit = limitFor(plan, 'max_seats')
    return {
      data: {
        plan: planKey,
        plan_name: plan.name,
        limits,
        usage: {
          assessments_this_month: { used: assessmentsThisMonth, limit: fmt(aLimit), remaining: Number.isFinite(aLimit) ? Math.max(0, aLimit - assessmentsThisMonth) : 'unlimited' },
          seats: { used: seats, limit: fmt(sLimit), remaining: Number.isFinite(sLimit) ? Math.max(0, sLimit - seats) : 'unlimited' },
        },
        features,
        ai_credits: credits,
        note: 'Candidate invites are not limited by plan; seats count organisation members and pending member invitations.',
      },
    }
  },
})
