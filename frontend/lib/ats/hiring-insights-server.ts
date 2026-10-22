/**
 * Employer hiring analytics — tenant-scoped Mongo aggregation pipelines.
 *
 * Every query starts from the actor's job scope (lib/ats/http jobScopeFilter:
 * tenant + role rules) and filters on tenant_id again; the tenant never comes
 * from the request. Pipelines return aggregates only (counts, sums, durations
 * per stage); lib/ats/hiring-insights.ts and ./psychometrics.ts shape them.
 *
 * Collections added here:
 *   ats_performance_ratings   30 / 90-day on-the-job rating (1–5) per hired application
 *   ats_analytics_digest      per-tenant weekly digest switch + per-user opt-outs
 *   ats_analytics_digest_log  one row per (tenant, week, user) — the send is idempotent
 */
import 'server-only'
import type { Collection, Document } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'
import { nowIso, newId } from '@/lib/db/ids'
import type { AtsActor, AtsJob, StageType } from './contract'
import { atsApplications, atsCandidates, atsJobs } from './db'
import { atsCollection, atsMembers } from './access'
import { jobScopeFilter } from './http'
import { median } from './analytics'
import { correlate, MIN_SAMPLE } from '@/lib/hiring-outcomes'
import { describe, histogram, itemStatsFromSums, type ItemStats } from './psychometrics'
import {
  calibration, digestRange, digestUnsubToken, digestWeekKey, digestWorthSending, funnelRows, offerSummary, sourceRows,
  type DigestNumbers, type FunnelStage, type InsightFilters, type InterviewerAgg, type SourceAgg,
} from './hiring-insights'

type Doc = Record<string, any>
const DAY = 86_400_000
const TYPE_ORDER: StageType[] = ['applied', 'screening', 'assessment', 'bot_screen', 'virtual_interview', 'f2f_interview', 'client_review', 'hr_round', 'bgv', 'custom', 'offer', 'hired']
const INTERVIEW_TYPES: StageType[] = ['virtual_interview', 'f2f_interview']
const NON_SCORED = new Set(['likert', 'rating'])

// ─── Indexes for the analytics reads (idempotent, once per process) ──────────

let indexed: Promise<unknown> | null = null
function ensureIndexes(): Promise<unknown> {
  indexed ??= (async () => {
    const db = await getMongoDb()
    await Promise.all([
      db.collection('ats_applications').createIndex({ tenant_id: 1, job_id: 1, created_at: -1 }, { name: 'ats_applications_tenant_job_created' }),
      db.collection('ats_applications').createIndex({ tenant_id: 1, status: 1, updated_at: -1 }, { name: 'ats_applications_tenant_status_updated' }),
      db.collection('ats_interviews').createIndex({ tenant_id: 1, job_id: 1, created_at: -1 }, { name: 'ats_interviews_tenant_job_created' }),
      db.collection('exam_submissions').createIndex({ exam_id: 1, submitted_at: -1 }, { name: 'exam_submissions_exam_submitted' }),
      db.collection('ats_performance_ratings').createIndex({ application_id: 1, period: 1 }, { unique: true, name: 'apr_app_period' }),
      db.collection('ats_performance_ratings').createIndex({ tenant_id: 1, job_id: 1 }, { name: 'apr_tenant_job' }),
      db.collection('ats_analytics_digest').createIndex({ tenant_id: 1 }, { unique: true, name: 'aad_tenant' }),
      db.collection('ats_analytics_digest_log').createIndex({ key: 1 }, { unique: true, name: 'aadl_key' }),
      db.collection('ats_analytics_digest_log').createIndex({ created_at: 1 }, { expireAfterSeconds: 180 * 86400, name: 'aadl_ttl' }),
    ])
  })().catch((e) => { indexed = null; console.error('[ats insights] index build failed:', (e as Error)?.message) })
  return indexed
}

async function col<T extends Document>(name: string): Promise<Collection<T>> {
  await ensureIndexes()
  return (await getMongoDb()).collection<T>(name)
}

// ─── Scope ───────────────────────────────────────────────────────────────────

export interface Scope { tenantId: string; jobs: AtsJob[]; jobIds: string[]; appMatch: Doc; single: AtsJob | null }

