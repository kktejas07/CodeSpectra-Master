/**
 * The four hiring agent loops (server only). Each body runs inside runLoop
 * (runtime.ts: owner re-auth, caps, claim, metering, run log); the selection
 * and scoring decisions are the pure functions in sourcer / scheduler /
 * author / integrity.ts.
 */
import 'server-only'
import { logger } from '@/lib/logger'
import type { AgentCaller } from '@/lib/agent/contract'
import { runLoop, type LoopRunContext, type LoopRunSummary } from './runtime'
import { countInvites, jobsToSource, pickShortlist, type SourcerJobState } from './sourcer'
import { classifyInterview, pickSlots, type OfferState, type SchedIv } from './scheduler'
import { evaluateDraft, nextStep, refinePlan, specFromJob, type DraftQuestion, type DryRunResult, type TestSpec } from './author'
import { caseFacts, rankCases, type CaseInput } from './integrity'
import { evidenceSummary } from './i18n'
import { LOOP_FEATURE, type LoopId } from './types'
import { getStates, setState, authorRequests, casesCol } from './store'

type Doc = Record<string, any>
type RunOpts = { trigger: 'cron' | 'manual'; by?: AgentCaller | null; now?: Date }
const DAY = 86_400_000

// ─── Hiring sourcer ─────────────────────────────────────────────────────────

async function sourcerBody(ctx: LoopRunContext<'sourcer'>): Promise<{ message: string; partial?: boolean }> {
  const { atsActorFor } = await import('@/lib/agent/tools/ats-shared')
  const actor = atsActorFor(ctx.caller!)
  const { getTalentSettings, talentInvites } = await import('@/lib/talent/db')
  if (!(await getTalentSettings()).enabled) return { message: 'Talent search is turned off on this platform.' }
  const { atsJobs, atsApplications } = await import('@/lib/ats/db')
  const p = ctx.settings.params
  const jobs = (await (await atsJobs()).find({ tenant_id: ctx.tenantId, status: 'open' }, { projection: { _id: 0 } }).sort({ created_at: -1 }).limit(100).toArray()) as Doc[]
  if (!jobs.length) return { message: 'No open jobs.' }
  const ids = jobs.map((j) => String(j.id))
  const since = new Date(ctx.now.getTime() - p.stall_days * DAY).toISOString()
  const [states, invites, recent, hired] = await Promise.all([
    getStates(ctx.tenantId, 'sourcer', ids),
    (await talentInvites()).find({ tenant_id: ctx.tenantId, target_type: 'job', target_id: { $in: ids } }, { projection: { _id: 0, target_id: 1, status: 1, expires_at: 1, handle: 1 } }).limit(5000).toArray(),
    (await atsApplications()).aggregate<{ _id: string; n: number }>([{ $match: { tenant_id: ctx.tenantId, job_id: { $in: ids }, created_at: { $gte: since } } }, { $group: { _id: '$job_id', n: { $sum: 1 } } }]).toArray(),
    (await atsApplications()).aggregate<{ _id: string; n: number }>([{ $match: { tenant_id: ctx.tenantId, job_id: { $in: ids }, status: 'hired' } }, { $group: { _id: '$job_id', n: { $sum: 1 } } }]).toArray(),
  ])
  const recentBy = new Map(recent.map((r) => [r._id, r.n]))
  const hiredBy = new Map(hired.map((r) => [r._id, r.n]))
  const state: SourcerJobState[] = jobs.map((j) => ({
    id: String(j.id), title: String(j.title || 'Job'), status: String(j.status), openings: Number(j.openings) || 0,
    last_sourced_at: (states.get(String(j.id))?.last_sourced_at as string | undefined) ?? null,
    recent_applications: recentBy.get(String(j.id)) ?? 0, hired: hiredBy.get(String(j.id)) ?? 0,
    invites: countInvites(invites.filter((i) => i.target_id === j.id), ctx.now),
  }))
  const plan = jobsToSource(state, ctx.now, p)
  if (!plan.length) return { message: 'Every open job is sourced or waiting for replies.' }
  const { bestMatches } = await import('@/lib/job-match/service')
  let drafted = 0
  for (const target of plan) {
    if (ctx.itemsLeft() <= 0) break
    const job = jobs.find((j) => j.id === target.id)!
    let results: Awaited<ReturnType<typeof bestMatches>>['results'] = []
    try {
      results = (await bestMatches(actor, job as never)).results
    } catch (e) {
      ctx.note({ kind: 'job', ref: target.id, title: target.title, note: (e as Error).message.slice(0, 200) })
      if ((e as { status?: number }).status === 429) break
      continue
    }
    const exclude = new Set(invites.filter((i) => i.target_id === target.id).map((i) => String(i.handle)))
    const picks = pickShortlist(results, exclude, target.min_match, target.limit)
    const st = state.find((s) => s.id === target.id)!
    await setState(ctx.tenantId, 'sourcer', target.id, { last_sourced_at: ctx.now.toISOString(), mode: target.mode, invites: st.invites, recent_applications: st.recent_applications, picked: picks.length })
    if (!picks.length) { ctx.note({ kind: 'job', ref: target.id, title: target.title, note: `no new matches ≥ ${target.min_match}` }); continue }
    const r = await ctx.propose('send_invites', { job_id: target.id, handles: picks.map((x) => x.handle) }, { kind: target.mode, ref: target.id })
    if (r.ok) drafted++
  }
  return { message: `Drafted invite shortlists for ${drafted} of ${plan.length} job(s).`, partial: drafted < plan.length && ctx.itemsLeft() <= 0 }
}

