/**
 * Shared runner for the hiring agent loops (server only).
 *
 *   1. settings: a scheduled run needs the loop switched on
 *   2. owner: proposals belong to the admin who switched the loop on; before
 *      every scheduled run that admin is re-authorised (active account, still
 *      superadmin / admin of this organisation) — otherwise the loop is
 *      switched off and the run logged as blocked
 *   3. budget: daily item cap stops the run; the monthly AI cap and the
 *      platform budget hard stop switch AI off (deterministic fallback)
 *   4. claim: one scheduled run per organisation + loop + window (unique
 *      run_key); one manual run at a time
 *   5. work: the loop drafts ProposedActions through the copilot's own write
 *      tools (parse → propose → saveAction), in a conversation the owner sees
 *      in the AI copilot; a step with auto-send on is confirmed at once
 *      through confirmAction (same ledger, audit and re-checks as a click)
 *   6. log: items, counts and metered AI cost on the run row; in-app note to
 *      the owner and an automation event when something was drafted
 */
import 'server-only'
import type { AgentCaller, ProposedAction, ToolContext } from '@/lib/agent/contract'
import { ToolInputError, ToolPermissionError } from '@/lib/agent/contract'
import { logger } from '@/lib/logger'
import { newId } from '@/lib/db/ids'
import { withUsageMeter } from '@/lib/ai/usage-meter'
import { loopBudget, LOOP_FEATURE, loopWindow, STEP_TOOL, type LoopBudget, type LoopId, type LoopSettings, type RunItem, type RunStatus } from './types'
import { getLoopSettings, disableLoop, startRun, saveRun, usageSoFar, claimManual, releaseManual, type RunDoc } from './store'
import { hlLocale, hlt, type HlLocale } from './i18n'
import { autoSentNote, orgSenderName, type AutoSendGrant } from './auto-send'

export interface LoopRunContext<L extends LoopId = LoopId> {
  loop: L
  tenantId: string
  now: Date
  trigger: 'cron' | 'manual'
  settings: LoopSettings<L>
  budget: LoopBudget
  /** Null = no owner yet (default-on integrity queue): read-only, no proposals. */
  caller: AgentCaller | null
  locale: HlLocale
  run: RunDoc
  /** AI allowed right now (budget + this run's spend so far). */
  aiAllowed(): boolean
  /** Items left in today's cap. */
  itemsLeft(): number
  /** Draft one proposal for `step` (auto-sent when the org enabled it). */
  propose(step: string, rawArgs: Record<string, unknown>, item: { kind: string; ref: string }, opts?: { priorArgs?: Record<string, unknown> }): Promise<{ ok: boolean; action?: ProposedAction; auto_sent?: boolean; result?: string; error?: string }>
  /** Log a non-proposal item (skipped, nothing to do, queue entry). */
  note(item: RunItem): void
}

export interface LoopRunSummary { ok: boolean; status: RunStatus; runId?: string; message: string; items: number }

/** The owner as an agent caller, re-authorised from the account (never from stored settings alone). */
async function ownerCaller(ownerId: string | null, tenantId: string): Promise<AgentCaller | null> {
  if (!ownerId) return null
  try {
    const { loadAuthProfile, isTenantActive } = await import('@/lib/session')
    const { resolveAccount, profileTenantId } = await import('@/lib/auth-account')
    const { creatorStillAuthorised } = await import('@/lib/agent/schedule')
    const profile = await loadAuthProfile(ownerId)
    const tenantActive = profile ? await isTenantActive(profileTenantId(profile)).catch(() => false) : null
    const resolved = resolveAccount(profile, { tenantActive })
    const check = creatorStillAuthorised(resolved, tenantId, profile?.email)
    if (!check.ok || !resolved.ok) return null
    const p = profile as { id?: string; name?: string; fullName?: string; email?: string }
    return { userId: String(p.id || ownerId), role: resolved.role === 'superadmin' ? 'superadmin' : 'tenant_admin', tenantId, name: p.fullName || p.name, email: check.email }
  } catch (e) {
    logger.warn(`[hiring-agents] owner check failed: ${(e as Error)?.message}`)
    return null
  }
}

/**
 * SEC-036: the admin who turned an auto-send step on may still do so — an
 * active superadmin, or still the owner (and an admin) of this organisation.
 */