export async function scopeFor(actor: AtsActor, f: InsightFilters): Promise<Scope | null> {
  const base = await jobScopeFilter(actor)
  if (!base) return null
  const q: Doc = { ...base }
  if (f.job_id) q.id = f.job_id
  if (f.client_id) q.client_id = f.client_id
  const jobs = (await (await atsJobs()).find(q, { projection: { _id: 0, id: 1, title: 1, status: 1, client_id: 1, pipeline: 1, tenant_id: 1 } }).limit(2000).toArray()) as AtsJob[]
  const jobIds = jobs.map((j) => j.id)
  const appMatch: Doc = { tenant_id: actor.tenantId, job_id: { $in: jobIds } }
  if (f.from || f.to) appMatch.created_at = { ...(f.from ? { $gte: f.from } : {}), ...(f.to ? { $lt: f.to } : {}) }
  return { tenantId: actor.tenantId, jobs, jobIds, appMatch, single: f.job_id ? jobs[0] ?? null : null }
}

function stageIdsOfType(jobs: AtsJob[], types: StageType[]): string[] {
  return jobs.flatMap((j) => j.pipeline.filter((s) => types.includes(s.type)).map((s) => s.id))
}

// ─── Funnel + time in stage ──────────────────────────────────────────────────

export async function funnelInsight(s: Scope) {
  const now = nowIso()
  await ensureIndexes()
  const rows = await (await atsApplications()).aggregate<{ _id: { j: string; s: string }; reached: number; days: Array<number | null> }>([
    { $match: s.appMatch },
    { $project: { job_id: 1, status: 1, h: { $ifNull: ['$history', []] } } },
    {
      $project: {
        job_id: 1,
        segs: {
          $map: {
            input: { $range: [0, { $size: '$h' }] },
            as: 'i',
            in: {
              s: { $arrayElemAt: ['$h.to', '$$i'] },
              from: { $arrayElemAt: ['$h.at', '$$i'] },
              to: {
                $cond: [
                  { $lt: [{ $add: ['$$i', 1] }, { $size: '$h' }] },
                  { $arrayElemAt: ['$h.at', { $add: ['$$i', 1] }] },
                  { $cond: [{ $in: ['$status', ['active', 'on_hold']] }, now, null] },
                ],
              },
            },
          },
        },
      },
    },
    { $unwind: '$segs' },
    { $match: { 'segs.s': { $type: 'string' } } },
    {
      $group: {
        _id: { a: '$_id', j: '$job_id', s: '$segs.s' },
        days: { $sum: { $cond: [{ $eq: ['$segs.to', null] }, null, { $divide: [{ $subtract: [{ $toDate: '$segs.to' }, { $toDate: '$segs.from' }] }, DAY] }] } },
        open: { $min: { $cond: [{ $eq: ['$segs.to', null] }, 1, 0] } },
      },
    },
    { $group: { _id: { j: '$_id.j', s: '$_id.s' }, reached: { $sum: 1 }, days: { $push: { $cond: [{ $eq: ['$open', 1] }, null, '$days'] } } } },
  ], { allowDiskUse: true }).toArray()

  const byJob = new Map(s.jobs.map((j) => [j.id, j]))
  const stages: FunnelStage[] = s.single
    ? s.single.pipeline.filter((st) => st.type !== 'rejected').map((st) => ({ key: st.id, name: st.name, type: st.type }))
    : TYPE_ORDER.filter((t) => s.jobs.some((j) => j.pipeline.some((st) => st.type === t))).map((t) => ({ key: t, name: t.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()), type: t }))
  const reached = new Map<string, number>()
  const days = new Map<string, number[]>()
  for (const r of rows) {
    const st = byJob.get(r._id.j)?.pipeline.find((x) => x.id === r._id.s)
    if (!st) continue
    const key = s.single ? st.id : st.type
    reached.set(key, (reached.get(key) ?? 0) + r.reached)
    if (st.type !== 'hired' && st.type !== 'rejected') days.set(key, [...(days.get(key) ?? []), ...r.days.filter((d): d is number => typeof d === 'number' && Number.isFinite(d) && d >= 0)])
  }

  const hired = stageIdsOfType(s.jobs, ['hired'])
  const tth = await (await atsApplications()).aggregate<{ _id: string; days: number[] }>([
    { $match: { ...s.appMatch, status: 'hired' } },
    { $project: { job_id: 1, created_at: 1, last: { $last: { $filter: { input: { $ifNull: ['$history', []] }, as: 'h', cond: { $in: ['$$h.to', hired] } } } } } },
    { $match: { 'last.at': { $type: 'string' } } },
    { $group: { _id: '$job_id', days: { $push: { $divide: [{ $subtract: [{ $toDate: '$last.at' }, { $toDate: '$created_at' }] }, DAY] } } } },
  ]).toArray()
  const all = tth.flatMap((r) => r.days.filter((d) => d >= 0))
  const r1 = (v: number | null) => (v === null ? null : Math.round(v * 10) / 10)
  return {
    stages: funnelRows(stages, reached, days),
    time_to_hire: {
      median_days: r1(median(all)), count: all.length,
      by_job: tth.map((r) => ({ job_id: r._id, title: byJob.get(r._id)?.title ?? '', median_days: r1(median(r.days)), hires: r.days.length })).sort((a, b) => b.hires - a.hires),
    },
  }
}

