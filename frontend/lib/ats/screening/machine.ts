/**
 * Bot-screen state machine. One ScreeningCallDoc per (stage entry, channel);
 * channels are tried in the stage's order, falling back on no answer / no
 * permission / provider failure. Inputs: stage entry (handler.ts), WhatsApp
 * webhooks (messages, call permission replies, call status), voice-agent
 * reports and the scheduler tick (quiet hours, reminders, timeouts, retries).
 *
 *  whatsapp_chat : consent template → questions one by one → score
 *  whatsapp_call : consent template → call_permission_request → call (SIP / Graph) → agent report → score
 *  phone_call    : (consent via WhatsApp template when missing) → Vapi/agent call → report → score
 */
import type { AtsApplication, AtsCandidate, AtsJob, BotChannel, PipelineStage, StageHandlerContext, StageResult } from '@/lib/ats/contract'
import { atsApplications, atsCandidates, atsJobs } from '@/lib/ats/db'
import { recordStageResult } from '@/lib/ats/engine'
import { extractAnswer, isKnockedOut } from './answers'
import {
  getPlatformConfig, getTenantSettings, platformNumbers, vapiReady, whatsappCallReady, whatsappReady,
  type PlatformScreeningConfig, type ResolvedTenantSettings,
} from './config'
import { isWithinOutreachWindow, nextOutreachTime } from './quiet-hours'
import { pickRegionNumbers, toE164, type RoutedNumbers } from './regions'
import { scoreScreening } from './scoring'
import { callsCol, newId, nowIso } from './store'
import { transcribeAudio } from './transcribe'
import { metaTransport, simulatedTransport, whatsappSipTarget, type WhatsAppTransport } from './providers/whatsapp'
import { simulatedAgent, vapiAgent, webhookAgent, isNoAnswer, type VoiceAgent, type VoiceReport } from './providers/voice'
import { ACTIVE_STATUSES, type BotScreenConfig, type ScreeningCallDoc, type ScreeningQuestion } from './types'

const H = 3600_000
const MAX_REPROMPTS = 2
/** WhatsApp call permission requests: at most 1 per 24h and 2 per 7 days per user. */
const PERMISSION_LIMITS = { day: 1, week: 2 }
const DEFAULT_PERMISSION_WINDOW_H = 72

// ─── Context ────────────────────────────────────────────────────────────────

export interface Ctx {
  call: ScreeningCallDoc
  app: AtsApplication
  job: AtsJob
  candidate: AtsCandidate
  stage: PipelineStage
  config: BotScreenConfig
  cfg: PlatformScreeningConfig
  tenant: ResolvedTenantSettings
  numbers: RoutedNumbers
  now: Date
}

function botConfig(stage: PipelineStage | undefined): BotScreenConfig | null {
  return stage?.config?.kind === 'bot_screen' ? stage.config : null
}

/** Test calls carry their own job/candidate snapshot. */
interface TestSnapshot { job: Pick<AtsJob, 'id' | 'title' | 'tenant_id'>; candidate: Pick<AtsCandidate, 'id' | 'name' | 'phone' | 'country' | 'consent'>; config: BotScreenConfig }

async function loadCtx(call: ScreeningCallDoc, now = new Date()): Promise<Ctx | null> {
  const cfg = await getPlatformConfig()
  const tenant = await getTenantSettings(call.tenant_id)
  if (call.is_test) {
    const snap = (call as unknown as { test?: TestSnapshot }).test
    if (!snap) return null
    const stage = { id: call.stage_id, type: 'bot_screen', name: 'Test', advance: 'approval', on_fail: 'review', config: snap.config } as PipelineStage
    const candidate = { ...snap.candidate, tenant_id: call.tenant_id, email: null, tags: [], source: 'manual', created_at: '', updated_at: '' } as AtsCandidate
    const job = { ...snap.job, pipeline: [stage] } as AtsJob
    const app = { id: call.application_id, tenant_id: call.tenant_id, job_id: job.id, candidate_id: candidate.id, stage_id: stage.id, stage_entered_at: call.stage_entered_at, status: 'active' } as AtsApplication
    return { call, app, job, candidate, stage, config: snap.config, cfg, tenant, numbers: pickRegionNumbers(candidate, tenant.regions, platformNumbers(cfg)), now }
  }
  const app = (await (await atsApplications()).findOne({ id: call.application_id, tenant_id: call.tenant_id }, { projection: { _id: 0 } })) as AtsApplication | null
  if (!app) return null
  const job = (await (await atsJobs()).findOne({ id: app.job_id, tenant_id: call.tenant_id }, { projection: { _id: 0 } })) as AtsJob | null
  const candidate = (await (await atsCandidates()).findOne({ id: app.candidate_id, tenant_id: call.tenant_id }, { projection: { _id: 0 } })) as AtsCandidate | null
  const stage = job?.pipeline.find((s) => s.id === call.stage_id)
  const config = botConfig(stage)
  if (!job || !candidate || !stage || !config) return null
  return { call, app, job, candidate, stage, config, cfg, tenant, numbers: pickRegionNumbers(candidate, tenant.regions, platformNumbers(cfg)), now }
}

/** Has the application left the stage entry this call belongs to? */
function stale(ctx: Ctx): boolean {
  return ctx.app.stage_id !== ctx.call.stage_id || ctx.app.stage_entered_at !== ctx.call.stage_entered_at || ctx.app.status !== 'active'
}

// ─── Providers ──────────────────────────────────────────────────────────────

export function chatTransport(ctx: Pick<Ctx, 'cfg' | 'numbers'>): WhatsAppTransport {
  return whatsappReady(ctx.cfg) && ctx.numbers.whatsapp_phone_number_id
    ? metaTransport(ctx.cfg, ctx.numbers.whatsapp_phone_number_id)
    : simulatedTransport()
}

function voiceAgentFor(ctx: Ctx, channel: BotChannel): VoiceAgent {
  const v = ctx.cfg.voice
  if (channel === 'whatsapp_call') {
    if (!whatsappCallReady(ctx.cfg)) return simulatedAgent()
    if (ctx.cfg.whatsapp.call_mode === 'sip' && vapiReady(ctx.cfg) && v.vapi_whatsapp_trunk_number_id) return vapiAgent(v.vapi_api_key!, v.vapi_webhook_secret!)
    return webhookAgent(v.voice_agent_webhook_url!, v.voice_agent_webhook_secret, ctx.cfg.whatsapp.call_mode)
  }
  if (vapiReady(ctx.cfg) && ctx.numbers.vapi_phone_number_id) return vapiAgent(v.vapi_api_key!, v.vapi_webhook_secret!)
  if (v.voice_agent_webhook_url) return webhookAgent(v.voice_agent_webhook_url, v.voice_agent_webhook_secret, 'sip')
  return simulatedAgent()
}