// ─── Interview scheduler ────────────────────────────────────────────────────

async function schedulerBody(ctx: LoopRunContext<'scheduler'>): Promise<{ message: string }> {
  const p = ctx.settings.params
  const [{ atsInterviews }, svc, { atsApplications }] = await Promise.all([import('@/lib/ats/interviews/db'), import('@/lib/ats/interviews/service'), import('@/lib/ats/db')])
  const recentEnd = new Date(ctx.now.getTime() - 7 * DAY).toISOString()
  const rows = (await (await atsInterviews()).find(
    { tenant_id: ctx.tenantId, $or: [{ status: 'awaiting_schedule' }, { status: { $in: ['no_show', 'cancelled'] }, updated_at: { $gte: recentEnd } }] },
    { projection: { _id: 0 } },
  ).sort({ created_at: 1 }).limit(200).toArray()) as Doc[]
  if (!rows.length) return { message: 'No interviews need a time.' }
  const apps = await (await atsApplications()).find({ tenant_id: ctx.tenantId, id: { $in: rows.map((r) => r.application_id) } }, { projection: { _id: 0, id: 1, status: 1, stage_id: 1 } }).toArray()
  const appBy = new Map(apps.map((a) => [a.id, a]))
  const states = await getStates(ctx.tenantId, 'scheduler', rows.map((r) => String(r.id)))
  let drafted = 0
  for (const iv of rows) {
    if (ctx.itemsLeft() <= 0) break
    const app = appBy.get(iv.application_id)
    const s: SchedIv = {
      id: iv.id, status: iv.status, created_at: iv.created_at, updated_at: iv.updated_at, requested_slot: iv.requested_slot ?? null,
      self_schedule: !!iv.self_schedule, panel_count: (iv.panel || []).length, app_in_stage: !!app && app.status === 'active' && app.stage_id === iv.stage_id,
    }
    const act = classifyInterview(s, (states.get(iv.id) as OfferState | undefined) ?? null, ctx.now, p)
    if (!act) continue
    if (act.action === 'book_requested') {
      const r = await ctx.propose('book_requested', { application_id: iv.application_id, scheduled_at: act.slot }, { kind: 'book_requested', ref: iv.id })
      if (r.ok) drafted++
      continue
    }
    const { slots, timezone } = await svc.slotsFor({ ...iv, status: 'awaiting_schedule' } as never, ctx.now)
    const offer = pickSlots(slots, p.slots_offered, timezone, ctx.now)
    if (!offer.length) { ctx.note({ kind: act.reason, ref: iv.id, title: String(iv.candidate_name || 'Interview'), note: 'no free panel time in the next 15 days' }); continue }
    const r = await ctx.propose('offer_slots', { interview_id: iv.id, slots: offer.map((x) => x.start) }, { kind: act.reason, ref: iv.id })
    if (r.ok) {
      drafted++
      // A proposal counts as an offer for pacing (the tool counts deliveries too).
      if (!r.auto_sent) {
        const prev = (states.get(iv.id) as OfferState | undefined)
        await setState(ctx.tenantId, 'scheduler', iv.id, { offers: prev?.offers ?? 0, last_offer_at: ctx.now.toISOString(), last_slots: offer.map((x) => x.start), proposed: true })
      }
    }
  }
  return { message: `Drafted ${drafted} scheduling action(s) from ${rows.length} open interview(s).` }
}