// ─── Sources ─────────────────────────────────────────────────────────────────

export async function sourcesInsight(s: Scope) {
  const interview = stageIdsOfType(s.jobs, INTERVIEW_TYPES)
  const rows = await (await atsApplications()).aggregate<SourceAgg & { _id: string }>([
    { $match: s.appMatch },
    {
      $group: {
        _id: { $ifNull: ['$source', 'unknown'] },
        total: { $sum: 1 },
        hired: { $sum: { $cond: [{ $eq: ['$status', 'hired'] }, 1, 0] } },
        rejected: { $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] } },
        active: { $sum: { $cond: [{ $in: ['$status', ['active', 'on_hold']] }, 1, 0] } },
        reached_interview: { $sum: { $cond: [{ $gt: [{ $size: { $setIntersection: [{ $ifNull: ['$history.to', []] }, interview] } }, 0] }, 1, 0] } },
        match_sum: { $sum: { $cond: [{ $isNumber: '$match.score' }, '$match.score', 0] } },
        match_n: { $sum: { $cond: [{ $isNumber: '$match.score' }, 1, 0] } },
      },
    },
  ]).toArray()
  return { sources: sourceRows(rows.map((r) => ({ ...r, source: String(r._id) }))) }
}

// ─── Offers ──────────────────────────────────────────────────────────────────

export async function offersInsight(s: Scope) {
  const offer = stageIdsOfType(s.jobs, ['offer'])
  if (!offer.length) return { offers: offerSummary({ offered: 0, accepted: 0, declined: 0, pending: 0 }), by_job: [] }
  const byJob = new Map(s.jobs.map((j) => [j.id, j.title]))
  const rows = await (await atsApplications()).aggregate<{ _id: string; offered: number; accepted: number; declined: number; pending: number }>([
    { $match: { ...s.appMatch, 'history.to': { $in: offer } } },
    {
      $group: {
        _id: '$job_id',
        offered: { $sum: 1 },
        accepted: { $sum: { $cond: [{ $eq: ['$status', 'hired'] }, 1, 0] } },
        declined: { $sum: { $cond: [{ $in: ['$status', ['withdrawn', 'rejected']] }, 1, 0] } },
        pending: { $sum: { $cond: [{ $in: ['$status', ['active', 'on_hold']] }, 1, 0] } },
      },
    },
  ]).toArray()
  const total = rows.reduce((a, r) => ({ offered: a.offered + r.offered, accepted: a.accepted + r.accepted, declined: a.declined + r.declined, pending: a.pending + r.pending }), { offered: 0, accepted: 0, declined: 0, pending: 0 })
  return { offers: offerSummary(total), by_job: rows.map((r) => ({ job_id: r._id, title: byJob.get(r._id) ?? '', ...offerSummary(r) })).sort((a, b) => b.offered - a.offered) }
}

// ─── Interviewer calibration ─────────────────────────────────────────────────