export function providerName(cfg: PlatformScreeningConfig, numbers: RoutedNumbers, channel: BotChannel): string {
  if (channel === 'whatsapp_chat') return whatsappReady(cfg) && numbers.whatsapp_phone_number_id ? 'meta_whatsapp' : 'simulated'
  if (channel === 'whatsapp_call') return whatsappCallReady(cfg) && numbers.whatsapp_phone_number_id ? 'meta_whatsapp' : 'simulated'
  if (vapiReady(cfg) && numbers.vapi_phone_number_id) return numbers.provider && numbers.provider !== 'vapi' ? `vapi_${numbers.provider}` : 'vapi'
  return cfg.voice.voice_agent_webhook_url ? 'voice_agent' : 'simulated'
}

export function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/+$/, '')
}

// ─── Persistence helpers ────────────────────────────────────────────────────

type Patch = Partial<ScreeningCallDoc>

async function save(ctx: Ctx, patch: Patch, push?: ScreeningCallDoc['transcript']): Promise<void> {
  const ts = nowIso()
  const update: Record<string, unknown> = { $set: { ...patch, updated_at: ts } }
  const col = await callsCol()
  await col.updateOne({ id: ctx.call.id }, update)
  if (push?.length) {
    // ponytail: append one by one ($push without $each keeps the fake-mongo test double simple)
    for (const t of push) await col.updateOne({ id: ctx.call.id }, { $push: { transcript: t } } as never)
  }
  Object.assign(ctx.call, patch, { updated_at: ts })
  if (push?.length) ctx.call.transcript = [...(ctx.call.transcript || []), ...push]
}

const botLine = (text: string, at = nowIso()) => ({ role: 'bot' as const, text: text.slice(0, 4000), at })
const candLine = (text: string, at = nowIso()) => ({ role: 'candidate' as const, text: text.slice(0, 4000), at })

/** The per-call lease could not be taken in time. Webhooks let the provider retry; the tick moves on. */
export class ScreeningLockBusy extends Error {
  constructor(public callId: string) {
    super(`screening call ${callId} is busy`)
  }
}

/** Simple per-call lease so webhook + tick never interleave on one call. Throws ScreeningLockBusy on timeout. */
async function withLock<T>(callId: string, fn: () => Promise<T>): Promise<T> {
  const col = await callsCol()
  for (let i = 0; i < 20; i++) {
    const now = Date.now()
    const got = await col.findOneAndUpdate(
      { id: callId, $or: [{ lock_until: { $exists: false } }, { lock_until: null }, { lock_until: { $lt: now } }] } as never,
      { $set: { lock_until: now + 30_000 } } as never,
      { returnDocument: 'after' },
    )
    if (got) {
      try { return await fn() } finally { await col.updateOne({ id: callId }, { $set: { lock_until: null } } as never) }
    }
    await new Promise((r) => setTimeout(r, 150))
  }
  console.warn('[ats/screening] lock busy', callId)
  throw new ScreeningLockBusy(callId)
}

async function fresh(callId: string): Promise<ScreeningCallDoc | null> {
  return (await (await callsCol()).findOne({ id: callId }, { projection: { _id: 0 } })) as ScreeningCallDoc | null
}

// ─── Creating calls ─────────────────────────────────────────────────────────

function channelUsable(channel: BotChannel, candidate: Pick<AtsCandidate, 'consent'>): boolean {
  const c = candidate.consent || {}
  if (channel === 'phone_call') return c.calls !== false
  return c.whatsapp !== false && (channel !== 'whatsapp_call' || c.calls !== false)
}

async function insertCall(base: {
  tenant_id: string; app: Pick<AtsApplication, 'id' | 'job_id' | 'candidate_id' | 'stage_entered_at'>; stage_id: string; entry_key: string
  channels: BotChannel[]; index: number; to: string; country: string | null; language: string; provider: string; from: string | null
  is_test?: boolean; extra?: Record<string, unknown>; wa_from?: string | null
}): Promise<ScreeningCallDoc> {
  const ts = nowIso()
  const doc: ScreeningCallDoc = {
    id: newId(),
    tenant_id: base.tenant_id,
    application_id: base.app.id,
    job_id: base.app.job_id,
    candidate_id: base.app.candidate_id,
    stage_id: base.stage_id,
    stage_entered_at: base.app.stage_entered_at,
    entry_key: base.entry_key,
    entry_channel: `${base.entry_key}#${base.channels[base.index]}`,
    channel: base.channels[base.index],
    channels: base.channels,
    channel_index: base.index,
    provider: base.provider,
    to: base.to,
    from: base.from,
    country: base.country,
    language: base.language,
    status: 'queued',
    step: 'awaiting_consent',
    attempt: 1,
    question_index: 0,
    reprompts: 0,
    transcript: [],
    answers: {},
    score: null,
    summary: null,
    recording_url: null,
    provider_ref: null,
    next_action: null,
    next_action_at: null,
    is_test: base.is_test || false,
    wa_from: base.wa_from ?? null,
    created_at: ts,
    updated_at: ts,
    ...(base.extra || {}),
  }
  const col = await callsCol()
  try {
    await col.insertOne(doc as never)
    return doc
  } catch (e) {
    if ((e as { code?: number })?.code !== 11000) throw e
    return (await col.findOne({ entry_channel: doc.entry_channel }, { projection: { _id: 0 } })) as ScreeningCallDoc
  }
}

/** Stage entry → first usable channel. Idempotent per entry (unique entry_key+channel). */
export async function startBotScreen(h: StageHandlerContext): Promise<ScreeningCallDoc | null> {
  const config = botConfig(h.stage)
  if (!config) return null
  const channels = (config.channels?.length ? config.channels : ['whatsapp_chat']) as BotChannel[]
  const to = toE164(h.candidate.phone, h.candidate.country)
  if (!to) {
    await recordStageResult(h.app.id, {
      stage_id: h.stage.id, outcome: 'pending', summary: 'No valid phone number on file — add one and restart the bot screen, or screen manually.', at: nowIso(),
    }, { entryKey: h.idempotencyKey })
    return null
  }
  const existing = await (await callsCol()).findOne({ entry_key: h.idempotencyKey }, { projection: { _id: 0 } })
  if (existing) return existing as ScreeningCallDoc
  return startChannelAt(h.app, h.candidate, h.stage, config, h.idempotencyKey, channels, 0, to)
}

