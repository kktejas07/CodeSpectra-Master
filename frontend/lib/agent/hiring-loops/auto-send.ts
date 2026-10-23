/**
 * SEC-036: who may turn auto-send on, and what is recorded (pure, client-safe).
 *
 *  - Only the organisation owner (lib/tenant-owner.ts) or a superadmin may
 *    switch an auto-send step ON. Any organisation admin may switch one OFF.
 *  - Each step that is on remembers who turned it on (`auto_send_by`). A
 *    scheduled run only auto-sends a step while that person is still the owner
 *    or a superadmin; otherwise the item is drafted for confirmation instead.
 *  - Auto-sent items go out in the organisation's name (sender = organisation),
 *    and the action, ledger row and audit log name the enabling admin.
 */

export interface AutoSendGrant { user_id: string; name: string | null; at: string }
export type AutoSendBy = Record<string, AutoSendGrant>

/** Steps the patch switches from off to on. */
export function autoSendTurnedOn(cur: Record<string, boolean> | undefined, patch: Record<string, boolean> | undefined): string[] {
  if (!patch) return []
  return Object.entries(patch).filter(([k, v]) => v === true && cur?.[k] !== true).map(([k]) => k)
}

/** The `auto_send_by` map after a patch: new grants for steps turned on, dropped for steps turned off. */
export function nextAutoSendBy(
  curBy: AutoSendBy | undefined,
  cur: Record<string, boolean> | undefined,
  patch: Record<string, boolean> | undefined,
  actor: { id: string; name?: string | null },
  now: Date,
): AutoSendBy {
  const out: AutoSendBy = { ...(curBy ?? {}) }
  if (!patch) return out
  for (const step of autoSendTurnedOn(cur, patch)) {
    out[step] = { user_id: actor.id, name: String(actor.name || '').slice(0, 120) || null, at: now.toISOString() }
  }
  for (const [step, v] of Object.entries(patch)) if (v === false) delete out[step]
  return out
}

/** May this caller switch auto-send steps on? */
export function mayEnableAutoSend(caller: { userId: string; role: string }, orgOwnerId: string | null): boolean {
  if (caller.role === 'superadmin') return true
  return caller.role === 'tenant_admin' && !!orgOwnerId && orgOwnerId === caller.userId
}

/** The name an auto-sent item goes out under: the organisation, never a person. */
export function orgSenderName(orgName: string | null | undefined): string {
  const n = String(orgName || '').trim().slice(0, 100)
  return n ? `${n} hiring team` : 'Hiring team'
}

/** Audit / ledger note for an auto-sent item. */
export function autoSentNote(grant: AutoSendGrant | null | undefined): string {
  return grant ? `auto-sent by the organisation (enabled by ${grant.user_id}${grant.name ? ` · ${grant.name}` : ''} at ${grant.at})` : 'auto-sent by the organisation'
}