export async function interviewersInsight(s: Scope) {
  const match: Doc = { tenant_id: s.tenantId, job_id: { $in: s.jobIds }, 'scorecards.0': { $exists: true } }
  if (s.appMatch.created_at) match.created_at = s.appMatch.created_at
  await ensureIndexes()
  const rows = await (await atsCollection('interviews')).aggregate<InterviewerAgg & { _id: string }>([
    { $match: match },
    { $unwind: '$scorecards' },
    { $project: { iv: '$scorecards.interviewer_id', rec: '$scorecards.recommendation', avg: { $avg: { $map: { input: { $objectToArray: { $ifNull: ['$scorecards.ratings', {}] } }, as: 'r', in: '$$r.v' } } } } },
    { $match: { avg: { $type: 'number' }, iv: { $type: 'string' } } },
    {
      $group: {
        _id: '$iv', n: { $sum: 1 }, sum: { $sum: '$avg' }, sumSq: { $sum: { $multiply: ['$avg', '$avg'] } },
        strong_yes: { $sum: { $cond: [{ $eq: ['$rec', 'strong_yes'] }, 1, 0] } },
        yes: { $sum: { $cond: [{ $eq: ['$rec', 'yes'] }, 1, 0] } },
        no: { $sum: { $cond: [{ $eq: ['$rec', 'no'] }, 1, 0] } },
        strong_no: { $sum: { $cond: [{ $eq: ['$rec', 'strong_no'] }, 1, 0] } },
      },
    },
  ]).toArray()
  const members = await (await atsMembers()).find({ tenant_id: s.tenantId, user_id: { $in: rows.map((r) => r._id) } }, { projection: { _id: 0, user_id: 1, name: 1, email: 1 } }).toArray()
  const names = new Map(members.map((m) => [String(m.user_id), String(m.name || m.email || 'Interviewer')]))
  return calibration(rows.map((r) => ({ ...r, interviewer_id: r._id })), names)
}

// ─── Test quality (psychometrics) ────────────────────────────────────────────

export async function testsInsight(s: Scope, examId: string | null, f: InsightFilters) {
  const db = await getMongoDb()
  await ensureIndexes()
  const exams = await db.collection('exams').find({ tenant_id: s.tenantId }, { projection: { _id: 0, id: 1, title: 1, updatedAt: 1 } }).sort({ updatedAt: -1 }).limit(300).toArray()
  const ids = exams.map((e) => String(e.id))
  const counts = ids.length
    ? await db.collection('exam_submissions').aggregate<{ _id: string; n: number }>([{ $match: { exam_id: { $in: ids } } }, { $group: { _id: '$exam_id', n: { $sum: 1 } } }]).toArray()
    : []
  const n = new Map(counts.map((c) => [c._id, c.n]))
  const list = exams.map((e) => ({ id: String(e.id), title: String(e.title || ''), submissions: n.get(String(e.id)) ?? 0 })).filter((e) => e.submissions > 0).sort((a, b) => b.submissions - a.submissions)
  const chosen = examId && ids.includes(examId) ? examId : list[0]?.id ?? null
  if (!chosen) return { exams: list, exam_id: null, distribution: null, items: [] }

  const exam = await db.collection('exams').findOne({ id: chosen, tenant_id: s.tenantId }, { projection: { _id: 0, questionList: 1, passing_score: 1 } })
  const subMatch: Doc = { exam_id: chosen, has_pending_review: { $ne: true }, max_score: { $gt: 0 } }
  if (f.from || f.to) subMatch.submitted_at = { ...(f.from ? { $gte: f.from } : {}), ...(f.to ? { $lt: f.to } : {}) }
  const [pcts, sums] = await Promise.all([
    db.collection('exam_submissions').aggregate<{ p: number }>([
      { $match: subMatch },
      { $project: { _id: 0, p: { $multiply: [{ $divide: ['$score', '$max_score'] }, 100] } } },
      { $limit: 100_000 },
    ]).toArray(),
    db.collection('exam_submissions').aggregate<{ _id: string; n: number; sx: number; sxx: number; sT: number; sTT: number; sxT: number; max: number }>([
      { $match: subMatch },
      { $project: { T: '$score', details: 1 } },
      { $unwind: '$details' },
      { $match: { 'details.pending_review': { $ne: true } } },
      { $project: { q: '$details.qId', T: 1, pts: '$details.points', x: { $ifNull: ['$details.awarded', { $cond: ['$details.correct', '$details.points', 0] }] } } },
      { $group: { _id: '$q', n: { $sum: 1 }, sx: { $sum: '$x' }, sxx: { $sum: { $multiply: ['$x', '$x'] } }, sT: { $sum: '$T' }, sTT: { $sum: { $multiply: ['$T', '$T'] } }, sxT: { $sum: { $multiply: ['$x', '$T'] } }, max: { $max: '$pts' } } },
    ], { allowDiskUse: true }).toArray(),
  ])
  const qs = new Map(((exam?.questionList as Doc[]) ?? []).map((q, i) => [String(q.id), { i, type: String(q.type || ''), title: String(q.title || q.prompt || q.question || '').replace(/\s+/g, ' ').slice(0, 120) }]))
  const items: Array<ItemStats & { question_id: string; n_order: number; title: string; type: string }> = sums
    .filter((r) => qs.has(String(r._id)) && !NON_SCORED.has(qs.get(String(r._id))!.type))
    .map((r) => ({ question_id: String(r._id), n_order: qs.get(String(r._id))!.i + 1, title: qs.get(String(r._id))!.title, type: qs.get(String(r._id))!.type, ...itemStatsFromSums(r, Number(r.max) || 0) }))
    .sort((a, b) => a.n_order - b.n_order)
  const values = pcts.map((x) => x.p)
  return { exams: list, exam_id: chosen, distribution: { ...describe(values), pass_mark: Number(exam?.passing_score ?? 0) || null, bins: histogram(values, 10) }, items }
}

