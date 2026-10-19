/** Server wiring for bundles: Mongo store + the real confirm/cancel of each step. */
import 'server-only'
import type { AgentCaller, ProposalBundle, ProposedAction } from '@/lib/agent/contract'
import { cancelAction, confirmAction } from './actions'
import type { BundleStore } from './bundles'
import { getAction, getBundle, transitionBundle } from './store'
import { getTool } from './tools'
import { ledgerEntryForAction } from './tools/ledger'
import { auditAgent } from './http'

const clean = <T extends object>(d: T | null): T | null => {
  if (!d) return null
  const { updated_at: _u, executing_at: _e, finished_at: _f, ...rest } = d as T & { updated_at?: string; executing_at?: string; finished_at?: string }
  void _u; void _e; void _f
  return rest as T
}

export function serverBundleStore(): BundleStore {
  return {
    getBundle: async (caller: AgentCaller, id: string) => clean(await getBundle(caller, id)) as ProposalBundle | null,
    transitionBundle: async (caller, id, from, set) => clean(await transitionBundle(caller, id, from, set)) as ProposalBundle | null,
    confirmStep: (caller, actionId) => confirmAction(caller, actionId, { getTool, audit: auditAgent, ledgerFor: ledgerEntryForAction }, { fromBundle: true }),
    cancelStep: (caller, actionId) => cancelAction(caller, actionId, { audit: auditAgent }),
    getStep: async (caller, actionId) => clean(await getAction(caller, actionId)) as ProposedAction | null,
    audit: auditAgent,
  }
}
