/**
 * Sealed drafts: some previews need work that must not run twice (AI-generated
 * questions / problems, a computed shortlist). propose() builds the draft,
 * seals it with an HMAC bound to the tool + caller, and attaches it to the
 * action's args as `_draft`. execute() uses it only when the seal verifies —
 * so what the admin confirmed is exactly what gets saved, and the model can
 * never inject a draft of its own (an unsealed or tampered `_draft` is dropped).
 */
import { createHmac, timingSafeEqual } from 'crypto'
import type { AgentCaller } from '@/lib/agent/contract'

export const DRAFT_KEY = '_draft'
const DRAFT_TTL_MS = 25 * 60 * 60 * 1000 // a little longer than the action's 24h expiry

export interface SealedDraft<T = unknown> {
  v: 1
  exp: number
  data: T
  sig: string
}

let cachedKey: Uint8Array | null = null
async function key(): Promise<Uint8Array> {
  if (cachedKey) return cachedKey
  const { deriveServerKey } = await import('@/lib/session')
  cachedKey = await deriveServerKey('agent-tool-draft')
  return cachedKey
}

/** Test hook: use a fixed key instead of the session secret. */
export function __setDraftKeyForTests(k: Uint8Array | null): void {
  cachedKey = k
}

function mac(k: Uint8Array, tool: string, caller: AgentCaller, exp: number, data: unknown): string {
  return createHmac('sha256', Buffer.from(k))
    .update(`${tool}\n${caller.userId}\n${caller.tenantId ?? ''}\n${exp}\n${JSON.stringify(data)}`)
    .digest('base64url')
}

export async function sealDraft<T>(tool: string, caller: AgentCaller, data: T): Promise<SealedDraft<T>> {
  const exp = Date.now() + DRAFT_TTL_MS
  return { v: 1, exp, data, sig: mac(await key(), tool, caller, exp, data) }
}

/** The draft's data when the seal is valid for this tool + caller and not expired; otherwise null. */
export async function openDraft<T>(tool: string, caller: AgentCaller, raw: unknown): Promise<T | null> {
  if (!raw || typeof raw !== 'object') return null
  const d = raw as Partial<SealedDraft<T>>
  if (d.v !== 1 || typeof d.exp !== 'number' || typeof d.sig !== 'string' || !('data' in d)) return null
  if (d.exp < Date.now()) return null
  const want = Buffer.from(mac(await key(), tool, caller, d.exp, d.data))
  const got = Buffer.from(d.sig)
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null
  return d.data as T
}