async function autoSendEnablerValid(userId: string, tenantId: string): Promise<boolean> {
  try {
    const { loadAuthProfile, isTenantActive } = await import('@/lib/session')
    const { resolveAccount, profileTenantId } = await import('@/lib/auth-account')
    const profile = await loadAuthProfile(userId)
    if (!profile) return false
    const tenantActive = await isTenantActive(profileTenantId(profile)).catch(() => false)
    const acc = resolveAccount(profile, { tenantActive })
    if (!acc.ok) return false
    if (acc.role === 'superadmin') return true
    if (acc.role !== 'tenant_admin' || acc.tenantId !== tenantId) return false
    const { orgOwnerId } = await import('@/lib/tenant-owner')
    return (await orgOwnerId(tenantId)) === userId
  } catch (e) {
    logger.warn(`[hiring-agents] auto-send enabler check failed: ${(e as Error)?.message}`)
    return false
  }
}

/** True when the platform AI budget is used up with the hard stop on (applies to every hiring agent). */
async function platformBudgetStopped(): Promise<boolean> {
  try {
    const { getAiCostSettings, monthSpendMicros } = await import('@/lib/ai/usage-record')
    const s = await getAiCostSettings()
    if (!s.hard_stop || !(s.monthly_budget_usd > 0)) return false
    return (await monthSpendMicros()) >= Math.round(s.monthly_budget_usd * 1_000_000)
  } catch {
    return false
  }
}

async function auditAgentAction(actor: { id: string }, action: string, resource: string, detail: string, severity: 'info' | 'warning' | 'critical') {
  const { auditAgent } = await import('@/lib/agent/http')
  await auditAgent(actor, action, resource, detail, severity)
}

/**
 * Run one loop for one organisation. `by` is the session caller for a manual
 * run (already authorised by the route); scheduled runs use the owner.
 */
