/**
 * BGV lifecycle (server only). Routes authorise first (admin / recruiter for
 * verifier actions; the signed portal link for the candidate); every query is
 * scoped by the case's tenant_id.
 *
 *  stage entry → createCaseForStage (idempotent on entry_key) → invite link
 *  candidate   → consent → save checks / upload documents → submit
 *  vendor      → order on submit (non-manual) → webhook / sweep → check results
 *  verifier    → mark checks, request more info, assign vendor, decide
 *  roll-up     → clear → recordStageResult pass; consider → recruiter decides;
 *                fail (US) → pre-adverse → N business days → final adverse → fail
 *  sweep       → reminders, deadlines, stage-left cancel, simulated vendor,
 *                adverse wait-over notice, retention purge
 */
import type { AtsActor, AtsApplication, AtsCandidate, AtsJob, BgvCheckType, BgvConfig, BgvRegion, PipelineStage, StageHandlerContext } from '@/lib/ats/contract'
import { atsApplications, atsCandidates, atsJobs } from '@/lib/ats/db'
import { AtsError, isCurrentEntry, recordStageResult } from '@/lib/ats/engine'
import { renderText } from '@/lib/ats/notify'
import { getAppOrigin } from '@/lib/app-origin'
import { getMongoDb } from '@/lib/mongodb'
import { CHECK_LABEL, checkDef, normalizeChecks, resolveRegion } from './catalog'
import { bgvLinkKey, decryptSensitive, encryptSensitive, fileViewToken, newNonce, signPortalToken, verifyPortalToken } from './crypto'
import { bgvCases, newId, nowIso } from './db'
import { canSendFinalAdverse, caseSummary, purgeDue, purgedCase, rollUpStatus, startAdverse } from './rollup'
import { getBgvSettings, getVendorSecrets } from './settings'
import { deleteDocuments, MAX_DOCS_PER_CASE, storeDocument } from './storage'
import { fieldActive, missingItems, sanitizeCheckData } from './validate'
import { DEMO_VENDOR_ID, getVendor, simulatedVendorAllowed, VendorError, type VendorContext, type VendorPii, type WebhookEvent } from './vendors'
import { notifyTeam, sendFinalAdverse, sendInfoRequest, sendInvite, sendPreAdverse } from './notify'
import { DECIDED, type BgvCaseDoc, type BgvCheck, type BgvCheckStatus, type BgvDocument, type BgvSettingsDoc } from './types'

export const PORTAL_TTL_DAYS = 30
/** Candidate self-service "send me a new link": once per case per 10 minutes. */
export const RESEND_EVERY_MS = 10 * 60_000
/** A case left in 'consider' this long without a decision is closed (so retention applies). */
export const CONSIDER_MAX_DAYS = 90
const OPEN: BgvCaseDoc['status'][] = ['invited', 'in_progress', 'submitted', 'verifying', 'consider']

// ─── Small helpers ───────────────────────────────────────────────────────────

const later = (prev: string) => new Date(Math.max(Date.now(), Date.parse(prev) + 1 || 0)).toISOString()
const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n) : '')

export function bgvConfig(stage: PipelineStage): BgvConfig {
  const c = stage.config as Partial<BgvConfig> | undefined
  if (c && c.kind === 'bgv') return { kind: 'bgv', region: c.region || 'auto', checks: Array.isArray(c.checks) ? c.checks : [], vendor: c.vendor || 'manual', ...c } as BgvConfig
  return { kind: 'bgv', region: 'auto', checks: [], vendor: 'manual' }
}

async function companyName(tenantId: string, clientId: string | null): Promise<string> {
  try {
    const db = await getMongoDb()
    if (clientId) {
      const c = await db.collection('ats_clients').findOne({ id: clientId, tenant_id: tenantId }, { projection: { name: 1 } })
      if (c?.name) return String(c.name)
    }
    const t = await db.collection('tenants').findOne({ id: tenantId }, { projection: { name: 1 } })
    return t?.name ? String(t.name) : 'our company'
  } catch {
    return 'our company'
  }
}

async function loadRefs(c: Pick<BgvCaseDoc, 'tenant_id' | 'application_id' | 'job_id' | 'candidate_id'>) {
  const [app, job, candidate] = await Promise.all([
    (await atsApplications()).findOne({ id: c.application_id, tenant_id: c.tenant_id }, { projection: { _id: 0 } }),
    (await atsJobs()).findOne({ id: c.job_id, tenant_id: c.tenant_id }, { projection: { _id: 0 } }),
    (await atsCandidates()).findOne({ id: c.candidate_id, tenant_id: c.tenant_id }, { projection: { _id: 0 } }),
  ])
  return { app: app as AtsApplication | null, job: job as AtsJob | null, candidate: candidate as AtsCandidate | null }
}

export async function claimSend(caseId: string, key: string): Promise<boolean> {
  const r = await (await bgvCases()).updateOne({ id: caseId, sent: { $ne: key } }, { $addToSet: { sent: key } })
  return r.modifiedCount === 1
}

export async function releaseSend(caseId: string, key: string): Promise<void> {
  await (await bgvCases()).updateOne({ id: caseId }, { $pull: { sent: key } })
}

export async function portalLink(c: Pick<BgvCaseDoc, 'id' | 'token_nonce'>): Promise<string> {
  const token = signPortalToken(await bgvLinkKey(), c.id, c.token_nonce, Date.now() + PORTAL_TTL_DAYS * 86_400_000)
  return `${getAppOrigin()}/bgv/${token}`
}

export async function getCase(tenantId: string, id: string): Promise<BgvCaseDoc | null> {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null
  return (await bgvCases()).findOne({ id, tenant_id: tenantId }, { projection: { _id: 0 } })
}

export async function latestCaseForApplication(tenantId: string, applicationId: string): Promise<BgvCaseDoc | null> {
  const rows = await (await bgvCases()).find({ tenant_id: tenantId, application_id: applicationId }, { projection: { _id: 0 } }).sort({ created_at: -1 }).limit(1).toArray()
  return (rows[0] as BgvCaseDoc | undefined) ?? null
}

/**
 * Read-modify-write with an optimistic guard on updated_at. `fn` returns the
 * changed case (or null for "no change"); status is re-rolled every time.
 */
async function mutate(c: Pick<BgvCaseDoc, 'id' | 'tenant_id'>, fn: (cur: BgvCaseDoc) => BgvCaseDoc | null | Promise<BgvCaseDoc | null>): Promise<BgvCaseDoc> {
  const col = await bgvCases()
  for (let i = 0; i < 4; i++) {
    const cur = (await col.findOne({ id: c.id, tenant_id: c.tenant_id }, { projection: { _id: 0 } })) as BgvCaseDoc | null
    if (!cur) throw new AtsError(404, 'Background check not found')
    const next = await fn(structuredClone(cur))
    if (!next) return cur
    next.updated_at = later(cur.updated_at)
    next.status = rollUpStatus(next)
    if ((next.status === 'clear' || next.status === 'failed' || next.status === 'cancelled') && !next.closed_at) next.closed_at = next.updated_at
    if (next.status === 'consider' && cur.status !== 'consider') next.consider_at = next.updated_at
    // Fields written by atomic claims elsewhere are never overwritten from a stale read.
    const { id: _i, tenant_id: _t, sent: _s, vendor_events: _v, result_recorded: _r, link_resent_at: _l, vendor_polled_at: _p, ...set } = next
    const r = await col.updateOne({ id: cur.id, tenant_id: cur.tenant_id, updated_at: cur.updated_at }, { $set: set })
    if (r.matchedCount) {
      await afterChange(cur, next)
      return next
    }
  }
  throw new AtsError(409, 'This background check changed — refresh and try again')
}