// ─── On-the-job performance ──────────────────────────────────────────────────

export interface RatingDoc { id: string; tenant_id: string; application_id: string; job_id: string; period: 30 | 90; value: number; by: string; at: string }

function assessmentScore(app: Doc): number | null {
  const results = Array.isArray(app.results) ? (app.results as Doc[]) : []
  const r = [...results].reverse().find((x) => x?.ref?.kind === 'exam_submission' && typeof x.score === 'number')
  return r ? Number(r.score) : null
}

export async function performanceInsight(s: Scope, opts: { withPeople: boolean }) {
  const apps = (await (await atsApplications()).find({ ...s.appMatch, status: 'hired' }, { projection: { _id: 0, id: 1, job_id: 1, candidate_id: 1, results: 1, match: 1, updated_at: 1, history: 1 } }).sort({ updated_at: -1 }).limit(2000).toArray()) as Doc[]
  const ratings = (await (await col<RatingDoc>('ats_performance_ratings')).find({ tenant_id: s.tenantId, application_id: { $in: apps.map((a) => String(a.id)) } }, { projection: { _id: 0 } }).toArray()) as RatingDoc[]
  const byApp = new Map<string, { d30: number | null; d90: number | null }>()
  for (const r of ratings) {
    const cur = byApp.get(r.application_id) ?? { d30: null, d90: null }
    if (r.period === 30) cur.d30 = r.value
    else cur.d90 = r.value
    byApp.set(r.application_id, cur)
  }
  const perf = (id: string) => { const r = byApp.get(id); if (!r) return null; const v = [r.d30, r.d90].filter((x): x is number => x !== null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null }
  const assessPairs: Array<[number, number]> = []
  const matchPairs: Array<[number, number]> = []
  for (const a of apps) {
    const p = perf(String(a.id))
    if (p === null) continue
    const sc = assessmentScore(a)
    if (sc !== null) assessPairs.push([sc, p])
    if (typeof a.match?.score === 'number') matchPairs.push([a.match.score, p])
  }
  const titles = new Map(s.jobs.map((j) => [j.id, j.title]))
  let people: Array<{ application_id: string; name: string; job_title: string; hired_at: string | null; assessment_score: number | null; d30: number | null; d90: number | null }> = []
  if (opts.withPeople) {
    // The tenant's own hires (names it already holds) — UI only, never exported.
    const cands = await (await atsCandidates()).find({ tenant_id: s.tenantId, id: { $in: apps.map((a) => String(a.candidate_id)) } }, { projection: { _id: 0, id: 1, name: 1 } }).toArray()
    const names = new Map(cands.map((c) => [String(c.id), String(c.name || '')]))
    people = apps.slice(0, 300).map((a) => {
      const h = Array.isArray(a.history) ? (a.history as Doc[]) : []
      return {
        application_id: String(a.id), name: names.get(String(a.candidate_id)) || '—', job_title: titles.get(String(a.job_id)) ?? '',
        hired_at: h.length ? String(h[h.length - 1].at) : null, assessment_score: assessmentScore(a),
        d30: byApp.get(String(a.id))?.d30 ?? null, d90: byApp.get(String(a.id))?.d90 ?? null,
      }
    })
  }
  const r2 = (r: { n: number; r: number | null; enough: boolean }) => ({ ...r, r: r.r === null ? null : Math.round(r.r * 100) / 100 })
  return {
    hires: apps.length,
    rated: [...byApp.keys()].length,
    min_sample: MIN_SAMPLE,
    assessment_vs_performance: r2(correlate(assessPairs)),
    match_vs_performance: r2(correlate(matchPairs)),
    people,
  }
}

export class InsightError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message) }
}

