/**
 * ATS pipeline engine (contract: moveApplication / recordStageResult /
 * approvePendingMove / nextStage). Every stage change is written with an
 * optimistic guard on (stage_id, stage_entered_at), recorded in history, and
 * its side effects run once per stage entry through the `ats_stage_runs`
 * ledger (unique key `${app.id}:${stage.id}:${app.stage_entered_at}`).
 *
 * Callers authorise first (routes use lib/ats/access); the engine only enforces
 * tenant scope for non-system actors.
 */
import type { AtsActor, AtsApplication, AtsCandidate, AtsJob, PipelineStage, StageHistoryEntry, StageResult } from './contract'
import { atsApplications, atsCandidates, atsJobs, atsStageRuns, isDuplicateKey, nowIso } from './db'
import { getStageHandler } from './handlers'
import { nextStageOf } from './pipeline'

export class AtsError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export function nextStage(job: AtsJob, stageId: string): PipelineStage | null {
  return nextStageOf(job.pipeline || [], stageId)
}

export function stageKey(app: Pick<AtsApplication, 'id' | 'stage_id' | 'stage_entered_at'>): string {
  return `${app.id}:${app.stage_id}:${app.stage_entered_at}`
}

type Actor = AtsActor | 'system'
const actorId = (a: Actor) => (a === 'system' ? 'system' : a.userId)

async function load(appId: string, actor: Actor): Promise<{ app: AtsApplication; job: AtsJob }> {
  const apps = await atsApplications()
  const app = (await apps.findOne(
    actor === 'system' ? { id: appId } : { id: appId, tenant_id: actor.tenantId },
    { projection: { _id: 0 } },
  )) as AtsApplication | null
  if (!app) throw new AtsError(404, 'Application not found')
  const job = (await (await atsJobs()).findOne({ id: app.job_id, tenant_id: app.tenant_id }, { projection: { _id: 0 } })) as AtsJob | null
  if (!job) throw new AtsError(404, 'Job not found')
  return { app, job }
}

/**
 * Run `fn` once for ledger key `key`. A second call with the same key is a
 * no-op (returns false). Failures are recorded on the ledger row, never thrown.
 */
export async function runOnce(
  key: string,
  meta: { app: AtsApplication; stage: PipelineStage; type?: string },
  fn: () => Promise<void>,
): Promise<boolean> {
  const runs = await atsStageRuns()
  const ts = nowIso()
  try {
    await runs.insertOne({
      key,
      tenant_id: meta.app.tenant_id,
      application_id: meta.app.id,
      job_id: meta.app.job_id,
      stage_id: meta.stage.id,
      type: meta.type || meta.stage.type,
      status: 'running',
      created_at: ts,
      updated_at: ts,
    })
  } catch (e) {
    if (isDuplicateKey(e)) return false
    throw e
  }
  try {
    await fn()
    await runs.updateOne({ key, status: 'running' }, { $set: { status: 'done', updated_at: nowIso() } })
  } catch (e) {
    console.error('[ats/engine] stage side effect failed:', key, e)
    await runs.updateOne({ key }, { $set: { status: 'failed', error: String((e as Error)?.message || e).slice(0, 500), updated_at: nowIso() } }).catch(() => {})
  }
  return true
}

async function loadCandidate(app: AtsApplication): Promise<AtsCandidate | null> {
  return (await (await atsCandidates()).findOne({ id: app.candidate_id, tenant_id: app.tenant_id }, { projection: { _id: 0 } })) as AtsCandidate | null
}

/**
 * Openings bookkeeping when an application enters / leaves hired. Returns
 * whether the count actually changed (a decrement needs openings > 0), so an
 * un-hire only gives back an opening its hire really took.
 */