/** Consequences of a status change: engine result, team notices. */
async function afterChange(prev: BgvCaseDoc, next: BgvCaseDoc): Promise<void> {
  if (prev.status === next.status) return
  if (next.status === 'clear' || next.status === 'failed') {
    void import('@/lib/automation/events').then(({ emit }) => emit('bgv.completed', {
      case_id: next.id, application_id: next.application_id, candidate_name: next.candidate_name ?? null, job_title: next.job_title ?? null, status: next.status,
    }, { tenantId: next.tenant_id, idempotencyKey: `bgv.completed:${next.id}:${next.status}` })).catch((e) => console.error('[automation] emit failed:', e))
  }
  const label = (t: BgvCheckType) => CHECK_LABEL(next.region, t)
  if (next.status === 'clear') {
    await recordOutcome(next, 'pass', `Background verification clear — ${caseSummary(next, label)}${next.decision?.outcome === 'pass' ? ' (approved by the hiring team)' : ''}`)
  } else if (next.status === 'failed' && next.decision?.outcome === 'fail') {
    // The recruiter's free-text note stays on the case (staff only); stage summaries reach hiring managers.
    await recordOutcome(next, 'fail', `Background verification not passed — ${caseSummary(next, label)}`)
  } else if (next.status === 'consider' && (await claimSend(next.id, 'consider_notice'))) {
    const { job } = await loadRefs(next)
    await notifyTeam(next, job?.recruiter_ids || [], 'Background check needs a decision', `${next.candidate_name} (${next.job_title}): ${caseSummary(next, label)}`)
  }
}

/** Send the stage result to the engine once (entryKey guards older entries). */
async function recordOutcome(c: BgvCaseDoc, outcome: 'pass' | 'fail', summary: string): Promise<void> {
  const r = await (await bgvCases()).updateOne({ id: c.id, tenant_id: c.tenant_id, result_recorded: { $in: [null, undefined] } } as never, { $set: { result_recorded: outcome } })
  if (!r.modifiedCount) return
  try {
    await recordStageResult(c.application_id, { stage_id: c.stage_id, outcome, summary: summary.slice(0, 1900), at: nowIso() }, { entryKey: c.entry_key })
  } catch (e) {
    console.error('[ats/bgv] recordStageResult failed:', c.id, e)
  }
}

// ─── Create (stage handler / manual start) ──────────────────────────────────

export async function createCaseForStage(
  ctx: Pick<StageHandlerContext, 'app' | 'job' | 'candidate' | 'stage' | 'idempotencyKey'>,
  opts: { createdBy?: string; region?: BgvRegion | null } = {},
): Promise<BgvCaseDoc | null> {
  const cfg = bgvConfig(ctx.stage)
  const region = opts.region || resolveRegion(cfg.region, ctx.candidate.country, ctx.job.location)
  if (!region) {
    if (await claimTeamNotice(`${ctx.idempotencyKey}:no_region`)) {
      await notifyTeam({ tenant_id: ctx.app.tenant_id, candidate_id: ctx.candidate.id, application_id: ctx.app.id }, ctx.job.recruiter_ids || [], 'Pick a region for the background check',
        `We couldn't tell whether ${ctx.candidate.name}'s background check is for India or the USA. Start it from the candidate's page, or set the region on the stage.`)
    }
    return null
  }
  const settings = await getBgvSettings(ctx.app.tenant_id)
  const regionSettings = settings.regions[region]
  let types = normalizeChecks(region, cfg.checks?.length ? cfg.checks : regionSettings.default_checks)
  if (!types.length) types = normalizeChecks(region, regionSettings.default_checks)
  const critical = normalizeChecks(region, cfg.critical_checks ?? regionSettings.critical_checks).filter((t) => types.includes(t))
  const now = nowIso()
  const deadlineDays = Math.max(1, Math.min(60, cfg.form_deadline_days ?? settings.form_deadline_days))
  // Demo vendor never auto-assigned in production unless the superadmin allows it (A-034).
  const vendor = cfg.vendor === DEMO_VENDOR_ID && !(await simulatedVendorAllowed()) ? getVendor('manual') : getVendor(cfg.vendor)
  const doc: BgvCaseDoc = {
    id: newId(),
    tenant_id: ctx.app.tenant_id,
    application_id: ctx.app.id,
    job_id: ctx.job.id,
    candidate_id: ctx.candidate.id,
    stage_id: ctx.stage.id,
    entry_key: ctx.idempotencyKey,
    region,
    checks: types.map((type) => ({ type, status: 'not_started' as BgvCheckStatus, data: {}, enc: null, documents: [], notes: null, updated_at: now })),
    critical_checks: critical,
    options: {
      employment_years: cfg.employment_years ?? (region === 'US' ? 7 : null),
      address_years: cfg.address_years ?? (region === 'US' ? 7 : null),
      references_count: Math.max(1, Math.min(5, cfg.references_count ?? 2)),
    },
    vendor: vendor.regions.includes(region) ? vendor.id : 'manual',
    vendor_ref: null,
    vendor_report_ref: null,
    vendor_events: [],
    consent: null,
    status: 'invited',
    submitted_at: null,
    deadline: new Date(Date.now() + deadlineDays * 86_400_000).toISOString(),
    token_nonce: newNonce(),
    reminders_sent: 0,
    last_reminder_at: null,
    decision: null,
    adverse_action: null,
    result_recorded: null,
    sent: [],
    candidate_name: ctx.candidate.name,
    candidate_email: ctx.candidate.email,
    job_title: ctx.job.title,
    stage_name: ctx.stage.name,
    client_visible: !!ctx.stage.client_visible,
    closed_at: null,
    purged_at: null,
    created_by: opts.createdBy || 'system',
    created_at: now,
    updated_at: now,
  }
  const col = await bgvCases()
  try {
    await col.insertOne({ ...doc })
  } catch (e) {
    if ((e as { code?: number })?.code !== 11000) throw e
    // Retried stage entry: the case exists — still make sure the invite went out (claims make this idempotent).
    const existing = (await col.findOne({ entry_key: ctx.idempotencyKey }, { projection: { _id: 0 } })) as BgvCaseDoc | null
    if (existing && OPEN.includes(existing.status) && !existing.purged_at) await sendInitialInvite(existing, ctx)
    return existing
  }
  await sendInitialInvite(doc, ctx)
  return doc
}

async function sendInitialInvite(doc: BgvCaseDoc, ctx: Pick<StageHandlerContext, 'job' | 'candidate'>): Promise<void> {
  if (doc.candidate_email) {
    if (!(await claimSend(doc.id, 'invite'))) return
    const ok = await sendInvite(doc, ctx.candidate, await portalLink(doc), await companyName(doc.tenant_id, ctx.job.client_id), 'invite')
    if (!ok) await releaseSend(doc.id, 'invite') // a retried stage entry tries again
  } else if (await claimSend(doc.id, 'no_email')) {
    await notifyTeam(doc, ctx.job.recruiter_ids || [], 'Background check link not sent', `${doc.candidate_name} has no email address. Add one and resend the background check link.`)
  }
}