export async function saveRating(actor: AtsActor, input: { application_id: string; period: 30 | 90; value: number }): Promise<RatingDoc> {
  const app = (await (await atsApplications()).findOne({ id: input.application_id, tenant_id: actor.tenantId }, { projection: { _id: 0, id: 1, job_id: 1, status: 1 } })) as Doc | null
  const scope = await jobScopeFilter(actor)
  const visible = app && scope ? await (await atsJobs()).countDocuments({ ...scope, id: app.job_id }) : 0
  if (!app || !visible) throw new InsightError(404, 'ats_insight_application_not_found', "We couldn't find that hired candidate.")
  if (app.status !== 'hired') throw new InsightError(400, 'ats_rating_hired_only', 'Only hired candidates can get an on-the-job rating.')
  const doc: RatingDoc = { id: newId(), tenant_id: actor.tenantId, application_id: String(app.id), job_id: String(app.job_id), period: input.period, value: input.value, by: actor.userId, at: nowIso() }
  const c = await col<RatingDoc>('ats_performance_ratings')
  await c.updateOne({ application_id: doc.application_id, period: doc.period, tenant_id: actor.tenantId }, { $set: { value: doc.value, by: doc.by, at: doc.at, job_id: doc.job_id }, $setOnInsert: { id: doc.id, tenant_id: doc.tenant_id } }, { upsert: true })
  return doc
}

// ─── Weekly digest ───────────────────────────────────────────────────────────

export interface DigestSettingsDoc { tenant_id: string; enabled: boolean; opted_out: string[]; updated_by: string; updated_at: string }

export async function getDigestSettings(tenantId: string): Promise<DigestSettingsDoc> {
  const d = await (await col<DigestSettingsDoc>('ats_analytics_digest')).findOne({ tenant_id: tenantId }, { projection: { _id: 0 } })
  return (d as DigestSettingsDoc | null) ?? { tenant_id: tenantId, enabled: false, opted_out: [], updated_by: '', updated_at: '' }
}

export async function setDigestEnabled(actor: AtsActor, enabled: boolean): Promise<void> {
  await (await col<DigestSettingsDoc>('ats_analytics_digest')).updateOne(
    { tenant_id: actor.tenantId },
    { $set: { enabled, updated_by: actor.userId, updated_at: nowIso() }, $setOnInsert: { tenant_id: actor.tenantId, opted_out: [] } },
    { upsert: true },
  )
}

export async function setDigestOptOut(tenantId: string, userId: string, optedOut: boolean): Promise<void> {
  await (await col<DigestSettingsDoc>('ats_analytics_digest')).updateOne(
    { tenant_id: tenantId },
    { ...(optedOut ? { $addToSet: { opted_out: userId } } : { $pull: { opted_out: userId } }), $setOnInsert: { tenant_id: tenantId, enabled: false, updated_by: userId, updated_at: nowIso() } } as never,
    { upsert: true },
  )
}