async function startChannelAt(
  app: AtsApplication, candidate: AtsCandidate, stage: PipelineStage, config: BotScreenConfig,
  entryKey: string, channels: BotChannel[], from: number, to: string, test?: TestSnapshot,
): Promise<ScreeningCallDoc | null> {
  const cfg = await getPlatformConfig()
  const tenant = await getTenantSettings(app.tenant_id)
  const numbers = pickRegionNumbers(candidate, tenant.regions, platformNumbers(cfg))
  for (let i = from; i < channels.length; i++) {
    if (!channelUsable(channels[i], candidate)) continue
    const call = await insertCall({
      tenant_id: app.tenant_id, app, stage_id: stage.id, entry_key: entryKey, channels, index: i, to,
      country: numbers.country, language: config.language || 'en-IN', provider: providerName(cfg, numbers, channels[i]),
      from: channels[i] === 'phone_call' ? numbers.call_number : numbers.whatsapp_phone_number_id,
      wa_from: numbers.whatsapp_phone_number_id,
      is_test: !!test, extra: test ? { test } : undefined,
    })
    try {
      await withLock(call.id, async () => {
        const cur = await fresh(call.id)
        // a concurrent entry may already have started it
        if (!cur || cur.status !== 'queued' || cur.next_action || cur.last_outbound_at || cur.provider_ref) return
        const ctx = await loadCtx(cur)
        if (ctx) await kickOff(ctx)
      })
    } catch (e) {
      // whoever holds the lease is already starting this call
      if (!(e instanceof ScreeningLockBusy)) throw e
    }
    return (await fresh(call.id)) || call
  }
  if (!test) {
    await recordStageResult(app.id, {
      stage_id: stage.id, outcome: 'pending', summary: 'The candidate has opted out of WhatsApp/calls — screen manually.', at: nowIso(),
    }, { entryKey })
  }
  return null
}

/** Admin "test with my number": same flow, no application, never touches the pipeline. */
export async function startTestScreen(p: {
  tenantId: string; userId: string; phone: string; name: string; channel: BotChannel; questions?: ScreeningQuestion[]; language?: string
}): Promise<ScreeningCallDoc | null> {
  const to = toE164(p.phone)
  if (!to) return null
  const config: BotScreenConfig = {
    kind: 'bot_screen', channels: [p.channel], pass_score: 60, max_attempts: 1, language: p.language || 'en-IN',
    questions: p.questions?.length ? p.questions : [
      { id: 'q_relocate', text: 'Are you open to working from our office?', type: 'yes_no' },
      { id: 'q_years', text: 'How many years of professional experience do you have?', type: 'number' },
      { id: 'q_intro', text: 'In one or two sentences, what are you looking for in your next role?', type: 'open' },
    ],
  }
  const entered = nowIso()
  const snap: TestSnapshot = {
    job: { id: 'test_job', title: 'Test screening', tenant_id: p.tenantId },
    candidate: { id: `test_${p.userId}`, name: p.name || 'there', phone: to, country: null, consent: { whatsapp: true, calls: true, at: entered } },
    config,
  }
  const app = { id: `test_${newId()}`, job_id: 'test_job', candidate_id: snap.candidate.id, stage_entered_at: entered, tenant_id: p.tenantId } as AtsApplication
  const stage = { id: 's_test', type: 'bot_screen', name: 'Test', advance: 'approval', on_fail: 'review', config } as PipelineStage
  return startChannelAt(app, snap.candidate as AtsCandidate, stage, config, `${app.id}:s_test:${entered}`, [p.channel], 0, to, snap)
}

// ─── Messages ───────────────────────────────────────────────────────────────

const firstName = (n: string) => (n || '').trim().split(/\s+/)[0] || 'there'

function consentPreview(ctx: Ctx): string {
  const who = firstName(ctx.candidate.name)
  return ctx.call.channel === 'whatsapp_chat'
    ? `Hi ${who}, thanks for applying for ${ctx.job.title}. We'd like to ask you a few quick questions here on WhatsApp (about 3 minutes). Can we start?`
    : `Hi ${who}, thanks for applying for ${ctx.job.title}. We'd like to give you a short automated screening call (about 5 minutes). Is that OK?`
}

/** `reminder`: re-send outside the 24h service window (only templates may be sent before the candidate replies). */
async function sendConsentTemplate(ctx: Ctx, reminder = false): Promise<boolean> {
  const t = chatTransport(ctx)
  const name = ctx.call.channel === 'whatsapp_chat'
    ? ctx.tenant.template_chat || ctx.cfg.whatsapp.template_chat
    : ctx.tenant.template_call || ctx.cfg.whatsapp.template_call
  const preview = consentPreview(ctx)
  const res = await t.sendTemplate(ctx.call.to, {
    name,
    language: ctx.tenant.template_language || ctx.cfg.whatsapp.template_language,
    bodyParams: [firstName(ctx.candidate.name), ctx.job.title],
    quickReplyPayloads: [`${ctx.call.id}|start`, `${ctx.call.id}|decline`],
  }, preview)
  if (!res.ok) {
    await save(ctx, { error: res.error || 'template send failed' })
    return false
  }
  const at = ctx.now.toISOString()
  const line = botLine(`${reminder ? '(Reminder) ' : ''}${preview} [Yes, start] [Not now]`, at)
  if (reminder) {
    await save(ctx, { last_outbound_at: at }, [line])
    return true
  }
  await save(ctx, {
    status: 'in_progress', step: 'awaiting_consent', last_outbound_at: at, reminder_sent: false, error: null,
    ...schedule(ctx, 'remind', ctx.tenant.reminder_after_hours),
  }, [line])
  return true
}

function schedule(ctx: Ctx, action: ScreeningCallDoc['next_action'], hours: number): Pick<ScreeningCallDoc, 'next_action' | 'next_action_at'> {
  return { next_action: action, next_action_at: new Date(ctx.now.getTime() + hours * H).toISOString() }
}