async function claimTeamNotice(key: string): Promise<boolean> {
  try {
    const db = await getMongoDb()
    await db.collection('ats_stage_runs').insertOne({ key, type: 'bgv_notice', status: 'done', created_at: nowIso(), updated_at: nowIso() })
    return true
  } catch {
    return false
  }
}

/** Recruiter starts (or restarts) BGV for an application currently in a bgv stage. */
export async function startCaseManually(actor: AtsActor, app: AtsApplication, job: AtsJob, region: BgvRegion | null): Promise<BgvCaseDoc> {
  const stage = job.pipeline.find((s) => s.id === app.stage_id)
  if (!stage || (stage.type as string) !== 'bgv') throw new AtsError(409, 'Move the candidate to the background check stage first')
  const existing = await latestCaseForApplication(app.tenant_id, app.id)
  const base = `${app.id}:${app.stage_id}:${app.stage_entered_at}`
  if (existing && isCurrentEntry(app, existing.entry_key) && existing.status !== 'cancelled') throw new AtsError(409, 'A background check is already running for this stage')
  const candidate = (await (await atsCandidates()).findOne({ id: app.candidate_id, tenant_id: app.tenant_id }, { projection: { _id: 0 } })) as AtsCandidate | null
  if (!candidate) throw new AtsError(404, 'Candidate not found')
  const key = existing && isCurrentEntry(app, existing.entry_key) ? `${base}:restart:${Date.now()}` : base
  const doc = await createCaseForStage({ app, job, candidate, stage, idempotencyKey: key }, { createdBy: actor.userId, region })
  if (!doc) throw new AtsError(400, 'Pick a region (India or USA) for this background check')
  return doc
}

// ─── Candidate portal ────────────────────────────────────────────────────────

/** Case for a portal token (signature, expiry and nonce). */
export async function caseFromToken(token: unknown): Promise<BgvCaseDoc | null> {
  const p = verifyPortalToken(await bgvLinkKey(), token)
  if (!p) return null
  const c = (await (await bgvCases()).findOne({ id: p.i }, { projection: { _id: 0 } })) as BgvCaseDoc | null
  return c && c.token_nonce === p.n ? c : null
}

/**
 * Expired (or lost) link: a validly signed token, even expired, lets the
 * candidate ask for a fresh link — sent only to the email on file.
 */
export async function resendFromExpiredToken(token: unknown): Promise<boolean> {
  const p = verifyPortalToken(await bgvLinkKey(), token, { ignoreExpiry: true })
  if (!p) return false
  const c = (await (await bgvCases()).findOne({ id: p.i }, { projection: { _id: 0 } })) as BgvCaseDoc | null
  if (!c || c.token_nonce !== p.n || c.purged_at || !OPEN.includes(c.status) || !c.candidate_email) return false
  // Per-case throttle (the route also limits per IP): at most one fresh link every RESEND_EVERY_MS.
  const r = await (await bgvCases()).updateOne(
    { id: c.id, tenant_id: c.tenant_id, $or: [{ link_resent_at: { $in: [null, undefined] } }, { link_resent_at: { $lt: new Date(Date.now() - RESEND_EVERY_MS).toISOString() } }] } as never,
    { $set: { link_resent_at: nowIso() } },
  )
  if (!r.modifiedCount) return false
  const { job, candidate } = await loadRefs(c)
  await sendInvite(c, candidate, await portalLink(c), await companyName(c.tenant_id, job?.client_id ?? null), 'resend')
  return true
}

export function checkEditable(c: BgvCaseDoc, k: BgvCheck): boolean {
  if (c.purged_at || !c.consent || c.consent.withdrawn_at) return false
  if (c.status === 'clear' || c.status === 'failed' || c.status === 'cancelled') return false
  const def = checkDef(c.region, k.type)
  if (!def?.candidate_input) return false
  return !c.submitted_at || !!k.info_request
}

async function legalTexts(c: BgvCaseDoc, settings: BgvSettingsDoc) {
  const { job } = await loadRefs(c)
  const vars = { company: await companyName(c.tenant_id, job?.client_id ?? null), job_title: c.job_title, retention_days: settings.retention_days, candidate_name: c.candidate_name }
  const reg = settings.regions[c.region]
  return {
    company: vars.company,
    consent: { version: reg.consent.version, text: renderText(reg.consent.text, vars) },
    disclosure: c.region === 'US' && reg.disclosure ? { version: reg.disclosure.version, text: renderText(reg.disclosure.text, vars) } : null,
    state_notices: c.region === 'US' ? (reg.state_notices || []).map((n) => ({ ...n, text: renderText(n.text, vars) })) : [],
  }
}

/** What the candidate's portal shows (no ciphertext, no other people's notes). */
export async function portalView(c: BgvCaseDoc) {
  const settings = await getBgvSettings(c.tenant_id)
  const texts = await legalTexts(c, settings)
  return {
    case_id: c.id,
    region: c.region,
    status: c.status,
    company: texts.company,
    job_title: c.job_title,
    candidate_name: c.candidate_name,
    deadline: c.deadline,
    submitted_at: c.submitted_at,
    purged: !!c.purged_at,
    options: c.options,
    consent: c.consent ? { signed_at: c.consent.signed_at, version: c.consent.version, name: c.consent.name, state: c.consent.state ?? null } : null,
    texts: c.consent ? null : texts, // legal texts only until signed
    checks: c.checks.map((k) => {
      const def = checkDef(c.region, k.type)
      return {
        type: k.type,
        status: k.status,
        candidate_input: !!def?.candidate_input,
        data: k.data,
        documents: k.documents.map((d) => ({ id: d.id, slot: d.slot, item: d.item, name: d.name, size: d.size, type: d.type })),
        missing: missingItems(c.region, k, c.options),
        editable: checkEditable(c, k),
        info_request: k.info_request ? { message: k.info_request.message, at: k.info_request.at } : null,
      }
    }),
  }
}

export async function signConsent(c: BgvCaseDoc, input: { name: unknown; agree: unknown; disclosure_ack?: unknown; state?: unknown; ip: string; userAgent: string | null }): Promise<BgvCaseDoc> {
  if (c.consent) return c
  const name = clip(input.name, 160)
  if (name.length < 2) throw new AtsError(400, 'Type your full name to sign')
  if (input.agree !== true) throw new AtsError(400, 'Tick the box to give your consent')
  const settings = await getBgvSettings(c.tenant_id)
  const reg = settings.regions[c.region]
  let state: string | null = null
  if (c.region === 'US') {
    if (input.disclosure_ack !== true) throw new AtsError(400, 'Please read and acknowledge the disclosure first')
    state = typeof input.state === 'string' && /^[A-Z]{2}$/.test(input.state) ? input.state : null
  }
  const at = nowIso()
  return mutate(c, (cur) => {
    if (cur.consent || cur.status === 'cancelled' || cur.purged_at) return null
    cur.consent = {
      signed_at: at,
      ip: clip(input.ip, 64),
      version: reg.consent.version,
      name,
      user_agent: input.userAgent ? clip(input.userAgent, 300) : null,
      ...(c.region === 'US'
        ? {
            disclosure_version: reg.disclosure?.version ?? null,
            disclosure_ack_at: at,
            state,
            state_notice_versions: (reg.state_notices || []).filter((n) => !state || n.state === state).map((n) => `${n.state}:${n.version}`),
          }
        : {}),
    }
    return cur
  })
}