export async function runLoop<L extends LoopId>(
  loop: L,
  tenantId: string,
  opts: { trigger: 'cron' | 'manual'; by?: AgentCaller | null; now?: Date; allowNoOwner?: boolean },
  body: (ctx: LoopRunContext<L>) => Promise<{ message: string; partial?: boolean }>,
): Promise<LoopRunSummary> {
  const now = opts.now ?? new Date()
  const loaded = await getLoopSettings(tenantId, loop)
  const settings = loaded.settings
  if (opts.trigger === 'cron' && !settings.enabled) return { ok: true, status: 'skipped', message: 'switched off', items: 0 }

  const caller: AgentCaller | null = opts.trigger === 'manual' ? (opts.by ? { ...opts.by, tenantId } : null) : await ownerCaller(loaded.owner_id, tenantId)
  const runKey = opts.trigger === 'cron' ? `${tenantId}:${loop}:${loopWindow(loop, now)}` : null

  if (!caller && !(opts.allowNoOwner && !loaded.owner_id)) {
    // Owner lost access (or never existed for a loop that needs one): stop it, log once per window.
    const run = await startRun({ run_key: runKey, tenant_id: tenantId, loop, trigger: opts.trigger, by: null, now })
    if (run) await saveRun(run.id, { status: 'blocked', finished_at: new Date().toISOString(), message: 'owner' })
    if (loaded.owner_id) await disableLoop(tenantId, loop)
    return { ok: false, status: 'blocked', runId: run?.id, message: 'The admin who switched this agent on no longer has access.', items: 0 }
  }

  const usage = await usageSoFar(tenantId, loop, now)
  const budget = loopBudget(settings, usage.itemsToday, usage.spentMonth, await platformBudgetStopped())
  if (opts.trigger === 'manual' && !(await claimManual(tenantId, loop, now))) {
    return { ok: false, status: 'blocked', message: 'A run of this agent is already in progress.', items: 0 }
  }
  try {
    const run = await startRun({ run_key: runKey, tenant_id: tenantId, loop, trigger: opts.trigger, by: opts.by?.userId ?? null, now, ai_off: budget.ai_off ?? null })
    if (!run) return { ok: true, status: 'skipped', message: 'already ran in this window', items: 0 }
    if (budget.items <= 0) {
      await saveRun(run.id, { status: 'blocked', finished_at: new Date().toISOString(), message: budget.blocked || 'daily_cap' })
      return { ok: false, status: 'blocked', runId: run.id, message: 'Daily item cap reached.', items: 0 }
    }

    const { localeForUser } = await import('@/lib/i18n/recipient')
    const locale = hlLocale(caller ? await localeForUser(caller.userId).catch(() => 'en') : 'en')
    let costMicros = 0
    let used = 0
    let conversationId: string | null = null
    const proposals: ProposedAction[] = []

    const ensureConversation = async (): Promise<string> => {
      if (conversationId) return conversationId
      const { createConversation } = await import('@/lib/agent/store')
      const conv = await createConversation(caller!, `${hlt(locale, `loop.${loop}.name`)} · ${now.toISOString().slice(0, 10)}`, tenantId)
      conversationId = conv.id
      run.conversation_id = conv.id
      return conv.id
    }

    // SEC-036 helpers: the enabling admin per step (re-checked once per run) and the org's name.
    const grantCache = new Map<string, AutoSendGrant | null>()
    const autoSendGrant = async (step: string): Promise<AutoSendGrant | null> => {
      if (!grantCache.has(step)) {
        const g = loaded.auto_send_by[step]
        grantCache.set(step, g && (await autoSendEnablerValid(g.user_id, tenantId)) ? g : null)
      }
      return grantCache.get(step) ?? null
    }
    let orgNameCache: string | null | undefined
    const orgDisplayName = async (): Promise<string | null> => {
      if (orgNameCache === undefined) {
        const { orgName } = await import('@/lib/tenant-owner')
        orgNameCache = await orgName(tenantId).catch(() => null)
      }
      return orgNameCache
    }

    const ctx: LoopRunContext<L> = {
      loop, tenantId, now, trigger: opts.trigger, settings, budget, caller, locale, run,
      aiAllowed: () => budget.ai && usage.spentMonth + costMicros / 1e6 < settings.monthly_cost_cap_usd,
      itemsLeft: () => Math.max(0, budget.items - used),
      note: (item) => { run.items.push(item) },
      async propose(step, rawArgs, item, popts = {}) {
        if (!caller) return { ok: false, error: 'no_owner' }
        if (used >= budget.items) return { ok: false, error: 'daily_cap' }
        const toolName = STEP_TOOL[step]
        const { getTool } = await import('@/lib/agent/tools')
        const tool = getTool(toolName)
        if (!tool || tool.kind !== 'write' || !tool.propose) return { ok: false, error: 'tool_missing' }
        const conv = await ensureConversation()
        const tctx: ToolContext = { caller, conversationId: conv, ...(popts.priorArgs ? { priorArgs: popts.priorArgs } : {}) }
        let title: string
        let preview: Record<string, unknown>
        let args: Record<string, unknown>
        try {
          args = (await tool.parse(rawArgs, tctx)) as Record<string, unknown>
          const p = await tool.propose(args, tctx)
          title = p.title
          preview = p.preview ?? {}
        } catch (e) {
          const msg = e instanceof ToolInputError || e instanceof ToolPermissionError ? e.message : 'could not draft'
          if (!(e instanceof ToolInputError || e instanceof ToolPermissionError)) logger.warn(`[hiring-agents] ${loop}/${step} propose failed: ${(e as Error)?.message?.slice(0, 200)}`)
          run.items.push({ kind: item.kind, ref: item.ref, title: toolName, note: msg.slice(0, 300) })
          return { ok: false, error: msg }
        }
        const created = Date.now()
        const { PROPOSAL_TTL_MS } = await import('@/lib/agent/run')
        const action: ProposedAction = {
          id: newId(), conversationId: conv, tool: tool.name, risk: tool.risk === 'none' ? 'update' : tool.risk,
          title: String(title || tool.name).slice(0, 300), preview: { ...preview, drafted_by: LOOP_FEATURE[loop] }, args,
          status: 'pending', created_by: caller.userId, tenant_id: tenantId,
          created_at: new Date(created).toISOString(), expires_at: new Date(created + PROPOSAL_TTL_MS).toISOString(),
        }
        const { saveAction } = await import('@/lib/agent/store')
        await saveAction(action)
        used++
        let auto_sent = false
        let result: string | undefined
        // SEC-036: auto-send only while the admin who turned this step on is still
        // the organisation owner or a superadmin; the item then goes out in the
        // organisation's name and the action, ledger and audit name that admin.
        const grant = settings.auto_send[step] === true ? await autoSendGrant(step) : null
        if (grant) {
          const [{ confirmAction }, { ledgerEntryForAction, LEDGER_COLLECTION }] = await Promise.all([import('@/lib/agent/actions'), import('@/lib/agent/tools/ledger')])
          const sender: AgentCaller = { ...caller, name: orgSenderName(await orgDisplayName()) }
          const note = autoSentNote(grant)
          const audit = (actor: { id: string }, act: string, res: string, detail: string, sev: 'info' | 'warning' | 'critical') => auditAgentAction(actor, act, res, `${detail} — ${note}`.slice(0, 1000), sev)
          const r = await confirmAction(sender, action.id, { getTool, audit, ledgerFor: ledgerEntryForAction })
          auto_sent = r.ok
          result = r.ok ? r.action.result?.message : r.error
          const stamp = { sent_as: 'organisation', auto_sent: true, auto_send_enabled_by: grant }
          const { getMongoDb } = await import('@/lib/mongodb')
          const mdb = await getMongoDb()
          await Promise.all([
            mdb.collection('agent_actions').updateOne({ id: action.id, tenant_id: tenantId }, { $set: stamp }),
            mdb.collection(LEDGER_COLLECTION).updateOne({ key: `action:${action.id}` }, { $set: stamp }),
          ]).catch((e) => logger.warn(`[hiring-agents] auto-send stamp failed: ${(e as Error)?.message?.slice(0, 200)}`))
        } else {
          if (settings.auto_send[step] === true) run.items.push({ kind: item.kind, ref: item.ref, title: toolName, note: 'auto_send_not_authorised' })
          proposals.push(action)
        }
        run.items.push({ kind: item.kind, ref: item.ref, title: action.title, action_id: action.id, auto_sent, result: result?.slice(0, 300) ?? null })
        return { ok: true, action, auto_sent, result }
      },
    }

    let status: RunStatus = 'ok'
    let message = ''
    try {
      const out = await withUsageMeter((u) => { costMicros += typeof u.costMicros === 'number' ? u.costMicros : 0 }, () => body(ctx))
      message = out.message
      status = out.partial ? 'partial' : run.items.length === 0 ? 'skipped' : 'ok'
    } catch (e) {
      status = 'failed'
      message = 'The run stopped with an error.'
      logger.warn(`[hiring-agents] ${loop} run failed for ${tenantId}: ${(e as Error)?.message?.slice(0, 300)}`)
    }
    await saveRun(run.id, {
      status, message: message.slice(0, 500), finished_at: new Date().toISOString(), items: run.items.slice(0, 300), item_count: used,
      cost_usd: Math.round(costMicros) / 1e6, conversation_id: run.conversation_id ?? null,
    })

    if (caller && conversationId && (proposals.length || used)) {
      const summary = hlt(locale, 'notify.message', { agent: hlt(locale, `loop.${loop}.name`), count: proposals.length || used })
      const { appendTurnMessage, touchConversation } = await import('@/lib/agent/store')
      await appendTurnMessage(caller, conversationId, { message: { role: 'assistant', content: summary } }).catch(() => undefined)
      await touchConversation(caller, conversationId).catch(() => undefined)
      if (proposals.length) {
        void import('@/lib/notifications').then(({ notify }) => notify({
          user_id: caller!.userId,
          type: 'system.alert',
          title: hlt(locale, 'notify.title', { count: proposals.length }),
          message: summary,
          link: '/dashboard/admin/hiring-agents',
          icon: 'briefcase',
        } as never)).catch(() => {})
      }
      void import('@/lib/automation/events').then(({ emit }) => emit('hiring_agent.proposals', {
        agent: loop, run_id: run.id, proposals: proposals.length, auto_sent: used - proposals.length, conversation_id: conversationId,
      }, { tenantId, idempotencyKey: `hiring_agent.proposals:${run.id}` })).catch(() => {})
    }
    return { ok: status !== 'failed', status, runId: run.id, message, items: used }
  } finally {
    if (opts.trigger === 'manual') await releaseManual(tenantId, loop)
  }
}