async function adjustOpenings(job: AtsJob, delta: 1 | -1): Promise<boolean> {
  const jobs = await atsJobs()
  const syncLegacy = async (j: AtsJob) => {
    try {
      const { syncLegacyPosting } = await import('./legacy')
      await syncLegacyPosting(j)
    } catch (e) {
      console.error('[ats/engine] legacy sync failed:', e)
    }
  }
  if (delta < 0) {
    const updated = (await jobs.findOneAndUpdate(
      { id: job.id, tenant_id: job.tenant_id, openings: { $gt: 0 } },
      { $inc: { openings: -1 }, $set: { updated_at: nowIso() } },
      { returnDocument: 'after', projection: { _id: 0 } },
    )) as AtsJob | null
    if (!updated) return false
    if (updated.openings <= 0 && updated.status === 'open') {
      await jobs.updateOne({ id: job.id, tenant_id: job.tenant_id, status: 'open' }, { $set: { status: 'filled', updated_at: nowIso() } })
      await syncLegacy({ ...updated, status: 'filled' })
    }
    return true
  }
  const updated = (await jobs.findOneAndUpdate(
    { id: job.id, tenant_id: job.tenant_id },
    { $inc: { openings: 1 }, $set: { updated_at: nowIso() } },
    { returnDocument: 'after', projection: { _id: 0 } },
  )) as AtsJob | null
  // A filled job with an opening again is open again.
  if (updated && updated.openings > 0 && updated.status === 'filled') {
    const r = await jobs.updateOne({ id: job.id, tenant_id: job.tenant_id, status: 'filled' }, { $set: { status: 'open', updated_at: nowIso() } })
    if (r.matchedCount) await syncLegacy({ ...updated, status: 'open' })
  }
  return !!updated
}

/** Side effects of entering the app's current stage (each once per entry). */
async function enterStage(app: AtsApplication, job: AtsJob, from: PipelineStage | null, fromKey: string | null = null): Promise<void> {
  const stage = job.pipeline.find((s) => s.id === app.stage_id)
  if (!stage) return
  const key = stageKey(app)
  const candidate = await loadCandidate(app)

  if (from?.type === 'hired' && stage.type !== 'hired') {
    await runOnce(`${key}:unhire`, { app, stage, type: 'unhire' }, async () => {
      // Give the opening back only if that hire took one (ledger rows from before
      // this flag existed carry no `decremented` and keep the old behaviour).
      const hiredRun = fromKey ? await (await atsStageRuns()).findOne({ key: `${fromKey}:hired` }) : null
      if (hiredRun && hiredRun.decremented === false) return
      await adjustOpenings(job, 1)
    })
  }
  if (stage.type === 'hired') {
    const hiredKey = `${key}:hired`
    await runOnce(hiredKey, { app, stage, type: 'hired' }, async () => {
      const decremented = await adjustOpenings(job, -1)
      await (await atsStageRuns()).updateOne({ key: hiredKey }, { $set: { decremented, updated_at: nowIso() } })
    })
  }
  if (candidate) {
    await runOnce(`${key}:notify`, { app, stage, type: 'notify' }, async () => {
      const { notifyStageEntry } = await import('./notify')
      await notifyStageEntry({ app, job, candidate, stage })
    })
  }

  // Ensure handlers are registered (side-effect imports), then run onEnter once.
  await import('./handlers/index')
  const handler = getStageHandler(stage.type)
  if (handler?.onEnter && candidate) {
    await runOnce(key, { app, stage }, () => handler.onEnter!({ app, job, candidate, stage, idempotencyKey: key }))
  }
}

/** Run the entry effects for a freshly created application (intake). */
export async function startApplication(app: AtsApplication, job: AtsJob): Promise<void> {
  await enterStage(app, job, null)
}

function statusForStage(stage: PipelineStage): AtsApplication['status'] {
  return stage.type === 'hired' ? 'hired' : stage.type === 'rejected' ? 'rejected' : 'active'
}

