/**
 * Proposal bundles: linked drafts the admin confirms together ("set up a
 * campus drive"). Confirming runs the steps IN ORDER through the normal
 * confirmAction path (re-auth, role re-check, re-validation, idempotency
 * ledger, audit). The first failure stops the bundle: later steps are
 * cancelled and never run, and the steps that already ran are reported —
 * nothing is half-applied inside a step, and no step runs after a failure.
 *
 * Deps are injected so the ordering / stop-on-failure logic is unit-tested
 * without a database.
 */
import type { AgentCaller, ProposalBundle, ProposedAction } from '@/lib/agent/contract'
import type { ActionOutcome } from './actions'

export interface BundleStore {
  getBundle(caller: AgentCaller, id: string): Promise<ProposalBundle | null>
  transitionBundle(caller: AgentCaller, id: string, from: ProposalBundle['status'] | ProposalBundle['status'][], set: Partial<ProposalBundle>): Promise<ProposalBundle | null>
  confirmStep(caller: AgentCaller, actionId: string): Promise<ActionOutcome>
  cancelStep(caller: AgentCaller, actionId: string): Promise<ActionOutcome>
  getStep(caller: AgentCaller, actionId: string): Promise<ProposedAction | null>
  audit?: (actor: { id: string }, action: string, resource: string, detail: string, severity: 'info' | 'warning' | 'critical') => Promise<void>
  now?: () => Date
}

export type BundleOutcome =
  | { ok: true; status: 200; bundle: ProposalBundle; actions: ProposedAction[]; replayed?: boolean }
  | { ok: false; status: 404 | 409 | 410; error: string; bundle?: ProposalBundle; actions?: ProposedAction[] }

const DONE_STATES: ProposalBundle['status'][] = ['done', 'failed', 'partial', 'cancelled', 'expired']

async function stepsOf(caller: AgentCaller, b: ProposalBundle, store: BundleStore): Promise<ProposedAction[]> {
  const out: ProposedAction[] = []
  for (const id of b.action_ids) {
    const a = await store.getStep(caller, id)
    if (a) out.push(a)
  }
  return out
}

export async function confirmBundle(caller: AgentCaller, id: string, store: BundleStore): Promise<BundleOutcome> {
  const now = store.now?.() ?? new Date()
  const current = await store.getBundle(caller, id)
  if (!current) return { ok: false, status: 404, error: 'This bundle was not found.' }
  if (DONE_STATES.includes(current.status)) {
    return { ok: true, status: 200, bundle: current, actions: await stepsOf(caller, current, store), replayed: true }
  }
  if (current.status === 'pending' && Date.parse(current.expires_at) <= now.getTime()) {
    const exp = (await store.transitionBundle(caller, id, 'pending', { status: 'expired' })) ?? { ...current, status: 'expired' as const }
    return { ok: false, status: 410, error: 'This bundle expired. Ask the copilot to draft it again.', bundle: exp }
  }
  // Atomic claim: a double click runs the bundle once.
  const claimed = await store.transitionBundle(caller, id, 'pending', { status: 'executing' })
  if (!claimed) {
    const cur = await store.getBundle(caller, id)
    return { ok: false, status: 409, error: 'This bundle is already running.', ...(cur ? { bundle: cur } : {}) }
  }

  const results: NonNullable<ProposalBundle['results']> = []
  let stoppedAt: number | null = null
  for (let i = 0; i < claimed.action_ids.length; i++) {
    const actionId = claimed.action_ids[i]
    const step = await store.getStep(caller, actionId)
    // A step the admin cancelled on its own is skipped (not a failure).
    if (step?.status === 'cancelled') {
      results.push({ action_id: actionId, ok: true, message: 'Skipped (cancelled)', status: 'cancelled' })
      continue
    }
    const out = await store.confirmStep(caller, actionId)
    const action = out.ok ? out.action : out.action
    const ok = out.ok && action?.status === 'done'
    results.push({
      action_id: actionId,
      ok,
      message: out.ok ? (action?.result?.message ?? 'Done') : out.error,
      status: action?.status ?? 'failed',
    })
    if (!ok) {
      stoppedAt = i
      break
    }
  }

  // Stop on failure: every later step is cancelled so it can never run out of order.
  if (stoppedAt !== null) {
    for (const laterId of claimed.action_ids.slice(stoppedAt + 1)) {
      const r = await store.cancelStep(caller, laterId)
      results.push({ action_id: laterId, ok: false, message: 'Not run: an earlier step failed', status: r.ok ? 'cancelled' : (r.action?.status ?? 'cancelled') })
    }
  }
  const ranOk = results.filter((r) => r.ok && r.status === 'done').length
  const status: ProposalBundle['status'] = stoppedAt === null ? 'done' : ranOk > 0 ? 'partial' : 'failed'
  const finished = (await store.transitionBundle(caller, id, 'executing', { status, results, stopped_at: stoppedAt }))
    ?? { ...claimed, status, results, stopped_at: stoppedAt }
  await store.audit?.({ id: caller.userId }, `agent.bundle.${status}`, id, `${claimed.title} — ${ranOk}/${claimed.action_ids.length} steps done${stoppedAt !== null ? `, stopped at step ${stoppedAt + 1}` : ''}`, status === 'done' ? 'info' : 'warning').catch(() => undefined)
  return { ok: true, status: 200, bundle: finished, actions: await stepsOf(caller, finished, store) }
}

export async function cancelBundle(caller: AgentCaller, id: string, store: BundleStore): Promise<BundleOutcome> {
  const current = await store.getBundle(caller, id)
  if (!current) return { ok: false, status: 404, error: 'This bundle was not found.' }
  if (current.status === 'cancelled') return { ok: true, status: 200, bundle: current, actions: await stepsOf(caller, current, store), replayed: true }
  const done = await store.transitionBundle(caller, id, 'pending', { status: 'cancelled' })
  if (!done) return { ok: false, status: 409, error: 'This bundle is already being handled.', bundle: current }
  for (const a of done.action_ids) await store.cancelStep(caller, a)
  await store.audit?.({ id: caller.userId }, 'agent.bundle.cancelled', id, done.title, 'info').catch(() => undefined)
  return { ok: true, status: 200, bundle: done, actions: await stepsOf(caller, done, store) }
}