async function askQuestion(ctx: Ctx, reprompt?: string): Promise<void> {
  const qs = ctx.config.questions
  const i = ctx.call.question_index
  const q = qs[i]
  if (!q) return finishChat(ctx)
  const t = chatTransport(ctx)
  const head = `${reprompt ? `${reprompt}\n\n` : ''}Question ${i + 1} of ${qs.length}: ${q.text}`
  const id = (tok: string) => `${ctx.call.id}|${tok}`
  let shown = head
  if (q.type === 'yes_no') {
    await t.sendButtons(ctx.call.to, head, [{ id: id('yes'), title: 'Yes' }, { id: id('no'), title: 'No' }])
    shown += ' [Yes] [No]'
  } else if (q.type === 'choice' && (q.options || []).length && (q.options || []).length <= 3) {
    await t.sendButtons(ctx.call.to, head, (q.options || []).map((o, k) => ({ id: id(`opt_${k}`), title: o })))
    shown += ` [${(q.options || []).join('] [')}]`
  } else if (q.type === 'choice') {
    await t.sendList(ctx.call.to, head, 'Choose', (q.options || []).map((o, k) => ({ id: id(`opt_${k}`), title: o })))
    shown += ` (list: ${(q.options || []).join(', ')})`
  } else {
    const hint = q.type === 'number' ? '\n\n(Reply with a number.)' : '\n\n(Type your answer, or send a voice note.)'
    await t.sendText(ctx.call.to, head + hint)
  }
  const at = ctx.now.toISOString()
  await save(ctx, { step: 'asking', status: 'in_progress', last_outbound_at: at, ...schedule(ctx, 'remind', ctx.tenant.reminder_after_hours) }, [botLine(shown, at)])
}

async function say(ctx: Ctx, text: string): Promise<void> {
  await chatTransport(ctx).sendText(ctx.call.to, text)
  await save(ctx, { last_outbound_at: ctx.now.toISOString() }, [botLine(text, ctx.now.toISOString())])
}

// ─── Starting / dialling ────────────────────────────────────────────────────

/** First action for a queued call (respects quiet hours). */
async function kickOff(ctx: Ctx): Promise<void> {
  if (!isWithinOutreachWindow(ctx.now, ctx.call.country, ctx.tenant.quiet_hours)) {
    const at = nextOutreachTime(ctx.now, ctx.call.country, ctx.tenant.quiet_hours)
    await save(ctx, { status: 'queued', next_action: 'start', next_action_at: (at || new Date(ctx.now.getTime() + 12 * H)).toISOString() })
    return
  }
  const consent = ctx.candidate.consent || {}
  if (ctx.call.channel === 'phone_call' && consent.calls === true) return dial(ctx)
  // no call consent and no real WhatsApp to ask for it → this channel can't be used
  if (ctx.call.channel === 'phone_call' && !whatsappReady(ctx.cfg) && ctx.call.provider !== 'simulated') return fallback(ctx, 'no call consent on file')
  const ok = await sendConsentTemplate(ctx)
  if (!ok) return fallback(ctx, ctx.call.error || 'WhatsApp send failed')
}

async function dial(ctx: Ctx): Promise<void> {
  if (!isWithinOutreachWindow(ctx.now, ctx.call.country, ctx.tenant.quiet_hours)) {
    const at = nextOutreachTime(ctx.now, ctx.call.country, ctx.tenant.quiet_hours)
    const expires = ctx.call.permission?.expires_at ? Date.parse(ctx.call.permission.expires_at) : Infinity
    if (!at || at.getTime() > expires) return fallback(ctx, 'call window expired')
    await save(ctx, { status: 'queued', next_action: 'retry', next_action_at: at.toISOString() })
    return
  }
  const agent = voiceAgentFor(ctx, ctx.call.channel)
  const wa = ctx.call.channel === 'whatsapp_call'
  const sipMode = wa && ctx.cfg.whatsapp.call_mode === 'sip'
  const res = await agent.dial({
    screeningCallId: ctx.call.id,
    to: ctx.call.to,
    toSipUri: sipMode ? whatsappSipTarget(ctx.call.to) : null,
    phoneNumberId: wa ? ctx.cfg.voice.vapi_whatsapp_trunk_number_id : ctx.numbers.vapi_phone_number_id,
    candidateName: ctx.candidate.name,
    jobTitle: ctx.job.title,
    questions: ctx.config.questions,
    language: ctx.call.language,
    serverUrl: `${appBaseUrl()}/api/ats/screening/webhooks/vapi`,
  })
  if (!res.ok) {
    await save(ctx, { error: res.error || 'dial failed' })
    return fallback(ctx, res.error || 'dial failed')
  }
  let ref = res.ref || null
  if (wa && !sipMode) {
    // Graph mode: Meta places the call with the agent's SDP offer; the answer comes back on the calls webhook.
    const placed = await chatTransport(ctx).initiateCall(ctx.call.to, res.sdpOffer || '', ctx.call.id)
    if (!placed.ok) {
      await save(ctx, { error: placed.error || 'call failed' })
      return fallback(ctx, placed.error || 'call failed')
    }
    await save(ctx, { carrier_ref: ref })
    ref = placed.id || ref
  }
  const at = ctx.now.toISOString()
  await save(ctx, {
    status: 'ringing', step: 'calling', provider_ref: ref, error: null,
    // safety net: no report within 2h → treat as no answer
    ...schedule(ctx, 'timeout', 2),
  }, [botLine(`${wa ? 'WhatsApp call' : 'Phone call'} placed (attempt ${ctx.call.attempt}).`, at)])
}

async function requestCallPermission(ctx: Ctx): Promise<void> {
  const col = await callsCol()
  const since = (ms: number) => new Date(ctx.now.getTime() - ms).toISOString()
  const recent = (await col.find({ to: ctx.call.to, channel: 'whatsapp_call', 'permission.requested_at': { $gte: since(7 * 24 * H) } } as never).toArray()) as ScreeningCallDoc[]
  const day = recent.filter((c) => (c.permission?.requested_at || '') >= since(24 * H)).length
  if (day >= PERMISSION_LIMITS.day || recent.length >= PERMISSION_LIMITS.week) return fallback(ctx, 'call permission request limit reached')
  const text = `Great! Please tap below to allow a short WhatsApp call about the ${ctx.job.title} role. We'll call within the next few hours, between ${ctx.tenant.quiet_hours.start}:00 and ${ctx.tenant.quiet_hours.end}:00.`
  const res = await chatTransport(ctx).sendCallPermissionRequest(ctx.call.to, text)
  if (!res.ok) return fallback(ctx, res.error || 'permission request failed')
  const at = ctx.now.toISOString()
  await save(ctx, {
    status: 'permission_requested', step: 'awaiting_permission', permission: { requested_at: at }, last_outbound_at: at,
    ...schedule(ctx, 'timeout', ctx.tenant.permission_timeout_hours),
  }, [botLine(`${text} [Allow calls]`, at)])
}