export async function moveApplication(
  actor: Actor,
  appId: string,
  toStageId: string,
  opts: { reason?: string; auto?: boolean } = {},
): Promise<AtsApplication> {
  const { app, job } = await load(appId, actor)
  if (app.status === 'withdrawn') throw new AtsError(409, 'The candidate withdrew this application')
  const to = job.pipeline.find((s) => s.id === toStageId)
  if (!to) throw new AtsError(400, 'That stage is not in this job’s pipeline')
  const from = job.pipeline.find((s) => s.id === app.stage_id) || null
  if (app.stage_id === toStageId) {
    // Same stage: only clears a pending suggestion / hold.
    if (app.pending_move || app.status === 'on_hold') {
      const apps = await atsApplications()
      await apps.updateOne({ id: app.id, tenant_id: app.tenant_id }, { $set: { pending_move: null, status: statusForStage(to), updated_at: nowIso() } })
      return { ...app, pending_move: null, status: statusForStage(to) }
    }
    return app
  }
  // Strictly after the previous entry, so every entry gets its own ledger key.
  const prevMs = Date.parse(app.stage_entered_at)
  const at = new Date(Math.max(Date.now(), Number.isFinite(prevMs) ? prevMs + 1 : 0)).toISOString()
  const entry: StageHistoryEntry = {
    from: app.stage_id,
    to: toStageId,
    at,
    by: actorId(actor),
    auto: actor === 'system' ? opts.auto !== false : !!opts.auto,
    ...(opts.reason ? { reason: opts.reason.slice(0, 500) } : {}),
  }
  const status = statusForStage(to)
  const set: Record<string, unknown> = {
    stage_id: toStageId,
    stage_entered_at: at,
    status,
    pending_move: null,
    updated_at: at,
    ...(status === 'rejected' ? { rejection_reason: (opts.reason || '').slice(0, 500) || null } : {}),
    ...(status === 'active' && app.rejection_reason ? { rejection_reason: null } : {}),
  }
  const apps = await atsApplications()
  const r = await apps.updateOne(
    { id: app.id, tenant_id: app.tenant_id, stage_id: app.stage_id, stage_entered_at: app.stage_entered_at },
    { $set: set, $push: { history: entry } } as never,
  )
  if (!r.matchedCount) throw new AtsError(409, 'This application was just moved by someone else — refresh and try again')
  const next = { ...app, ...set, history: [...(app.history || []), entry] } as AtsApplication
  await enterStage(next, job, from, stageKey(app))
  // Re-read: handlers may have advanced it further (auto stages).
  return ((await apps.findOne({ id: app.id, tenant_id: app.tenant_id }, { projection: { _id: 0 } })) as AtsApplication | null) ?? next
}

function sameResult(a: StageResult, b: StageResult): boolean {
  return a.stage_id === b.stage_id && a.outcome === b.outcome && (a.ref?.id ?? null) === (b.ref?.id ?? null) && (a.score ?? null) === (b.score ?? null)
}

/** Does a handler's entry key (`${stageKey}` or `${stageKey}:<suffix>`) belong to the app's current stage entry? */
export function isCurrentEntry(app: Pick<AtsApplication, 'id' | 'stage_id' | 'stage_entered_at'>, entryKey: string): boolean {
  const base = stageKey(app)
  return entryKey === base || entryKey.startsWith(`${base}:`)
}

/**
 * Store a stage result and apply its consequence. Results for a stage the
 * application has already left are kept for the record but move nothing.
 * `opts.entryKey`: the stage entry the result was produced for (handlers pass
 * their idempotency key). A result from an older entry of the same stage is
 * dropped — it must never decide (or overwrite) the current entry.
 */