function findCheck(c: BgvCaseDoc, type: unknown): BgvCheck {
  const k = c.checks.find((x) => x.type === type)
  if (!k) throw new AtsError(404, 'That check is not part of this verification')
  return k
}

/** Save one check's form (draft). Returns the validation errors (nothing saved when any). */
export async function saveCheck(c: BgvCaseDoc, type: unknown, raw: unknown): Promise<{ case: BgvCaseDoc; errors: string[] }> {
  const k0 = findCheck(c, type)
  if (!checkEditable(c, k0)) throw new AtsError(409, c.consent ? 'This part can no longer be changed' : 'Give your consent first')
  const clean = sanitizeCheckData(c.region, k0.type, raw)
  if (clean.errors.length) return { case: c, errors: clean.errors.slice(0, 20) }
  const next = await mutate(c, async (cur) => {
    const k = findCheck(cur, k0.type)
    if (!checkEditable(cur, k)) throw new AtsError(409, 'This part can no longer be changed')
    // Sensitive values: merge the newly typed ones into the stored ciphertext; keep stored masks.
    const def = checkDef(cur.region, k.type)!
    const stored = (await decryptSensitive<Record<string, string>>(k.enc)) || {}
    const merged = { ...stored, ...clean.sensitive }
    for (const f of def.fields.filter((x) => x.sensitive)) {
      const mask = `${f.key}_masked`
      if (!fieldActive(f, clean.data)) { delete merged[f.key]; delete clean.data[mask]; continue }
      if (!(f.key in clean.sensitive) && merged[f.key] && typeof k.data[mask] === 'string') clean.data[mask] = k.data[mask]
    }
    k.enc = Object.keys(merged).length ? await encryptSensitive(merged) : null
    k.data = clean.data
    k.updated_at = nowIso()
    return cur
  })
  return { case: next, errors: [] }
}

function slotDef(c: BgvCaseDoc, type: BgvCheckType, slot: string, item: number | null) {
  const def = checkDef(c.region, type)
  if (!def) return null
  if (item === null) return def.documents.find((d) => d.slot === slot) || null
  return def.group?.documents.find((d) => d.slot === slot) || null
}

/** Pure: per-slot and per-case file caps (throws a user-facing 400). */
export function assertDocRoom(c: Pick<BgvCaseDoc, 'checks'>, type: BgvCheckType, slot: string, item: number | null, multiple: number | undefined): void {
  const k = c.checks.find((x) => x.type === type)
  const already = (k?.documents || []).filter((d) => d.slot === slot && d.item === item).length
  if (already >= (multiple || 1)) throw new AtsError(400, multiple ? `You can upload up to ${multiple} files here. Remove one first.` : 'Remove the current file first.')
  if (c.checks.reduce((n, x) => n + x.documents.length, 0) >= MAX_DOCS_PER_CASE) throw new AtsError(400, 'Too many files on this verification.')
}

export async function uploadDocument(c: BgvCaseDoc, p: { type: unknown; slot: unknown; item: unknown; name: string; bytes: Uint8Array }): Promise<BgvCaseDoc> {
  const k0 = findCheck(c, p.type)
  if (!checkEditable(c, k0)) throw new AtsError(409, c.consent ? 'This part can no longer be changed' : 'Give your consent first')
  const slot = typeof p.slot === 'string' ? p.slot : ''
  const item = p.item === null || p.item === undefined || p.item === '' ? null : Number(p.item)
  if (item !== null && (!Number.isInteger(item) || item < 0 || item > 20)) throw new AtsError(400, 'Invalid item')
  const sd = slotDef(c, k0.type, slot, item)
  if (!sd) throw new AtsError(400, 'Unknown document')
  assertDocRoom(c, k0.type, slot, item, sd.multiple)
  const doc = await storeDocument({ tenantId: c.tenant_id, caseId: c.id, slot, item, name: p.name, bytes: p.bytes })
  try {
    return await mutate(c, (cur) => {
      const k = findCheck(cur, k0.type)
      if (!checkEditable(cur, k)) throw new AtsError(409, 'This part can no longer be changed')
      assertDocRoom(cur, k0.type, slot, item, sd.multiple) // re-checked on the fresh read: parallel uploads can't exceed the caps
      k.documents.push(doc)
      k.updated_at = nowIso()
      return cur
    })
  } catch (e) {
    await deleteDocuments(c.tenant_id, c.id, [doc]).catch(() => {})
    throw e
  }
}

export async function removeDocument(c: BgvCaseDoc, docId: unknown): Promise<BgvCaseDoc> {
  let removed: BgvCheck['documents'][number] | null = null
  const next = await mutate(c, (cur) => {
    for (const k of cur.checks) {
      const i = k.documents.findIndex((d) => d.id === docId)
      if (i < 0) continue
      if (!checkEditable(cur, k)) throw new AtsError(409, 'This part can no longer be changed')
      removed = k.documents.splice(i, 1)[0]
      k.updated_at = nowIso()
      return cur
    }
    throw new AtsError(404, 'File not found')
  })
  if (removed) await deleteDocuments(c.tenant_id, c.id, [removed]).catch((e) => console.error('[ats/bgv] delete file failed', e))
  return next
}

/** Candidate submits (first time, or after a more-info request). */
export async function submitCase(c: BgvCaseDoc): Promise<{ case: BgvCaseDoc; missing: Record<string, string[]> }> {
  if (!c.consent) throw new AtsError(409, 'Give your consent first')
  const missing: Record<string, string[]> = {}
  for (const k of c.checks) {
    if (!checkEditable(c, k)) continue
    const m = missingItems(c.region, k, c.options)
    if (m.length) missing[k.type] = m
  }
  if (Object.keys(missing).length) return { case: c, missing }
  const first = !c.submitted_at
  const next = await mutate(c, (cur) => {
    if (cur.status === 'cancelled' || cur.status === 'clear' || cur.status === 'failed') throw new AtsError(409, 'This verification is closed')
    const at = nowIso()
    if (!cur.submitted_at) cur.submitted_at = at
    for (const k of cur.checks) {
      if (k.status === 'not_started' || (k.info_request && !DECIDED.has(k.status))) { k.status = 'submitted'; k.updated_at = at }
      if (k.info_request) { k.info_request = null; k.status = 'submitted' }
    }
    return cur
  })
  const { job } = await loadRefs(next)
  await notifyTeam(next, job?.recruiter_ids || [], first ? 'Background check submitted' : 'Background check updated',
    `${next.candidate_name} ${first ? 'submitted their background verification' : 'sent the information you asked for'} (${next.job_title}).`)
  if (first && next.vendor !== 'manual') {
    try {
      return { case: await orderVendor(next), missing: {} }
    } catch (e) {
      console.error('[ats/bgv] vendor order failed', next.id, e)
    }
  }
  return { case: next, missing: {} }
}

// ─── Vendors ─────────────────────────────────────────────────────────────────