// ─── Fallback / retries / finish ────────────────────────────────────────────

async function fallback(ctx: Ctx, reason: string): Promise<void> {
  const status: ScreeningCallDoc['status'] = /no answer|timed out|no response|not granted|expired/i.test(reason) ? 'no_answer' : /declin|reject/i.test(reason) ? 'cancelled' : 'failed'
  await save(ctx, { status, step: 'done', next_action: null, next_action_at: null, error: status === 'failed' ? reason : ctx.call.error || null })
  const nextIndex = ctx.call.channel_index + 1
  if (nextIndex < ctx.call.channels.length) {
    const next = await startChannelAt(ctx.app, ctx.candidate, ctx.stage, ctx.config, ctx.call.entry_key, ctx.call.channels, nextIndex, ctx.call.to,
      ctx.call.is_test ? (ctx.call as unknown as { test: TestSnapshot }).test : undefined)
    if (next) return
  }
  await finalize(ctx, { unreachable: reason })
}

async function onNoAnswer(ctx: Ctx, reason: string): Promise<void> {
  const max = Math.max(1, Math.min(5, ctx.config.max_attempts || 2))
  if (ctx.call.attempt < max) {
    const target = new Date(ctx.now.getTime() + ctx.tenant.retry_delay_hours * H)
    const at = nextOutreachTime(target, ctx.call.country, ctx.tenant.quiet_hours) || target
    const expires = ctx.call.permission?.expires_at ? Date.parse(ctx.call.permission.expires_at) : Infinity
    if (ctx.call.channel !== 'whatsapp_call' || at.getTime() < expires) {
      await save(ctx, { attempt: ctx.call.attempt + 1, status: 'queued', next_action: 'retry', next_action_at: at.toISOString() },
        [botLine(`No answer (${reason}). Retrying at ${at.toISOString()}.`, ctx.now.toISOString())])
      return
    }
  }
  return fallback(ctx, `no answer: ${reason}`)
}

async function finishChat(ctx: Ctx): Promise<void> {
  await say(ctx, `Thank you, ${firstName(ctx.candidate.name)}! That's all the questions. The hiring team will review your answers and get back to you.`)
  await finalize(ctx, {})
}

async function record(ctx: Ctx, result: StageResult): Promise<void> {
  try {
    await recordStageResult(ctx.app.id, result, { entryKey: ctx.call.entry_key })
  } catch (e) {
    console.error('[ats/screening] recordStageResult failed', ctx.call.id, e)
    await save(ctx, { error: `Result not recorded: ${(e as Error).message}`.slice(0, 300) })
  }
}

/** Score + record the stage result. Runs once per call (finalized_at claim). */
async function finalize(ctx: Ctx, opts: { unreachable?: string; declined?: boolean; structured?: Record<string, unknown>; voiceSummary?: string | null }): Promise<void> {
  const col = await callsCol()
  const claimed = await col.findOneAndUpdate(
    { id: ctx.call.id, finalized_at: { $exists: false } } as never,
    { $set: { finalized_at: nowIso() } } as never,
    { returnDocument: 'after' },
  )
  if (!claimed) return
  const ref = { kind: 'screening_call' as const, id: ctx.call.id }
  if (opts.unreachable || opts.declined) {
    const summary = opts.declined
      ? 'The candidate declined the automated screening — follow up personally.'
      : `Could not complete the bot screen on ${ctx.call.channels.join(' → ')} (${opts.unreachable}).`
    await save(ctx, {
      summary, outcome: opts.declined ? null : 'fail', step: 'done', next_action: null, next_action_at: null,
      ...(opts.declined ? { status: 'cancelled' as const } : {}),
    })
    if (!ctx.call.is_test && !stale(ctx)) {
      await record(ctx, { stage_id: ctx.stage.id, outcome: opts.declined ? 'pending' : 'fail', score: null, summary, ref, at: nowIso() })
    }
    return
  }
  const result = await scoreScreening({
    questions: ctx.config.questions,
    transcript: ctx.call.transcript || [],
    answers: ctx.call.answers || {},
    structured: opts.structured,
    passScore: ctx.config.pass_score,
    jobTitle: ctx.job.title,
  })
  const summary = [opts.voiceSummary ? opts.voiceSummary.slice(0, 600) : '', result.summary].filter(Boolean).join(' ')
  await save(ctx, {
    status: 'completed', step: 'done', next_action: null, next_action_at: null,
    answers: result.answers, score: result.score, summary, knocked_out: result.knockedOut, outcome: result.outcome,
  })
  if (!ctx.call.is_test && !stale(ctx)) {
    await record(ctx, { stage_id: ctx.stage.id, outcome: result.outcome, score: result.score, summary, ref, at: nowIso() })
  }
}

// ─── Inbound WhatsApp ───────────────────────────────────────────────────────

export interface InboundMessage {
  id: string
  from: string // digits or E.164
  type: string
  text?: string | null
  /** interactive button/list reply id or template quick-reply payload */
  replyId?: string | null
  replyTitle?: string | null
  mediaId?: string | null
  mime?: string | null
  permission?: { response: 'accept' | 'reject'; expiration_timestamp?: number | null } | null
  phoneNumberId?: string | null
  at?: string
}

const STOP = /^\s*(stop|unsubscribe|opt[\s-]?out)\s*$/i
const CONSENT_Q: ScreeningQuestion = { id: '_consent', text: 'consent', type: 'yes_no' }

type CallHit = { call: ScreeningCallDoc; token: string | null } | { ambiguous: ScreeningCallDoc[]; to: string }

/** The WhatsApp number a call talks on (older docs: `from` on WhatsApp channels; unknown for phone calls). */
const waNumberOf = (c: ScreeningCallDoc): string | null => c.wa_from ?? (c.channel === 'phone_call' ? null : c.from ?? null)

/**
 * Active calls a free-text reply could belong to: same phone, and — when Meta
 * says which business number received it — calls on that number only (numbers
 * are per tenant/region, so this keeps replies inside their tenant). One call
 * per application (the most recent).
 */