// ─── Assessment author ──────────────────────────────────────────────────────

async function jdSkills(ctx: LoopRunContext<'author'>, jd: string): Promise<string[]> {
  const { dictionarySkillsIn } = await import('@/lib/ats/skills')
  const found = dictionarySkillsIn(jd).slice(0, 8)
  if (found.length >= 3 || !ctx.aiAllowed() || jd.length < 80) return found
  try {
    const [{ backendComplete }, { fenceUntrusted, untrustedRule, scanUntrusted }] = await Promise.all([import('@/lib/ai/backend'), import('@/lib/ai/untrusted-input')])
    const flagged = scanUntrusted(jd).flagged
    const res = await backendComplete({
      systemMessage: `You list the technical skills a job description asks for. Return JSON {"skills": string[]} with at most 8 short skill names. ${untrustedRule(['document'])}`,
      userMessage: fenceUntrusted('document', jd, 8000),
      modelRole: 'fast', responseFormat: 'json', feature: LOOP_FEATURE.author, cache: !flagged,
    })
    const list = Array.isArray((res.json as Doc | undefined)?.skills) ? ((res.json as Doc).skills as unknown[]) : []
    return [...new Set([...found, ...list.filter((x): x is string => typeof x === 'string').map((x) => x.trim().slice(0, 40)).filter((x) => /^[\w .+#/-]{1,40}$/.test(x))])].slice(0, 8)
  } catch {
    return found
  }
}

/** Synthetic candidate: the key must score full marks, a wrong / empty answer must not. */
async function dryRun(ctx: LoopRunContext<'author'>, qs: DraftQuestion[], aiGrades: number): Promise<DryRunResult[]> {
  const [{ gradeAnswer }, { isDeterministicType }] = await Promise.all([import('@/lib/ai/grade-question'), import('@/lib/question-types')])
  const out: DryRunResult[] = []
  let ai = 0
  for (const q of qs as Doc[]) {
    const max = Number(q.score) || 1
    if (isDeterministicType(q.type)) {
      if (!q.answer) { out.push({ id: q.id, correct_ratio: 0, wrong_ratio: null, ai: false }); continue }
      try {
        const right = await gradeAnswer({ questionText: q.prompt || q.title, candidateAnswer: String(q.answer), modelAnswer: String(q.answer), type: q.type, maxPoints: max, options: q.options, question: q })
        const wrongOpt = (q.options || []).find((o: string) => o !== q.answer)
        const wrong = wrongOpt !== undefined
          ? await gradeAnswer({ questionText: q.prompt || q.title, candidateAnswer: String(wrongOpt), modelAnswer: String(q.answer), type: q.type, maxPoints: max, options: q.options, question: q })
          : null
        out.push({ id: q.id, correct_ratio: right.recommended / max, wrong_ratio: wrong ? wrong.recommended / max : null, ai: false })
      } catch {
        out.push({ id: q.id, correct_ratio: null, wrong_ratio: null, ai: false })
      }
      continue
    }
    if (ai >= aiGrades || !ctx.aiAllowed()) continue
    ai++
    try {
      const wrong = await gradeAnswer({ questionText: q.prompt || q.title, candidateAnswer: 'I am not sure.', modelAnswer: String(q.answer || ''), type: q.type, maxPoints: max, testCases: q.test_cases, question: q })
      out.push({ id: q.id, correct_ratio: null, wrong_ratio: wrong.recommended / max, ai: true })
    } catch {
      out.push({ id: q.id, correct_ratio: null, wrong_ratio: null, ai: true })
    }
  }
  return out
}

async function authorBody(ctx: LoopRunContext<'author'>): Promise<{ message: string; partial?: boolean }> {
  const col = await authorRequests()
  const nowIso = ctx.now.toISOString()
  const p = ctx.settings.params
  let done = 0
  while (ctx.itemsLeft() > 0 && done < 3) {
    // Claim the oldest queued request (or one whose worker died).
    const req = await col.findOneAndUpdate(
      { tenant_id: ctx.tenantId, $or: [{ status: 'queued' }, { status: 'working', lease_until: { $lt: nowIso } }], attempts: { $lt: 3 } },
      { $set: { status: 'working', lease_until: new Date(ctx.now.getTime() + 20 * 60_000).toISOString(), updated_at: nowIso }, $inc: { attempts: 1 } },
      { sort: { created_at: 1 }, returnDocument: 'after', projection: { _id: 0 } },
    )
    if (!req) break
    done++
    const finish = (set: Doc) => col.updateOne({ id: req.id, tenant_id: ctx.tenantId }, { $set: { ...set, lease_until: null, updated_at: new Date().toISOString() } })
    try {
      let job: Doc = { title: req.title || 'Role', skills: [] }
      let jd = req.jd_text || ''
      if (req.job_id) {
        const { atsJobs } = await import('@/lib/ats/db')
        const j = await (await atsJobs()).findOne({ id: req.job_id, tenant_id: ctx.tenantId }, { projection: { _id: 0 } })
        if (!j) { await finish({ status: 'failed', message: 'Job not found' }); continue }
        job = j as Doc
        jd = jd || [j.description, j.requirements].filter(Boolean).join('\n\n')
      }
      const spec: TestSpec = specFromJob({ title: String(job.title || req.title || 'Role'), skills: job.skills, experience_min: job.experience_min, experience_max: job.experience_max }, jd ? await jdSkills(ctx, jd) : [], p)
      if (req.title) spec.title = req.title.slice(0, 200)
      const { buildExamQuestionList, TYPE_POOL_BY_SCREENING } = await import('@/lib/services/exams')
      const BAND_LEVEL: Record<string, string> = { intern: 'Beginner', entry: 'Beginner', mid: 'Intermediate', senior: 'Advanced', lead: 'Advanced' }
      const build = async (skills: string[], count: number, mix: TestSpec['mix']): Promise<DraftQuestion[]> => {
        if (count <= 0) return []
        if (!ctx.aiAllowed()) {
          // Out of AI budget: approved bank questions only (deterministic fallback).
          const { sampleFromBank, bankToExamQuestion } = await import('@/lib/question-bank')
          const picked = await sampleFromBank({ types: TYPE_POOL_BY_SCREENING[spec.screening_type], subjects: skills, count, difficultySplit: mix }).catch(() => [])
          return picked.map((b) => bankToExamQuestion(b) as unknown as DraftQuestion)
        }
        return (await buildExamQuestionList({
          count, allowedTypes: TYPE_POOL_BY_SCREENING[spec.screening_type], techStack: skills, level: BAND_LEVEL[spec.experience_band],
          subject: spec.role, duration: spec.duration_minutes, context: jd ? jd.slice(0, 6000) : undefined, difficultySplit: mix,
        })) as unknown as DraftQuestion[]
      }
      let qs = await build(spec.skills, spec.question_count, spec.mix)
      let round = 1
      let ev = evaluateDraft(qs, spec, await dryRun(ctx, qs, p.dry_run_ai_grades), p)
      const rounds: Doc[] = [{ round, count: qs.length, coverage: ev.coverage_pct, broken: ev.broken.length, mix: ev.mix }]
      let step = nextStep(ev, round, p)
      while (step === 'refine') {
        const plan = refinePlan(ev, spec)
        qs = qs.filter((q) => !plan.drop.includes(q.id))
        const more = await build(plan.fill.skills, plan.fill.count, plan.fill.mix)
        qs = [...qs, ...more].slice(0, Math.max(spec.question_count, qs.length))
        round++
        ev = evaluateDraft(qs, spec, await dryRun(ctx, more, p.dry_run_ai_grades), p)
        rounds.push({ round, count: qs.length, coverage: ev.coverage_pct, broken: ev.broken.length, mix: ev.mix })
        step = nextStep(ev, round, p)
      }
      const final = qs.filter((q) => !ev.broken.some((b) => b.id === q.id))
      const report = { spec: { skills: spec.skills, band: spec.experience_band, target: spec.question_count, mix: spec.mix }, rounds, coverage_pct: ev.coverage_pct, missing_skills: ev.missing_skills, ai: ctx.aiAllowed() }
      if (step === 'give_up' || !final.length) { await finish({ status: 'gave_up', message: 'Could not reach a usable draft.', report }); continue }
      // Hand create_test exactly this draft: seal it for the owner and pass it as the "prior" draft (the edit path, AGT-002).
      const { sealDraft } = await import('@/lib/agent/tools/seal')
      const args = {
        title: spec.title, role: spec.role, experience_band: spec.experience_band, duration_minutes: spec.duration_minutes,
        skills: spec.skills, screening_type: spec.screening_type, question_count: final.length,
      }
      const sealed = await sealDraft('create_test', ctx.caller!, { questionList: final, sections: null, warnings: ev.ok ? [] : [`Coverage ${ev.coverage_pct}%${ev.missing_skills.length ? `; not covered: ${ev.missing_skills.join(', ')}` : ''}`] })
      const r = await ctx.propose('create_draft_test', args, { kind: 'request', ref: req.id }, { priorArgs: { ...args, _draft: sealed } })
      await finish(r.ok ? { status: 'proposed', action_id: r.action?.id ?? null, message: r.auto_sent ? (r.result ?? 'Saved') : 'Waiting for confirmation', report } : { status: 'failed', message: (r.error || 'Could not draft').slice(0, 300), report })
    } catch (e) {
      logger.warn(`[hiring-agents] author request ${req.id} failed: ${(e as Error)?.message?.slice(0, 200)}`)
      await finish({ status: req.attempts >= 3 ? 'failed' : 'queued', message: 'The draft failed; it will be retried.' })
    }
  }
  return { message: done ? `Worked on ${done} request(s).` : 'No requests in the queue.' }
}

// ─── Integrity reviewer ─────────────────────────────────────────────────────

async function aiSummary(ctx: LoopRunContext<'integrity'>, facts: string[], fallback: string): Promise<string> {
  if (!ctx.settings.params.ai_summaries || !ctx.aiAllowed() || !facts.length) return fallback
  try {
    const { backendComplete } = await import('@/lib/ai/backend')
    const lang = ctx.locale === 'hi' ? 'Hindi' : ctx.locale === 'te' ? 'Telugu' : 'English'
    const res = await backendComplete({
      systemMessage: `You write a 2-3 sentence neutral evidence summary of test-integrity signals for a human reviewer, in ${lang}. Only restate the facts given; never accuse, never say "cheated", never recommend a penalty; end by saying these are signals, not proof. Return JSON {"summary": string}.`,
      userMessage: `Facts (codes: trust:<score>:<incidents>:<top types>, similar:<percent>:<other candidates>, ai:<level>:<signals>, review:<mark>):\n${facts.join('\n')}`,
      modelRole: 'fast', responseFormat: 'json', feature: LOOP_FEATURE.integrity,
    })
    const s = typeof (res.json as Doc | undefined)?.summary === 'string' ? String((res.json as Doc).summary).trim() : ''
    const { scanUntrusted } = await import('@/lib/ai/untrusted-input')
    return s && s.length <= 800 && !scanUntrusted(s).flagged && !/\b(cheat|cheated|fraud|guilty)\b/i.test(s) ? s : fallback
  } catch {
    return fallback
  }
}

async function integrityBody(ctx: LoopRunContext<'integrity'>): Promise<{ message: string }> {
  const { reportsCol } = await import('@/lib/integrity/store')
  const { loadTarget, listAttempts } = await import('@/lib/integrity/service')
  const since = new Date(ctx.now.getTime() - 14 * DAY).toISOString()
  const reports = await (await reportsCol()).find({ tenant_id: ctx.tenantId, status: 'done', finished_at: { $gte: since } }, { projection: { _id: 0 } }).sort({ finished_at: -1 }).limit(20).toArray()
  if (!reports.length) return { message: 'No finished integrity reports in the last 14 days.' }
  const { getMongoDb } = await import('@/lib/mongodb')
  const db = await getMongoDb()
  const p = ctx.settings.params
  const col = await casesCol()
  let cases = 0
  let drafted = 0
  for (const rep of reports) {
    if (rep.target_kind !== 'exam' && rep.target_kind !== 'contest') continue
    const t = await loadTarget(rep.target_kind, rep.target_id)
    if (!t || t.tenant_id !== ctx.tenantId) continue
    const attempts = await listAttempts(t, { limit: 500 })
    const subs = rep.target_kind === 'exam'
      ? await db.collection('exam_submissions').find({ exam_id: t.id }, { projection: { _id: 0, user_id: 1, score_released: 1, integrity_hold: 1 } }).limit(2000).toArray()
      : []
    const subBy = new Map(subs.map((s) => [String(s.user_id), s]))
    const users = new Set<string>([...attempts.map((a) => a.user_id), ...rep.questions.flatMap((q) => q.clusters.flatMap((c) => c.members.map((m) => m.user_id))), ...rep.ai.map((a) => a.user_id)])
    const inputs: CaseInput[] = [...users].map((uid) => {
      const a = attempts.find((x) => x.user_id === uid)
      let sim: CaseInput['similarity'] = null
      for (const q of rep.questions) for (const c of q.clusters) if (c.members.some((m) => m.user_id === uid) && (!sim || c.max_score > sim.max_score)) sim = { max_score: c.max_score, cluster_size: c.members.length, question: q.title, reviewed: c.review.status !== 'unreviewed' }
      const aiRows = rep.ai.filter((x) => x.user_id === uid)
      const order = { none: 0, low: 1, medium: 2, high: 3 } as const
      const top = aiRows.sort((x, y) => order[y.level] - order[x.level])[0]
      const name = a?.name || rep.questions.flatMap((q) => q.clusters.flatMap((c) => c.members)).find((m) => m.user_id === uid)?.name || aiRows[0]?.name || 'Candidate'
      const sub = subBy.get(uid)
      return {
        user_id: uid, name, attempt_id: a?.id ?? null,
        trust: a ? { score: a.trust.score, band: a.trust.band, incidents: a.trust.incidents, top: Object.entries(a.trust.by_type).filter(([, v]) => v.penalty > 0).sort((x, y) => y[1].penalty - x[1].penalty).slice(0, 3).map(([k, v]) => `${k} ×${v.count}`) } : null,
        review: (a?.review.status ?? 'unreviewed') as CaseInput['review'],
        similarity: sim,
        ai: top ? { level: top.level, labels: top.signals.map((s) => s.label).slice(0, 3) } : null,
        released: sub?.score_released === true, held: sub?.integrity_hold === true,
      }
    })
    const ranked = rankCases(inputs, p)
    for (const c of ranked) {
      const facts = caseFacts(c)
      const base = evidenceSummary(ctx.locale, c)
      const _id = `${ctx.tenantId}:${t.id}:${c.user_id}`
      const prev = await col.findOne({ _id }, { projection: { facts: 1, summary: 1, ai_summary: 1, action_id: 1, recommendation: 1 } })
      const same = prev && JSON.stringify(prev.facts) === JSON.stringify(facts)
      const summary = same && prev?.summary ? prev.summary : await aiSummary(ctx, facts, base)
      await col.updateOne({ _id }, {
        $set: {
          tenant_id: ctx.tenantId, target_kind: rep.target_kind, target_id: t.id, target_title: String(t.title || '').slice(0, 200), user_id: c.user_id, name: c.name.slice(0, 120),
          attempt_id: c.attempt_id, priority: c.priority, recommendation: c.recommendation, facts, summary, summary_locale: ctx.locale, held: c.held, released: c.released, updated_at: ctx.now.toISOString(),
        },
      }, { upsert: true })
      cases++
      // Draft a hold / release proposal once per (case, recommendation) — exams only (contests have no held scores).
      if (rep.target_kind !== 'exam' || c.recommendation === 'none' || !ctx.caller || ctx.itemsLeft() <= 0) continue
      if (prev?.action_id && prev.recommendation === c.recommendation) continue
      const step = c.recommendation === 'hold' ? 'hold_scores' : 'release_hold'
      const r = await ctx.propose(step, { test_id: t.id, user_ids: [c.user_id], hold: c.recommendation === 'hold', note: summary.slice(0, 500) }, { kind: step, ref: _id })
      if (r.ok) { drafted++; await col.updateOne({ _id }, { $set: { action_id: r.action?.id ?? null } }) }
    }
  }
  if (!cases) ctx.note({ kind: 'queue', ref: ctx.tenantId, title: 'queue', note: 'no cases with signals' })
  return { message: `${cases} case(s) in the review queue; ${drafted} proposal(s) drafted.` }
}

// ─── Entry points ───────────────────────────────────────────────────────────

export async function runHiringLoop(loop: LoopId, tenantId: string, opts: RunOpts): Promise<LoopRunSummary> {
  switch (loop) {
    case 'sourcer': return runLoop('sourcer', tenantId, opts, sourcerBody)
    case 'scheduler': return runLoop('scheduler', tenantId, opts, schedulerBody)
    case 'author': return runLoop('author', tenantId, opts, authorBody)
    case 'integrity': return runLoop('integrity', tenantId, { ...opts, allowNoOwner: true }, integrityBody)
  }
}