export async function digestNumbers(tenantId: string, now: Date): Promise<DigestNumbers> {
  const { from, to } = digestRange(now)
  const jobs = (await (await atsJobs()).find({ tenant_id: tenantId }, { projection: { _id: 0, id: 1, title: 1, status: 1, pipeline: 1, client_id: 1, tenant_id: 1 } }).limit(2000).toArray()) as AtsJob[]
  const offer = stageIdsOfType(jobs, ['offer'])
  const hired = stageIdsOfType(jobs, ['hired'])
  const apps = await atsApplications()
  const [applications, hires, offers, sources, tth] = await Promise.all([
    apps.countDocuments({ tenant_id: tenantId, created_at: { $gte: from, $lt: to } }),
    apps.countDocuments({ tenant_id: tenantId, history: { $elemMatch: { to: { $in: hired }, at: { $gte: from, $lt: to } } } } as never),
    apps.aggregate<{ offered: number; accepted: number }>([
      { $match: { tenant_id: tenantId, history: { $elemMatch: { to: { $in: offer }, at: { $gte: from, $lt: to } } } } },
      { $group: { _id: null, offered: { $sum: 1 }, accepted: { $sum: { $cond: [{ $eq: ['$status', 'hired'] }, 1, 0] } } } },
    ]).toArray(),
    apps.aggregate<{ _id: string; n: number }>([
      { $match: { tenant_id: tenantId, created_at: { $gte: from, $lt: to } } },
      { $group: { _id: '$source', n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 1 },
    ]).toArray(),
    apps.aggregate<{ d: number }>([
      { $match: { tenant_id: tenantId, status: 'hired', history: { $elemMatch: { to: { $in: hired }, at: { $gte: from, $lt: to } } } } },
      { $project: { _id: 0, d: { $divide: [{ $subtract: [{ $toDate: { $last: '$history.at' } }, { $toDate: '$created_at' }] }, DAY] } } },
    ]).toArray(),
  ])
  const m = median(tth.map((x) => x.d).filter((d) => d >= 0))
  return {
    applications, hires,
    offers: offers[0]?.offered ?? 0, offers_accepted: offers[0]?.accepted ?? 0,
    median_time_to_hire_days: m === null ? null : Math.round(m * 10) / 10,
    top_source: sources[0]?._id ?? null,
    open_jobs: jobs.filter((j) => j.status === 'open').length,
  }
}

/** Monday job: one email per opted-in tenant member (admin / recruiter), in their language, once per week. */
export async function sendHiringDigests(now = new Date()): Promise<{ tenants: number; sent: number }> {
  const enabled = (await (await col<DigestSettingsDoc>('ats_analytics_digest')).find({ enabled: true }, { projection: { _id: 0 } }).limit(5000).toArray()) as DigestSettingsDoc[]
  const week = digestWeekKey(now)
  const log = await col<{ key: string; created_at: Date }>('ats_analytics_digest_log')
  const [{ deriveServerKey }, { localeForRecipient }, { sendEmail }, { renderDigestEmail }] = await Promise.all([
    import('@/lib/session'), import('@/lib/i18n/recipient'), import('@/lib/send-email'), import('./hiring-digest-email'),
  ])
  const key = await deriveServerKey('hiring-digest-unsub')
  const db = await getMongoDb()
  let sent = 0
  for (const t of enabled) {
    const members = await (await atsMembers()).find({ tenant_id: t.tenant_id, status: 'active', role: { $in: ['admin', 'recruiter'] }, user_id: { $type: 'string' } } as never, { projection: { _id: 0, user_id: 1, email: 1, name: 1 } }).limit(200).toArray()
    const recipients = members.filter((m) => m.user_id && !(t.opted_out || []).includes(String(m.user_id)))
    if (!recipients.length) continue
    const numbers = await digestNumbers(t.tenant_id, now)
    if (!digestWorthSending(numbers)) continue
    const org = await db.collection('tenants').findOne({ id: t.tenant_id }, { projection: { _id: 0, name: 1 } }).catch(() => null)
    for (const m of recipients) {
      const uid = String(m.user_id)
      try {
        await log.insertOne({ key: `${t.tenant_id}:${week}:${uid}`, created_at: new Date() })
      } catch {
        continue // already sent this week
      }
      const locale = await localeForRecipient({ userId: uid, email: m.email })
      const unsub = `/api/ats/analytics/digest/unsubscribe?t=${encodeURIComponent(t.tenant_id)}&u=${encodeURIComponent(uid)}&k=${digestUnsubToken(key, t.tenant_id, uid)}`
      const mail = renderDigestEmail(locale, { orgName: String(org?.name || ''), numbers, range: digestRange(now), unsubPath: unsub })
      const r = await sendEmail(m.email, mail, undefined, { category: 'hiring_digest', headers: mail.headers }).catch(() => null)
      if (r?.success || r?.queued) sent++
    }
  }
  return { tenants: enabled.length, sent }
}

// ─── One entry point (routes + agent tool) ───────────────────────────────────

export async function runInsight(actor: AtsActor, section: import('./hiring-insights').InsightSection, f: InsightFilters, opts: { examId?: string | null; withPeople?: boolean } = {}) {
  const s = await scopeFor(actor, f)
  if (!s) throw new InsightError(403, 'ats_role_forbidden', "Your hiring role can't do this")
  if (f.job_id && !s.jobs.length) throw new InsightError(404, 'ats_job_not_found', 'Job not found')
  switch (section) {
    case 'funnel': return funnelInsight(s)
    case 'sources': return sourcesInsight(s)
    case 'offers': return offersInsight(s)
    case 'interviewers': return interviewersInsight(s)
    case 'tests': return testsInsight(s, opts.examId ?? null, f)
    case 'performance': return performanceInsight(s, { withPeople: opts.withPeople === true })
  }
}