export function replyCandidates(rows: ScreeningCallDoc[], phoneNumberId: string | null | undefined): ScreeningCallDoc[] {
  const scoped = phoneNumberId ? rows.filter((r) => { const n = waNumberOf(r); return !n || n === phoneNumberId }) : rows
  const seen = new Set<string>()
  return scoped.filter((r) => (seen.has(r.application_id) ? false : (seen.add(r.application_id), true)))
}

async function findCallFor(msg: InboundMessage): Promise<CallHit | null> {
  const to = toE164(msg.from.startsWith('+') ? msg.from : `+${msg.from}`)
  if (!to) return null
  const col = await callsCol()
  const [maybeId, token] = (msg.replyId || '').split('|')
  if (token && maybeId) {
    const c = (await col.findOne({ id: maybeId, to }, { projection: { _id: 0 } })) as ScreeningCallDoc | null
    if (c) return { call: c, token }
  }
  const rows = (await col.find({ to, status: { $in: ACTIVE_STATUSES } } as never, { projection: { _id: 0 } }).sort({ updated_at: -1 }).limit(10).toArray()) as ScreeningCallDoc[]
  const options = replyCandidates(rows, msg.phoneNumberId)
  if (!options.length) return null
  // Never guess between screenings: ask the candidate which one they mean.
  if (options.length > 1) return { ambiguous: options, to }
  return { call: options[0], token: token || null }
}

/** Several screenings are waiting on this number: ask which role the reply is about. */
async function askWhichScreening(options: ScreeningCallDoc[], to: string, phoneNumberId: string | null | undefined): Promise<void> {
  const titles = await Promise.all(options.map(async (c) => {
    if (c.is_test) return 'Test screening'
    const job = (await (await atsJobs()).findOne({ id: c.job_id, tenant_id: c.tenant_id }, { projection: { _id: 0, title: 1 } })) as Pick<AtsJob, 'title'> | null
    return job?.title || 'Your application'
  }))
  const cfg = await getPlatformConfig()
  // Answer on the number the message came in on (fallback: the most recent call's number).
  const numberId = phoneNumberId || waNumberOf(options[0])
  const t = chatTransport({ cfg, numbers: { whatsapp_phone_number_id: numberId } as RoutedNumbers })
  const text = 'You have more than one screening in progress. Which role is your reply about? After you pick, we will repeat the question.'
  const items = options.slice(0, 10).map((c, i) => ({ id: `${c.id}|pick`, title: titles[i].slice(0, 20) || 'Your application' }))
  if (items.length <= 3) await t.sendButtons(to, text, items)
  else await t.sendList(to, text, 'Choose role', items.map((x, i) => ({ ...x, title: titles[i].slice(0, 24) || 'Your application' })))
}

export async function handleInbound(msg: InboundMessage, now = new Date()): Promise<'handled' | 'ignored'> {
  const hit = await findCallFor(msg)
  if (!hit) return 'ignored'
  if ('ambiguous' in hit) {
    await askWhichScreening(hit.ambiguous, hit.to, msg.phoneNumberId)
    return 'handled'
  }
  return withLock(hit.call.id, async () => {
    const call = await fresh(hit.call.id)
    if (!call || !ACTIVE_STATUSES.includes(call.status)) return 'ignored' as const
    const ctx = await loadCtx(call, now)
    if (!ctx) return 'ignored' as const
    if (stale(ctx)) {
      await save(ctx, { status: 'cancelled', step: 'done', next_action: null, next_action_at: null })
      return 'ignored' as const
    }
    await onMessage(ctx, msg, hit.token)
    return 'handled' as const
  })
}

async function setConsent(ctx: Ctx, patch: { whatsapp?: boolean; calls?: boolean }): Promise<void> {
  const consent = { ...(ctx.candidate.consent || {}), ...patch, at: ctx.now.toISOString() }
  ctx.candidate.consent = consent
  if (ctx.call.is_test) return
  await (await atsCandidates()).updateOne({ id: ctx.candidate.id, tenant_id: ctx.call.tenant_id }, { $set: { consent, updated_at: nowIso() } })
}