export async function recordStageResult(appId: string, result: StageResult, opts: { entryKey?: string | null } = {}): Promise<AtsApplication> {
  const { app, job } = await load(appId, 'system')
  const stage = job.pipeline.find((s) => s.id === result.stage_id)
  if (!stage) throw new AtsError(400, 'Unknown stage')
  if (opts.entryKey && app.stage_id === stage.id && !isCurrentEntry(app, opts.entryKey)) return app
  const clean: StageResult = {
    stage_id: result.stage_id,
    outcome: result.outcome,
    ...(result.score !== undefined ? { score: result.score === null ? null : Math.max(0, Math.min(100, Math.round(Number(result.score) || 0))) } : {}),
    ...(result.summary ? { summary: String(result.summary).slice(0, 2000) } : {}),
    ...(result.ref ? { ref: result.ref } : {}),
    at: result.at || nowIso(),
  }
  const current = app.stage_id === stage.id && app.status !== 'withdrawn'
  // A result for the current entry is never dated before the entry itself.
  if (current && clean.at < app.stage_entered_at) clean.at = app.stage_entered_at
  // Idempotent: the same final result for this stage entry is applied once.
  const already = (app.results || []).some((r) => r.at >= app.stage_entered_at && r.outcome !== 'pending' && sameResult(r, clean))
  if (already) return app

  const apps = await atsApplications()
  // One result per stage entry: replace a pending one from this entry.
  const kept = (app.results || []).filter((r) => !(r.stage_id === clean.stage_id && r.at >= app.stage_entered_at && current))
  const results = [...kept, clean]
  await apps.updateOne({ id: app.id, tenant_id: app.tenant_id }, { $set: { results, updated_at: nowIso() } })
  const saved = { ...app, results }
  if (!current || clean.outcome === 'pending') return saved
  if (app.status === 'hired' || app.status === 'rejected') return saved

  const scoreTxt = typeof clean.score === 'number' ? ` (${clean.score}/100)` : ''
  if (clean.outcome === 'pass' || clean.outcome === 'skipped') {
    const nxt = nextStage(job, stage.id)
    if (!nxt) return saved
    const reason = `${clean.outcome === 'pass' ? 'Passed' : 'Skipped'} ${stage.name}${scoreTxt}`
    if (stage.advance === 'auto') return moveApplication('system', app.id, nxt.id, { reason, auto: true })
    const pending = { to: nxt.id, reason, suggested_at: nowIso() }
    await apps.updateOne({ id: app.id, tenant_id: app.tenant_id, stage_id: app.stage_id }, { $set: { pending_move: pending, updated_at: nowIso() } })
    return { ...saved, pending_move: pending }
  }

  // fail
  const reason = `Did not pass ${stage.name}${scoreTxt}${clean.summary ? ` — ${clean.summary.slice(0, 200)}` : ''}`
  const rejected = job.pipeline.find((s) => s.type === 'rejected')
  if (stage.on_fail === 'reject' && rejected) {
    return moveApplication('system', app.id, rejected.id, { reason, auto: true })
  }
  if (stage.on_fail === 'hold') {
    const entry: StageHistoryEntry = { from: app.stage_id, to: app.stage_id, at: nowIso(), by: 'system', auto: true, reason: `On hold: ${reason}` }
    await apps.updateOne({ id: app.id, tenant_id: app.tenant_id }, { $set: { status: 'on_hold', updated_at: nowIso() }, $push: { history: entry } } as never)
    return { ...saved, status: 'on_hold', history: [...(app.history || []), entry] }
  }
  // review (or reject without a rejected stage): suggest rejection to a recruiter
  if (!rejected) return saved
  const pending = { to: rejected.id, reason, suggested_at: nowIso() }
  await apps.updateOne({ id: app.id, tenant_id: app.tenant_id, stage_id: app.stage_id }, { $set: { pending_move: pending, updated_at: nowIso() } })
  return { ...saved, pending_move: pending }
}

export async function approvePendingMove(actor: Actor, appId: string, accept: boolean): Promise<AtsApplication> {
  const { app } = await load(appId, actor)
  const pending = app.pending_move
  if (!pending) throw new AtsError(409, 'There is no suggested move to approve')
  if (accept) {
    return moveApplication(actor, app.id, pending.to, { reason: `Approved: ${pending.reason}`, auto: false })
  }
  const apps = await atsApplications()
  const entry: StageHistoryEntry = { from: app.stage_id, to: app.stage_id, at: nowIso(), by: actorId(actor), auto: false, reason: `Declined suggestion: ${pending.reason}`.slice(0, 500) }
  const r = await apps.updateOne(
    { id: app.id, tenant_id: app.tenant_id, 'pending_move.suggested_at': pending.suggested_at },
    { $set: { pending_move: null, updated_at: nowIso() }, $push: { history: entry } } as never,
  )
  if (!r.matchedCount) throw new AtsError(409, 'The suggestion changed — refresh and try again')
  return { ...app, pending_move: null, history: [...(app.history || []), entry] }
}