async function vendorContext(c: BgvCaseDoc): Promise<VendorContext> {
  const settings = await getBgvSettings(c.tenant_id)
  const secrets = await getVendorSecrets(c.tenant_id)
  const id = c.checks.find((k) => k.type === 'identity')
  const sens = (await decryptSensitive<Record<string, string>>(id?.enc)) || {}
  const mvr = c.checks.find((k) => k.type === 'mvr')
  const mvrSens = (await decryptSensitive<Record<string, string>>(mvr?.enc)) || {}
  const d = (id?.data || {}) as Record<string, unknown>
  const full = String(d.full_name || c.candidate_name || '').trim().split(/\s+/)
  const addr = c.checks.find((k) => k.type === 'address')?.data as Record<string, unknown> | undefined
  const items = (Array.isArray(addr?.addresses) ? addr!.addresses : []) as Record<string, unknown>[]
  const current = items.find((a) => a.current === true) || items[0]
  const pii: VendorPii = {
    first_name: String(d.first_name || full[0] || ''),
    middle_name: (d.middle_name as string) || null,
    last_name: String(d.last_name || full.slice(1).join(' ') || ''),
    email: c.candidate_email,
    phone: (d.phone as string) || null,
    dob: (d.dob as string) || null,
    ssn: sens.ssn || null,
    zipcode: (current?.zip as string) || (addr?.current_pin as string) || null,
    dl_number: mvrSens.dl_number || null,
    dl_state: ((mvr?.data || {}) as Record<string, unknown>).dl_state as string || null,
  }
  // Per-check sensitive values (PAN, ID numbers), decrypted only when a vendor asks while ordering.
  const sensitive = async (type: BgvCheckType) => (await decryptSensitive<Record<string, string>>(c.checks.find((k) => k.type === type)?.enc)) || {}
  return { case: c, settings, secrets, pii, sensitive }
}

export async function orderVendor(c: BgvCaseDoc): Promise<BgvCaseDoc> {
  const vendor = getVendor(c.vendor)
  if (vendor.id === 'manual') return c
  if (!vendor.ready) throw new AtsError(400, `${vendor.label} isn't available yet. Use manual verification.`)
  // Nothing goes to a vendor without the candidate's (unwithdrawn) consent — DPDP / FCRA.
  if (!c.consent || c.consent.withdrawn_at) throw new AtsError(409, 'The candidate has not given (or has withdrawn) consent for background verification')
  // Atomic claim: concurrent submit / assign can't place two orders with the vendor.
  const claim = `vendor_order:${vendor.id}`
  if (!(await claimSend(c.id, claim))) throw new AtsError(409, 'Already sent to this vendor')
  let res
  try {
    res = await vendor.order(await vendorContext(c))
  } catch (e) {
    await releaseSend(c.id, claim)
    if (e instanceof VendorError) {
      await notifyTeam(c, [], 'Background check vendor error', `${c.candidate_name}: ${e.message}`)
      throw new AtsError(e.status >= 500 ? 502 : 400, e.message)
    }
    throw e
  }
  return mutate(c, (cur) => {
    cur.vendor_ref = res.candidate_ref ?? cur.vendor_ref ?? null
    cur.vendor_report_ref = res.report_ref ?? cur.vendor_report_ref ?? null
    cur.vendor_ordered_at = nowIso()
    cur.vendor_invitation_url = res.invitation_url ?? null
    for (const k of cur.checks) {
      if (res.checks.includes(k.type) && (k.status === 'submitted' || k.status === 'not_started')) { k.status = 'in_progress'; k.updated_at = nowIso() }
      const ref = res.check_refs?.[k.type]
      if (ref) k.vendor_ref = ref
      const f = res.failed?.find((x) => x.type === k.type)
      if (f) { k.notes = clip(`${k.notes ? `${k.notes}\n` : ''}Not sent to ${vendor.label} — verify manually: ${f.message}`, 2000); k.updated_at = nowIso() }
    }
    return cur
  })
}

/** Pure: is a polling vendor due for another status read? */
export function vendorPollDue(c: Pick<BgvCaseDoc, 'vendor_ordered_at' | 'vendor_polled_at' | 'checks'>, now = new Date()): boolean {
  if (!c.vendor_ordered_at || !c.checks.some((k) => k.status === 'in_progress' && !k.info_request)) return false
  const last = Date.parse(c.vendor_polled_at || c.vendor_ordered_at)
  return !Number.isFinite(last) || now.getTime() - last >= VENDOR_POLL_EVERY_MS
}
export const VENDOR_POLL_EVERY_MS = 30 * 60_000

/** Pure: which check a vendor reference points at (per-check vendor_ref, or our "<case id>:<type>"). */
export function checkForRef(c: Pick<BgvCaseDoc, 'id' | 'checks'>, ref: string): BgvCheckType | null {
  const byRef = c.checks.find((k) => k.vendor_ref === ref)
  if (byRef) return byRef.type
  const m = /^(.+):([a-z_]+)$/.exec(ref)
  return m && m[1] === c.id && c.checks.some((k) => k.type === m[2]) ? (m[2] as BgvCheckType) : null
}

/** Apply vendor per-check results (webhook / poll). Verifier decisions already made stay. */
export async function applyVendorResults(c: BgvCaseDoc, results: { type: BgvCheckType; status: BgvCheckStatus; notes?: string | null; vendor_ref?: string | null }[]): Promise<BgvCaseDoc> {
  if (!results.length) return c
  return mutate(c, (cur) => applyVendorResultsTo(cur, results))
}

/**
 * Pure: vendor results onto a case (null = no change). Closed / purged cases
 * don't change. While an adverse action is open the results are frozen: each
 * is recorded once as a pending note for the verifier, not applied.
 */
export function applyVendorResultsTo(cur: BgvCaseDoc, results: { type: BgvCheckType; status: BgvCheckStatus; notes?: string | null; vendor_ref?: string | null }[]): BgvCaseDoc | null {
  if (cur.purged_at || cur.status === 'clear' || cur.status === 'failed' || cur.status === 'cancelled') return null
  const frozen = adverseOpen(cur)
  let changed = false
  for (const r of results) {
    const k = cur.checks.find((x) => x.type === r.type)
    if (!k || DECIDED.has(k.status) || k.status === r.status) continue
    if (frozen) {
      const line = `Vendor update received during adverse action (not applied): ${r.status}${r.notes ? ` — ${clip(r.notes, 500)}` : ''}`
      if ((k.notes || '').includes(line)) continue
      k.notes = clip(`${k.notes ? `${k.notes}\n` : ''}${line}`, 4000)
      k.updated_at = nowIso()
      changed = true
      continue
    }
    k.status = r.status
    if (r.notes) {
      k.notes = clip(`${k.notes ? `${k.notes}\n` : ''}${r.notes}`, 2000)
      k.vendor_notes = clip(r.notes, 1000) // neutral vendor finding: the only note a candidate notice may quote
    }
    if (r.vendor_ref) k.vendor_ref = r.vendor_ref
    if (DECIDED.has(r.status)) { k.verified_by = `vendor:${cur.vendor}`; k.verified_at = nowIso() }
    k.updated_at = nowIso()
    changed = true
  }
  return changed ? cur : null
}

