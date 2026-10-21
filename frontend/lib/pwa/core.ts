'use client'

/**
 * Typed access to public/pwa-core.js in the browser (the same file the
 * service worker imports). The side-effect import puts it on self.CSPwaCore.
 */
import '@/public/pwa-core.js'

export type QueueState = 'queued' | 'sending' | 'retry' | 'auth' | 'synced' | 'rejected'

export interface QueuedSubmission {
  id: string
  pack_key: string
  endpoint: string
  body: { problem_slug: string; language: string; source_code: string; mode: 'submit' }
  title: string
  csrf?: string | null
  state: QueueState
  attempts?: number
  created_at: number
  next_attempt_at?: number
  sending_at?: number
  synced_at?: number
  last_status?: number
  result?: { status: string; passed?: number; total?: number; score?: number }
  error?: string
}

export interface FlushResult { synced: number; rejected: number; pending: number }

export interface PwaCore {
  SYNC_TAG: string
  OFFLINE_URL: string
  flushQueue(
    adapter: { list(): Promise<QueuedSubmission[]>; put(i: QueuedSubmission): Promise<unknown>; send(i: QueuedSubmission): Promise<{ status: number; body?: unknown }> },
    opts?: { now?: number; interactive?: boolean },
  ): Promise<FlushResult>
  idb: {
    getAll<T = unknown>(store: 'packs' | 'drafts' | 'queue' | 'meta'): Promise<T[]>
    get<T = unknown>(store: 'packs' | 'drafts' | 'queue' | 'meta', key: string): Promise<T | undefined>
    put(store: 'packs' | 'drafts' | 'queue' | 'meta', value: unknown): Promise<unknown>
    del(store: 'packs' | 'drafts' | 'queue' | 'meta', key: string): Promise<unknown>
    clearAll(): Promise<void>
  }
  idbQueueAdapter(send: (i: QueuedSubmission) => Promise<{ status: number; body?: unknown }>): {
    list(): Promise<QueuedSubmission[]>; put(i: QueuedSubmission): Promise<unknown>; send(i: QueuedSubmission): Promise<{ status: number; body?: unknown }>
  }
}

export function pwaCore(): PwaCore | null {
  if (typeof self === 'undefined') return null
  return ((self as unknown as { CSPwaCore?: PwaCore }).CSPwaCore) ?? null
}