/**
 * Client review decision (client, or a recruiter / hiring manager / admin on the
 * client's behalf). Recorded as the client_review stage result, so the stage's
 * own advance / on_fail rules decide what happens next. Callers authorise.
 */
export async function recordClientDecision(actor: AtsActor, appId: string, decision: 'approve' | 'reject', note?: string): Promise<AtsApplication> {
  const { app, job } = await load(appId, actor)
  const stage = job.pipeline.find((s) => s.id === app.stage_id)
  if (!stage || stage.type !== 'client_review') throw new AtsError(409, 'This candidate is not waiting for a client review')
  if (app.status !== 'active') throw new AtsError(409, 'This application is not active')
  const who = actor.role === 'client' ? 'Client' : `${actor.name || 'Hiring team'} (for the client)`
  const text = (note || '').replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, 500)
  return recordStageResult(app.id, {
    stage_id: stage.id,
    outcome: decision === 'approve' ? 'pass' : 'fail',
    summary: `${who} ${decision === 'approve' ? 'approved' : 'rejected'} the candidate${text ? `: ${text}` : ''}`,
    at: nowIso(),
  }, { entryKey: stageKey(app) })
}

/** Status change outside the pipeline (hold / resume / withdraw). Rejected/hired go through stages. */
export async function setApplicationStatus(actor: Actor, appId: string, status: 'active' | 'on_hold' | 'withdrawn', reason?: string): Promise<AtsApplication> {
  const { app } = await load(appId, actor)
  if (app.status === status) return app
  if (app.status === 'hired' || app.status === 'rejected') throw new AtsError(409, 'Move the application to another stage first')
  const entry: StageHistoryEntry = {
    from: app.stage_id, to: app.stage_id, at: nowIso(), by: actorId(actor), auto: false,
    reason: `${status === 'on_hold' ? 'Put on hold' : status === 'withdrawn' ? 'Withdrawn' : 'Resumed'}${reason ? `: ${reason.slice(0, 400)}` : ''}`,
  }
  const apps = await atsApplications()
  await apps.updateOne(
    { id: app.id, tenant_id: app.tenant_id },
    { $set: { status, updated_at: nowIso(), ...(status === 'withdrawn' ? { pending_move: null } : {}) }, $push: { history: entry } } as never,
  )
  return { ...app, status, history: [...(app.history || []), entry] }
}

/**
 * SLA sweep: active applications stuck past their stage's sla_days are
 * rejected (reason "No progress in N days"). Idempotent through moveApplication's guard.
 */
export async function sweepSla(now = new Date()): Promise<{ checked: number; rejected: number }> {
  const jobs = await atsJobs()
  const apps = await atsApplications()
  const live = (await jobs.find({ status: { $in: ['open', 'on_hold'] } }, { projection: { _id: 0 } }).limit(5000).toArray()) as AtsJob[]
  const withSla = live.filter((j) => (j.pipeline || []).some((s) => (s.sla_days ?? 0) > 0))
  let checked = 0
  let rejected = 0
  for (const job of withSla) {
    const rejStage = job.pipeline.find((s) => s.type === 'rejected')
    if (!rejStage) continue
    for (const stage of job.pipeline) {
      if (!stage.sla_days || stage.sla_days <= 0 || stage.type === 'hired' || stage.type === 'rejected') continue
      const cutoff = new Date(now.getTime() - stage.sla_days * 86_400_000).toISOString()
      const stuck = (await apps
        .find({ tenant_id: job.tenant_id, job_id: job.id, stage_id: stage.id, status: 'active', stage_entered_at: { $lt: cutoff } }, { projection: { _id: 0, id: 1 } })
        .limit(500)
        .toArray()) as Pick<AtsApplication, 'id'>[]
      for (const a of stuck) {
        checked++
        try {
          await moveApplication('system', a.id, rejStage.id, { reason: `No progress in ${stage.name} for ${stage.sla_days} days`, auto: true })
          rejected++
        } catch (e) {
          if (!(e instanceof AtsError && e.status === 409)) console.error('[ats/sla] move failed:', a.id, e)
        }
      }
    }
  }
  return { checked, rejected }
}