/** A pre-adverse notice went out and the action is neither withdrawn nor final. */
export function adverseOpen(c: Pick<BgvCaseDoc, 'adverse_action'>): boolean {
  const a = c.adverse_action
  return !!a?.pre_adverse_sent_at && !a.withdrawn_at && !a.final_sent_at
}

/** Vendor webhook (authenticity verified by the caller). Idempotent per event id. */
export async function handleVendorEvent(tenantId: string, vendorId: string, ev: WebhookEvent): Promise<'ok' | 'unknown_case' | 'duplicate'> {
  const col = await bgvCases()
  const or: Record<string, string>[] = []
  if (ev.report_ref) or.push({ vendor_report_ref: ev.report_ref })
  if (ev.candidate_ref) or.push({ vendor_ref: ev.candidate_ref })
  for (const ref of ev.check_refs || []) {
    or.push({ 'checks.vendor_ref': ref })
    const m = /^(.+):[a-z_]+$/.exec(ref)
    if (m) or.push({ id: m[1] })
  }
  if (!or.length) return 'unknown_case'
  const c = (await col.findOne({ tenant_id: tenantId, vendor: vendorId, $or: or }, { projection: { _id: 0 } })) as BgvCaseDoc | null
  if (!c) return 'unknown_case'
  if ((c.vendor_events || []).includes(ev.id)) return 'duplicate'
  let cur = c
  if (ev.report_ref && !c.vendor_report_ref) {
    cur = await mutate(c, (x) => { x.vendor_report_ref = ev.report_ref; return x })
  }
  if (ev.refresh || ev.type.startsWith('report.')) {
    const vendor = getVendor(vendorId)
    const st = await vendor.getStatus(await vendorContext(cur))
    await applyVendorResults(cur, st.checks)
  } else if (ev.check_updates?.length) {
    const results = ev.check_updates
      .map((u) => ({ type: checkForRef(cur, u.ref), status: u.status, notes: u.notes ?? null }))
      .filter((r): r is { type: BgvCheckType; status: BgvCheckStatus; notes: string | null } => !!r.type && r.status !== 'in_progress')
    await applyVendorResults(cur, results)
  }
  // Recorded after processing, so a failed attempt is retried; re-applying is a no-op.
  await col.updateOne({ id: c.id, tenant_id: tenantId }, { $push: { vendor_events: { $each: [ev.id], $slice: -200 } } } as never)
  return 'ok'
}

// ─── Verifier workflow ───────────────────────────────────────────────────────

const PRE_ADVERSE_SENDING = 'pre_adverse_sending'
const MARKABLE: BgvCheckStatus[] = ['in_progress', 'verified', 'discrepancy', 'unable_to_verify', 'waived']

export async function markCheck(actor: AtsActor, c: BgvCaseDoc, type: unknown, status: unknown, notes: unknown): Promise<BgvCaseDoc> {
  if (!MARKABLE.includes(status as BgvCheckStatus)) throw new AtsError(400, 'Choose a result')
  const st = status as BgvCheckStatus
  const text = clip(notes, 2000)
  if ((st === 'discrepancy' || st === 'unable_to_verify' || st === 'waived') && !text) throw new AtsError(400, 'Add a note explaining this result')
  return mutate(c, (cur) => {
    if (cur.purged_at || cur.status === 'cancelled' || cur.status === 'failed' || cur.status === 'clear') throw new AtsError(409, 'This background check is closed')
    const k = findCheck(cur, type)
    if (st !== 'waived' && !cur.submitted_at && checkDef(cur.region, k.type)?.candidate_input) throw new AtsError(409, 'Wait for the candidate to submit first')
    if (cur.adverse_action?.pre_adverse_sent_at && !cur.adverse_action.withdrawn_at) throw new AtsError(409, 'An adverse action is in progress — withdraw it before changing results')
    k.status = st
    k.info_request = null
    if (text) k.notes = clip(`${k.notes ? `${k.notes}\n` : ''}${actor.name || 'Verifier'}: ${text}`, 4000)
    k.verified_by = DECIDED.has(st) ? actor.userId : null
    k.verified_at = DECIDED.has(st) ? nowIso() : null
    k.updated_at = nowIso()
    return cur
  })
}

export async function requestInfo(actor: AtsActor, c: BgvCaseDoc, type: unknown, message: unknown): Promise<BgvCaseDoc> {
  const msg = clip(message, 1000)
  if (msg.length < 5) throw new AtsError(400, 'Tell the candidate what you need')
  const next = await mutate(c, (cur) => {
    if (cur.purged_at || ['cancelled', 'failed', 'clear'].includes(cur.status)) throw new AtsError(409, 'This background check is closed')
    const k = findCheck(cur, type)
    if (!checkDef(cur.region, k.type)?.candidate_input) throw new AtsError(400, 'The candidate has nothing to add for this check')
    if (!cur.submitted_at) throw new AtsError(409, 'The candidate is still filling this in')
    k.info_request = { message: msg, at: nowIso(), by: actor.userId }
    k.status = 'in_progress'
    k.verified_by = null
    k.verified_at = null
    k.notes = clip(`${k.notes ? `${k.notes}\n` : ''}${actor.name || 'Verifier'} asked for more information: ${msg}`, 4000)
    k.updated_at = nowIso()
    return cur
  })
  const { job } = await loadRefs(next)
  await sendInfoRequest(next, await portalLink(next), await companyName(next.tenant_id, job?.client_id ?? null), CHECK_LABEL(next.region, findCheck(next, type).type), msg)
  return next
}

export async function assignVendor(_actor: AtsActor, c: BgvCaseDoc, vendorId: unknown): Promise<BgvCaseDoc> {
  const v = getVendor(typeof vendorId === 'string' ? vendorId : 'manual')
  if (v.id !== vendorId) throw new AtsError(400, 'Unknown vendor')
  if (!v.regions.includes(c.region)) throw new AtsError(400, `${v.label} doesn't cover this region`)
  if (!v.ready) throw new AtsError(400, `${v.label} needs the vendor's API access first. Use manual verification for now.`)
  if (v.id === DEMO_VENDOR_ID && !(await simulatedVendorAllowed())) throw new AtsError(400, 'The demo vendor is not available. Use manual verification or a real vendor.')
  if (c.vendor_ordered_at && c.vendor === v.id) throw new AtsError(409, 'Already sent to this vendor')
  const next = await mutate(c, (cur) => {
    if (['cancelled', 'failed', 'clear'].includes(cur.status) || cur.purged_at) throw new AtsError(409, 'This background check is closed')
    cur.vendor = v.id
    return cur
  })
  return next.submitted_at && v.id !== 'manual' ? orderVendor(next) : next
}