async function onMessage(ctx: Ctx, msg: InboundMessage, token: string | null): Promise<void> {
  const at = msg.at || ctx.now.toISOString()
  let text = (msg.text || msg.replyTitle || '').trim()

  // Voice notes → Deepgram, or ask for text.
  if (!text && msg.mediaId && /audio|voice/.test(msg.type)) {
    const t = chatTransport(ctx)
    const media = await t.downloadMedia(msg.mediaId)
    const transcript = media.ok ? await transcribeAudio(ctx.cfg.voice.deepgram_api_key, media.data, media.mime, ctx.call.language) : null
    if (!transcript) {
      await save(ctx, { last_inbound_at: at }, [candLine('[voice note]', at)])
      await say(ctx, "Sorry, I couldn't listen to that voice note. Could you type your answer instead?")
      return
    }
    text = transcript
    await save(ctx, { last_inbound_at: at }, [candLine(`[voice note] ${transcript}`, at)])
  } else if (msg.permission) {
    await save(ctx, { last_inbound_at: at }, [candLine(msg.permission.response === 'accept' ? '[allowed calls]' : '[declined calls]', at)])
  } else {
    await save(ctx, { last_inbound_at: at, reminder_sent: false }, [candLine(text || `[${msg.type}]`, at)])
  }

  if (STOP.test(text)) {
    await setConsent(ctx, { whatsapp: false, calls: false })
    await say(ctx, "Understood — we won't message or call you about this again.")
    return finalize(ctx, { declined: true })
  }

  if (msg.permission) return onPermission(ctx, msg.permission)

  // The candidate picked this screening (see askWhichScreening): repeat where we are.
  if (token === 'pick') {
    if (ctx.call.step === 'asking') return askQuestion(ctx)
    if (ctx.call.step === 'awaiting_consent') {
      const prompt = 'Shall we start the short screening now?'
      await chatTransport(ctx).sendButtons(ctx.call.to, prompt, [{ id: `${ctx.call.id}|start`, title: 'Yes, start' }, { id: `${ctx.call.id}|decline`, title: 'Not now' }])
      await save(ctx, { last_outbound_at: ctx.now.toISOString() }, [botLine(`${prompt} [Yes, start] [Not now]`)])
    }
    return
  }

  switch (ctx.call.step) {
    case 'awaiting_consent': {
      const yn = token ? null : extractAnswer(CONSENT_Q, { text })
      const yes = token === 'start' || /^(start|yes, start|yes, call me)$/i.test(text) || (yn?.ok === true && yn.value === true)
      const no = token === 'decline' || /^(not now|later)\b/i.test(text) || (yn?.ok === true && yn.value === false)
      if (yes) {
        await setConsent(ctx, ctx.call.channel === 'whatsapp_chat' ? { whatsapp: true } : { whatsapp: true, calls: true })
        if (ctx.call.channel === 'whatsapp_chat') return askQuestion(ctx)
        if (ctx.call.channel === 'whatsapp_call') return requestCallPermission(ctx)
        await say(ctx, 'Thanks! You will get a call from us shortly.')
        return dial(ctx)
      }
      if (no) {
        await say(ctx, 'No problem — a member of the hiring team will get in touch with you.')
        return finalize(ctx, { declined: true })
      }
      if (ctx.call.reprompts < MAX_REPROMPTS) {
        await save(ctx, { reprompts: ctx.call.reprompts + 1 })
        const t = chatTransport(ctx)
        const prompt = 'Shall we start the short screening now?'
        await t.sendButtons(ctx.call.to, prompt, [{ id: `${ctx.call.id}|start`, title: 'Yes, start' }, { id: `${ctx.call.id}|decline`, title: 'Not now' }])
        await save(ctx, { last_outbound_at: ctx.now.toISOString() }, [botLine(`${prompt} [Yes, start] [Not now]`)])
      }
      return
    }
    case 'asking': {
      const q = ctx.config.questions[ctx.call.question_index]
      if (!q) return finishChat(ctx)
      const ans = extractAnswer(q, { text, buttonId: token })
      if (!ans.ok) {
        if (ctx.call.reprompts < MAX_REPROMPTS) {
          await save(ctx, { reprompts: ctx.call.reprompts + 1 })
          return askQuestion(ctx, ans.reason)
        }
        // give up on this question: keep raw text for the reviewer, move on
        await save(ctx, { answers: { ...ctx.call.answers, [q.id]: null }, question_index: ctx.call.question_index + 1, reprompts: 0 })
      } else {
        await save(ctx, { answers: { ...ctx.call.answers, [q.id]: ans.value }, question_index: ctx.call.question_index + 1, reprompts: 0 })
        if (isKnockedOut(q, ans.value)) {
          await save(ctx, { knocked_out: [...(ctx.call.knocked_out || []), q.id] })
          await say(ctx, `Thank you for your answers, ${firstName(ctx.candidate.name)}. The hiring team will review them and get back to you.`)
          return finalize(ctx, {})
        }
      }
      return ctx.call.question_index < ctx.config.questions.length ? askQuestion(ctx) : finishChat(ctx)
    }
    default:
      return // awaiting_permission / calling: nothing to do with free text
  }
}

async function onPermission(ctx: Ctx, p: NonNullable<InboundMessage['permission']>): Promise<void> {
  if (ctx.call.channel !== 'whatsapp_call') return
  if (p.response !== 'accept') return fallback(ctx, 'call permission declined')
  const at = ctx.now.toISOString()
  const exp = p.expiration_timestamp ? new Date(p.expiration_timestamp * 1000) : new Date(ctx.now.getTime() + DEFAULT_PERMISSION_WINDOW_H * H)
  await save(ctx, { permission: { ...(ctx.call.permission || { requested_at: at }), granted_at: at, expires_at: exp.toISOString() } })
  return dial(ctx)
}

// ─── Call status (Meta calls webhook / carriers) ────────────────────────────

export interface CallStatusEvent {
  ref: string // WhatsApp call id / carrier CallSid / agent id
  event: 'ringing' | 'connected' | 'rejected' | 'terminated' | 'no_answer' | 'failed'
  durationSec?: number | null
  sdpAnswer?: string | null
  eventId: string
}

export async function handleCallStatus(ev: CallStatusEvent, now = new Date()): Promise<'handled' | 'ignored'> {
  const col = await callsCol()
  const hit = (await col.findOne({ $or: [{ provider_ref: ev.ref }, { carrier_ref: ev.ref }] } as never, { projection: { _id: 0 } })) as ScreeningCallDoc | null
  if (!hit) return 'ignored'
  return withLock(hit.id, async () => {
    const call = await fresh(hit.id)
    if (!call || !ACTIVE_STATUSES.includes(call.status)) return 'ignored' as const
    const ctx = await loadCtx(call, now)
    if (!ctx) return 'ignored' as const
    switch (ev.event) {
      case 'ringing': await save(ctx, { status: 'ringing' }); break
      case 'connected': {
        await save(ctx, { status: 'in_progress', ...schedule(ctx, 'timeout', 1) })
        if (ev.sdpAnswer && ctx.call.carrier_ref) await voiceAgentFor(ctx, ctx.call.channel).answer?.(ctx.call.carrier_ref, ev.sdpAnswer)
        break
      }
      case 'terminated': {
        const connected = ctx.call.status === 'in_progress' || (ev.durationSec || 0) > 0
        await save(ctx, { duration_sec: ev.durationSec ?? ctx.call.duration_sec ?? null })
        if (!connected) await onNoAnswer(ctx, 'not answered')
        else await save(ctx, schedule(ctx, 'timeout', 0.5)) // the agent's report should follow; finalize at timeout otherwise
        break
      }
      case 'rejected':
      case 'no_answer': await onNoAnswer(ctx, ev.event === 'rejected' ? 'declined the call' : 'not answered'); break
      case 'failed': await fallback(ctx, 'call failed'); break
    }
    return 'handled' as const
  })
}

// ─── Voice agent report ─────────────────────────────────────────────────────