export async function decide(actor: AtsActor, c: BgvCaseDoc, decision: unknown, note: unknown): Promise<{ case: BgvCaseDoc; adverse_started?: boolean }> {
  if (decision !== 'pass' && decision !== 'fail') throw new AtsError(400, 'Choose pass or fail')
  if (c.status !== 'consider') throw new AtsError(409, c.status === 'clear' ? 'This background check is already clear' : 'A decision is needed only when the result is "consider"')
  const text = clip(note, 1000) || null
  if (decision === 'pass') {
    const next = await mutate(c, (cur) => {
      if (cur.status !== 'consider') return null
      cur.decision = { outcome: 'pass', by: actor.userId, at: nowIso(), note: text }
      if (cur.adverse_action && !cur.adverse_action.final_sent_at) cur.adverse_action.withdrawn_at = nowIso()
      return cur
    })
    return { case: next }
  }
  if (c.region === 'US') {
    if (c.adverse_action?.pre_adverse_sent_at && !c.adverse_action.withdrawn_at) throw new AtsError(409, 'The pre-adverse notice was already sent — send the final notice after the waiting period')
    if (!c.candidate_email) throw new AtsError(409, 'The candidate has no email address for the pre-adverse notice')
    const settings = await getBgvSettings(c.tenant_id)
    // FCRA: the adverse action starts only once the candidate actually got the notice.
    // Claim → send → persist on success; on failure release the claim and surface the error.
    if (!(await claimSend(c.id, PRE_ADVERSE_SENDING))) throw new AtsError(409, 'The pre-adverse notice is already being sent')
    try {
      const adverse = startAdverse(new Date(), settings.adverse_waiting_days, text, actor.userId)
      const { job } = await loadRefs(c)
      const finalOn = new Date(adverse.earliest_final_at!).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
      const ok = await sendPreAdverse({ ...c, adverse_action: adverse }, await companyName(c.tenant_id, job?.client_id ?? null), finalOn)
      if (!ok) throw new AtsError(502, "The pre-adverse notice couldn't be emailed, so the adverse action was not started. Check the candidate's email address and try again.")
      const next = await mutate(c, (cur) => {
        if (adverseOpen(cur)) return null
        cur.adverse_action = adverse
        return cur
      })
      return { case: next, adverse_started: true }
    } finally {
      await releaseSend(c.id, PRE_ADVERSE_SENDING)
    }
  }
  const next = await mutate(c, (cur) => {
    if (cur.status !== 'consider') return null
    cur.decision = { outcome: 'fail', by: actor.userId, at: nowIso(), note: text }
    return cur
  })
  return { case: next }
}

export async function sendFinalAdverseAction(actor: AtsActor, c: BgvCaseDoc): Promise<BgvCaseDoc> {
  if (c.status !== 'consider') throw new AtsError(409, 'A final adverse notice can only follow a "consider" result')
  if (!canSendFinalAdverse(c.adverse_action)) {
    throw new AtsError(409, c.adverse_action?.earliest_final_at ? `The waiting period ends on ${new Date(c.adverse_action.earliest_final_at).toUTCString().slice(0, 16)}` : 'Send the pre-adverse notice first')
  }
  const { job } = await loadRefs(c)
  const company = await companyName(c.tenant_id, job?.client_id ?? null)
  // One final notice per pre-adverse notice; recorded only once it was actually sent.
  const key = `final_adverse:${c.adverse_action!.pre_adverse_sent_at}`
  if (!(await claimSend(c.id, key))) throw new AtsError(409, 'The final notice was already sent')
  if (!(await sendFinalAdverse(c, company))) {
    await releaseSend(c.id, key)
    await notifyTeam(c, job?.recruiter_ids || [], 'Final adverse action notice not sent', `We couldn't email the final adverse action notice to ${c.candidate_name}. Nothing was recorded — check the email address and try again.`)
    throw new AtsError(502, "The final notice couldn't be emailed. Nothing was recorded — try again.")
  }
  return mutate(c, (cur) => {
    if (cur.status !== 'consider' || !canSendFinalAdverse(cur.adverse_action)) return null
    cur.adverse_action = { ...cur.adverse_action!, final_sent_at: nowIso() }
    cur.decision = { outcome: 'fail', by: actor.userId, at: nowIso(), note: cur.adverse_action.reason ?? null }
    return cur
  })
}

export async function withdrawAdverse(actor: AtsActor, c: BgvCaseDoc): Promise<BgvCaseDoc> {
  return mutate(c, (cur) => {
    const a = cur.adverse_action
    if (!a?.pre_adverse_sent_at || a.final_sent_at || a.withdrawn_at) throw new AtsError(409, 'There is no adverse action to withdraw')
    cur.adverse_action = { ...a, withdrawn_at: nowIso(), by: actor.userId }
    return cur
  })
}

export async function resendLink(c: BgvCaseDoc): Promise<BgvCaseDoc> {
  if (!c.candidate_email) throw new AtsError(409, 'The candidate has no email address')
  if (c.purged_at || ['cancelled', 'failed', 'clear'].includes(c.status)) throw new AtsError(409, 'This background check is closed')
  const settings = await getBgvSettings(c.tenant_id)
  const next = await mutate(c, (cur) => {
    cur.token_nonce = newNonce()
    if (!cur.submitted_at && (!cur.deadline || Date.parse(cur.deadline) < Date.now() + 86_400_000)) {
      cur.deadline = new Date(Date.now() + settings.form_deadline_days * 86_400_000).toISOString()
      cur.reminders_sent = 0
      cur.last_reminder_at = null
    }
    return cur
  })
  const { job, candidate } = await loadRefs(next)
  await sendInvite(next, candidate, await portalLink(next), await companyName(next.tenant_id, job?.client_id ?? null), 'resend')
  return next
}

/** Admin only (route checks): decrypted sensitive values of one check. */
export async function revealSensitive(c: BgvCaseDoc, type: unknown): Promise<Record<string, string>> {
  const k = findCheck(c, type)
  return (await decryptSensitive<Record<string, string>>(k.enc)) || {}
}

export async function documentViewUrl(c: BgvCaseDoc, docId: unknown, viewerId: string): Promise<{ url: string; name: string; type: string }> {
  const doc = c.checks.flatMap((k) => k.documents).find((d) => d.id === docId)
  if (!doc) throw new AtsError(404, 'File not found')
  const token = await fileViewToken(c.tenant_id, c.id, doc.id, viewerId)
  return { url: `/api/ats/bgv/files/${token}`, name: doc.name, type: doc.type }
}

/** Erase the candidate's BGV data now (on request); the outcome summary stays. */
export async function eraseCaseData(c: BgvCaseDoc, reason: 'retention' | 'candidate_request'): Promise<BgvCaseDoc> {
  const col = await bgvCases()
  const fresh = (await col.findOne({ id: c.id, tenant_id: c.tenant_id }, { projection: { _id: 0 } })) as BgvCaseDoc | null
  if (!fresh) throw new AtsError(404, 'Background check not found')
  // Every file anyone knew about: the caller's copy, the fresh read and an earlier failed attempt.
  const docs = docUnion(c.checks.flatMap((k) => k.documents), fresh.checks.flatMap((k) => k.documents), fresh.purge_pending?.docs || [])
  const { doc } = purgedCase(fresh, reason)
  // An open case is cancelled by an erase (nothing left to verify).
  if (OPEN.includes(doc.status)) { doc.status = 'cancelled'; doc.closed_at = doc.closed_at || nowIso() }
  doc.token_nonce = newNonce()
  // Files first: purged_at is set only once every file is gone. On failure the case data is still
  // erased, and the remaining files are kept on purge_pending for the sweep to retry.
  let failed = false
  try {
    await deleteDocuments(c.tenant_id, c.id, docs)
  } catch (e) {
    failed = true
    console.error('[ats/bgv] erase: file delete failed, will retry', c.id, e)
  }
  if (failed) {
    doc.purged_at = null
    doc.purge_pending = { reason, docs: docs.map((d) => ({ id: d.id, storage: d.storage })), at: nowIso() }
  } else {
    doc.purge_pending = null
  }
  const { id: _i, tenant_id: _t, ...set } = doc
  await col.updateOne({ id: c.id, tenant_id: c.tenant_id }, { $set: set })
  if (failed) throw new AtsError(502, "Some files couldn't be deleted yet. The data is erased and the files will be retried automatically.")
  return doc
}