export async function handleVoiceReport(rep: VoiceReport, now = new Date()): Promise<'handled' | 'ignored'> {
  const col = await callsCol()
  const or: Record<string, unknown>[] = []
  if (rep.ref) or.push({ provider_ref: rep.ref }, { carrier_ref: rep.ref })
  if (rep.screeningCallId) or.push({ id: rep.screeningCallId })
  if (!or.length) return 'ignored'
  const hit = (await col.findOne({ $or: or } as never, { projection: { _id: 0 } })) as ScreeningCallDoc | null
  if (!hit) return 'ignored'
  return withLock(hit.id, async () => {
    const call = await fresh(hit.id)
    if (!call || !ACTIVE_STATUSES.includes(call.status)) return 'ignored' as const
    const ctx = await loadCtx(call, now)
    if (!ctx) return 'ignored' as const
    if (rep.kind === 'status') {
      const patch: Patch = {}
      if (rep.carrierRef && !ctx.call.carrier_ref) patch.carrier_ref = rep.carrierRef
      if (rep.status === 'in-progress') Object.assign(patch, { status: 'in_progress' }, schedule(ctx, 'timeout', 1))
      if (rep.status === 'ringing') patch.status = 'ringing'
      if (Object.keys(patch).length) await save(ctx, patch)
      return 'handled' as const
    }
    if (rep.kind !== 'end') return 'ignored' as const
    await save(ctx, {
      duration_sec: rep.durationSec ?? ctx.call.duration_sec ?? null,
      recording_url: rep.recordingUrl,
      ...(rep.carrierRef && !ctx.call.carrier_ref ? { carrier_ref: rep.carrierRef } : {}),
    }, rep.transcript)
    if (isNoAnswer(rep)) {
      await onNoAnswer(ctx, rep.endedReason || 'not answered')
      return 'handled' as const
    }
    await finalize(ctx, { structured: rep.structured, voiceSummary: rep.summary })
    return 'handled' as const
  })
}

// ─── Scheduler tick ─────────────────────────────────────────────────────────

export async function tickScreening(now = new Date(), limit = 50): Promise<{ processed: number }> {
  const col = await callsCol()
  const due = (await col.find({ status: { $in: ACTIVE_STATUSES }, next_action_at: { $lte: now.toISOString() } } as never, { projection: { _id: 0 } })
    .sort({ next_action_at: 1 }).limit(limit).toArray()) as ScreeningCallDoc[]
  let processed = 0
  for (const d of due) {
    try {
      await withLock(d.id, async () => {
        const call = await fresh(d.id)
        if (!call || !call.next_action_at || call.next_action_at > now.toISOString() || !ACTIVE_STATUSES.includes(call.status)) return
        const ctx = await loadCtx(call, now)
        if (!ctx) return
        if (stale(ctx)) return save(ctx, { status: 'cancelled', step: 'done', next_action: null, next_action_at: null })
        processed++
        await runAction(ctx)
      })
    } catch (e) {
      // busy (a webhook is on it) or one bad call: the next tick picks it up; keep going
      if (!(e instanceof ScreeningLockBusy)) console.error('[ats/screening] tick failed for call', d.id, e)
    }
  }
  return { processed }
}

async function runAction(ctx: Ctx): Promise<void> {
  const action = ctx.call.next_action
  await save(ctx, { next_action: null, next_action_at: null })
  switch (action) {
    case 'start':
      return kickOff(ctx)
    case 'retry':
      if (ctx.call.step === 'calling' || ctx.call.permission?.granted_at || (ctx.call.channel === 'phone_call' && ctx.candidate.consent?.calls)) return dial(ctx)
      return kickOff(ctx)
    case 'remind': {
      // timeout counts from the candidate's last message (or our last prompt), not from the reminder
      const since = Date.parse(ctx.call.last_inbound_at || ctx.call.last_outbound_at || ctx.call.created_at)
      const inWindow = isWithinOutreachWindow(ctx.now, ctx.call.country, ctx.tenant.quiet_hours)
      if (!ctx.call.reminder_sent && inWindow) {
        if (ctx.call.last_inbound_at) {
          await say(ctx, ctx.call.step === 'asking'
            ? `Just a reminder — we're waiting for your answer to question ${ctx.call.question_index + 1}. Reply whenever you're ready.`
            : 'Just a reminder about the short screening for your application — reply "yes" whenever you are ready.')
        } else {
          await sendConsentTemplate(ctx, true) // no reply yet → no open service window → template only
        }
        await save(ctx, { reminder_sent: true })
      }
      const deadline = since + ctx.tenant.reply_timeout_hours * H
      await save(ctx, { next_action: 'timeout', next_action_at: new Date(Math.max(deadline, ctx.now.getTime() + 60_000)).toISOString() })
      return
    }
    case 'timeout':
      if (ctx.call.step === 'awaiting_permission') return fallback(ctx, 'call permission not granted in time')
      if (ctx.call.step === 'calling') {
        // connected but the agent never reported → score what we have; never connected → no answer
        if (ctx.call.status === 'in_progress' || (ctx.call.duration_sec || 0) > 0) return finalize(ctx, {})
        return onNoAnswer(ctx, 'no report from the voice agent')
      }
      if (ctx.call.step === 'asking' && Object.keys(ctx.call.answers || {}).length > 0 && ctx.call.attempt >= (ctx.config.max_attempts || 2)) {
        return finalize(ctx, {}) // partial answers: let the scorer and recruiter judge
      }
      return onNoAnswer(ctx, 'no response')
    default:
      return
  }
}

// ─── Manual restart ─────────────────────────────────────────────────────────

/** Recruiter restart: cancel active calls of this entry and start a fresh run (new entry key suffix). */
export async function restartBotScreen(app: AtsApplication, job: AtsJob, candidate: AtsCandidate): Promise<ScreeningCallDoc | null> {
  const stage = job.pipeline.find((s) => s.id === app.stage_id)
  if (!stage || stage.type !== 'bot_screen') return null
  const col = await callsCol()
  await col.updateMany(
    { tenant_id: app.tenant_id, application_id: app.id, status: { $in: ACTIVE_STATUSES } } as never,
    { $set: { status: 'cancelled', step: 'done', next_action: null, next_action_at: null, updated_at: nowIso() } } as never,
  )
  const base = `${app.id}:${stage.id}:${app.stage_entered_at}`
  // One run = one entry key, whichever channel it started on (the first may have been skipped).
  const prior = (await col.find({ tenant_id: app.tenant_id, application_id: app.id, stage_entered_at: app.stage_entered_at } as never, { projection: { _id: 0, entry_key: 1 } }).limit(500).toArray()) as Pick<ScreeningCallDoc, 'entry_key'>[]
  const keys = new Set(prior.map((c) => c.entry_key).filter((k) => k === base || k.startsWith(`${base}:r`)))
  let n = keys.size
  while (keys.has(`${base}:r${n}`)) n++
  return startBotScreen({ app, job, candidate, stage, idempotencyKey: n ? `${base}:r${n}` : base })
}