/** Pure: documents from several lists, once each (by id). */
export function docUnion<T extends Pick<BgvDocument, 'id' | 'storage'>>(...lists: T[][]): T[] {
  const seen = new Map<string, T>()
  for (const l of lists) for (const d of l) if (d?.id && !seen.has(d.id)) seen.set(d.id, d)
  return [...seen.values()]
}

// ─── Scheduler sweep ─────────────────────────────────────────────────────────

/** Pure: has this case sat in 'consider' longer than CONSIDER_MAX_DAYS? */
export function considerExpired(c: Pick<BgvCaseDoc, 'status' | 'consider_at' | 'updated_at'>, now = new Date()): boolean {
  if (c.status !== 'consider') return false
  const since = Date.parse(c.consider_at || c.updated_at)
  return Number.isFinite(since) && now.getTime() - since >= CONSIDER_MAX_DAYS * 86_400_000
}

export async function runBgvSweep(now = new Date()): Promise<{ reminded: number; expired: number; cancelled: number; vendor: number; purged: number }> {
  const col = await bgvCases()
  const settingsCache = new Map<string, BgvSettingsDoc>()
  const settingsOf = async (t: string) => {
    if (!settingsCache.has(t)) settingsCache.set(t, await getBgvSettings(t))
    return settingsCache.get(t)!
  }
  const out = { reminded: 0, expired: 0, cancelled: 0, vendor: 0, purged: 0 }
  const nowIsoStr = now.toISOString()

  const open = (await col.find({ status: { $in: OPEN }, purged_at: { $in: [null, undefined] } } as never, { projection: { _id: 0 } }).limit(500).toArray()) as BgvCaseDoc[]
  for (const c of open) {
    try {
      const { app, job, candidate } = await loadRefs(c)
      // Candidate left the stage (moved / rejected / withdrawn): cancel quietly.
      if (!app || app.status === 'withdrawn' || app.stage_id !== c.stage_id || !isCurrentEntry(app, c.entry_key)) {
        // Always closed (sets closed_at), so the retention purge runs even when an outcome was recorded.
        await mutate(c, (cur) => { if (!OPEN.includes(cur.status)) return null; cur.status = 'cancelled'; return cur })
        out.cancelled++
        continue
      }
      // Left in 'consider' too long without a decision: close it so retention applies.
      if (considerExpired(c, now)) {
        const next = await mutate(c, (cur) => { if (!considerExpired(cur, now)) return null; cur.status = 'cancelled'; return cur })
        if (next.status === 'cancelled') {
          await notifyTeam(c, job?.recruiter_ids || [], 'Background check closed without a decision',
            `${c.candidate_name}'s background check (${c.job_title}) waited ${CONSIDER_MAX_DAYS} days for a decision and was closed. Start a new one from the candidate's page if needed.`)
          out.cancelled++
        }
        continue
      }
      const s = await settingsOf(c.tenant_id)
      const company = await companyName(c.tenant_id, job?.client_id ?? null)
      if (!c.submitted_at && c.deadline) {
        if (c.deadline < nowIsoStr) {
          if (await claimSend(c.id, `deadline:${c.deadline}`)) {
            await mutate(c, (cur) => { if (cur.submitted_at) return null; cur.status = 'cancelled'; return cur })
            await recordOutcome(c, 'fail', 'Background verification was not completed by the deadline')
            await notifyTeam(c, job?.recruiter_ids || [], 'Background check not completed', `${c.candidate_name} didn't finish the background verification for ${c.job_title} by the deadline.`)
            out.expired++
          }
          continue
        }
        const lastAt = Date.parse(c.last_reminder_at || c.created_at)
        if (c.reminders_sent < s.max_reminders && now.getTime() - lastAt >= s.reminder_every_days * 86_400_000 && c.candidate_email) {
          const r = await col.updateOne({ id: c.id, tenant_id: c.tenant_id, reminders_sent: c.reminders_sent }, { $set: { reminders_sent: c.reminders_sent + 1, last_reminder_at: nowIsoStr } })
          if (r.modifiedCount) { await sendInvite(c, candidate, await portalLink(c), company, 'reminder'); out.reminded++ }
        }
      }
      // Simulated vendor: completes on the next sweep after ordering.
      if (c.vendor === 'simulated' && c.vendor_ordered_at && c.checks.some((k) => k.status === 'in_progress' && !k.info_request)) {
        const st = await getVendor('simulated').getStatus(await vendorContext(c))
        await applyVendorResults(c, st.checks)
        out.vendor++
      }
      // Polling vendors (IDfy, AuthBridge): webhook fallback, at most every VENDOR_POLL_EVERY_MS per case.
      const pv = getVendor(c.vendor)
      if (pv.poll && vendorPollDue(c, now)) {
        const r = await col.updateOne({ id: c.id, tenant_id: c.tenant_id, vendor_polled_at: c.vendor_polled_at ?? null } as never, { $set: { vendor_polled_at: nowIsoStr } })
        if (r.modifiedCount) {
          const st = await pv.getStatus(await vendorContext(c))
          await applyVendorResults(c, st.checks)
          out.vendor++
        }
      }
      // US adverse action: tell the recruiter when the waiting period is over.
      const a = c.adverse_action
      if (a && canSendFinalAdverse(a, now) && !a.wait_over_notified) {
        const r = await col.updateOne({ id: c.id, tenant_id: c.tenant_id, 'adverse_action.wait_over_notified': false }, { $set: { 'adverse_action.wait_over_notified': true } })
        if (r.modifiedCount) await notifyTeam(c, job?.recruiter_ids || [], 'Adverse action waiting period over', `You can now send the final adverse action notice to ${c.candidate_name}, or withdraw it.`)
      }
    } catch (e) {
      console.error('[ats/bgv] sweep failed for case', c.id, e)
    }
  }

  // Erasures whose file deletes failed earlier: retry.
  const pending = (await col.find({ purge_pending: { $type: 'object' } } as never, { projection: { _id: 0 } }).limit(100).toArray()) as BgvCaseDoc[]
  for (const c of pending) {
    try {
      await eraseCaseData(c, c.purge_pending!.reason)
      out.purged++
    } catch (e) {
      console.error('[ats/bgv] purge retry failed for case', c.id, e)
    }
  }

  // Retention purge (outcome kept).
  const minCutoff = new Date(now.getTime() - 30 * 86_400_000).toISOString()
  const closed = (await col.find({ closed_at: { $lt: minCutoff }, purged_at: { $in: [null, undefined] } } as never, { projection: { _id: 0 } }).limit(200).toArray()) as BgvCaseDoc[]
  for (const c of closed) {
    try {
      const s = await settingsOf(c.tenant_id)
      if (!purgeDue(c, s.retention_days, now)) continue
      await eraseCaseData(c, 'retention')
      out.purged++
    } catch (e) {
      console.error('[ats/bgv] purge failed for case', c.id, e)
    }
  }
  return out
}
