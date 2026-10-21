'use client'

/**
 * Device-side offline practice store (IndexedDB "codespectra-offline", via
 * public/pwa-core.js). Holds downloaded question packs (no answers), the
 * learner's drafts and queued submissions. Owned by one user: cleared on
 * sign-out and when a different account signs in on the device.
 */
import { csrfFetch } from '@/lib/csrf-fetch'
import { OFFLINE_SYNC_TAG } from './config'
import { pwaCore, type FlushResult, type QueuedSubmission } from './core'
import type { OfflinePack } from './offline-payload'
import { buildQueuedSubmission, isPackExpired, type BuildResult } from './offline-queue'

export const OFFLINE_EVENT = 'codespectra:offline-queue'

function core() {
  const c = pwaCore()
  if (!c) throw new Error('Offline storage is not available in this browser')
  return c
}

export function offlineSupported(): boolean {
  return typeof window !== 'undefined' && 'indexedDB' in window && !!pwaCore()
}

function notify() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(OFFLINE_EVENT))
}

function readCookie(name: string): string | null {
  for (const part of document.cookie.split(';')) {
    const [k, ...rest] = part.split('=')
    if (k?.trim() === name) return decodeURIComponent(rest.join('=').trim())
  }
  return null
}

/** Wipe the store if it belongs to another account, then claim it. */
export async function ensureOwner(userId: string): Promise<void> {
  if (!offlineSupported() || !userId) return
  const meta = await core().idb.get<{ key: string; value: string }>('meta', 'owner')
  if (meta && meta.value !== userId) await core().idb.clearAll()
  if (!meta || meta.value !== userId) await core().idb.put('meta', { key: 'owner', value: userId })
}

/** Download today's pack. The store owner is claimed by DashboardPwa (ensureOwner) on every dashboard load. */
export async function downloadDailyChallenge(): Promise<OfflinePack> {
  const res = await fetch('/api/offline/daily-challenge', { credentials: 'include', cache: 'no-store' })
  const json = (await res.json().catch(() => ({}))) as OfflinePack & { error?: string }
  if (!res.ok) throw new Error(json.error || 'Could not download the challenge')
  await core().idb.put('packs', json)
  // Make sure the offline page + its scripts are on the device too.
  navigator.serviceWorker?.controller?.postMessage({ type: 'REFRESH_SHELL' })
  notify()
  return json
}

export async function listPacks(): Promise<OfflinePack[]> {
  if (!offlineSupported()) return []
  const now = Date.now()
  const all = await core().idb.getAll<OfflinePack>('packs')
  const live: OfflinePack[] = []
  for (const p of all) {
    if (isPackExpired(p, now)) await core().idb.del('packs', p.key)
    else live.push(p)
  }
  return live.sort((a, b) => b.day.localeCompare(a.day))
}

export async function getDraft(packKey: string): Promise<{ language: string; code: string } | null> {
  if (!offlineSupported()) return null
  const d = await core().idb.get<{ key: string; language: string; code: string }>('drafts', packKey)
  return d ? { language: d.language, code: d.code } : null
}

export async function saveDraft(packKey: string, language: string, code: string): Promise<void> {
  if (!offlineSupported()) return
  await core().idb.put('drafts', { key: packKey, language, code: code.slice(0, 50_000), saved_at: Date.now() })
}

export async function listQueue(): Promise<QueuedSubmission[]> {
  if (!offlineSupported()) return []
  const items = await core().idb.getAll<QueuedSubmission>('queue')
  return items.sort((a, b) => b.created_at - a.created_at)
}

export async function removeQueued(id: string): Promise<void> {
  await core().idb.del('queue', id)
  notify()
}

export async function enqueueSubmission(pack: OfflinePack, language: string, code: string): Promise<BuildResult> {
  const queue = await listQueue()
  const pending = queue.filter((q) => q.state !== 'synced' && q.state !== 'rejected').length
  const built = buildQueuedSubmission(pack, language, code, {
    id: crypto.randomUUID(),
    now: Date.now(),
    csrf: readCookie('csrf_token'),
    queueLength: pending,
  })
  if (!built.ok) return built
  await core().idb.put('queue', built.item)
  notify()
  void requestSync()
  return built
}

/** Ask the service worker to sync (Background Sync), else flush from this tab. */
export async function requestSync(): Promise<void> {
  try {
    const reg = navigator.serviceWorker ? await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((r) => setTimeout(() => r(null), 1500)),
    ]) : null
    const sync = (reg as (ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } }) | null)?.sync
    if (sync) {
      await sync.register(OFFLINE_SYNC_TAG)
      return
    }
  } catch { /* fall through */ }
  if (navigator.onLine) await flushOfflineQueue()
}

/** Flush from this (signed-in) tab. Serialised with the worker via the Web Locks API. */
export async function flushOfflineQueue(): Promise<FlushResult | null> {
  if (!offlineSupported()) return null
  const run = async () => {
    const c = core()
    const result = await c.flushQueue(
      c.idbQueueAdapter(async (item) => {
        const res = await csrfFetch(item.endpoint || '/api/submissions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': item.id },
          body: JSON.stringify(item.body),
        })
        return { status: res.status, body: await res.json().catch(() => null) }
      }),
      { interactive: true },
    )
    notify()
    return result
  }
  const locks = (navigator as Navigator & { locks?: { request<T>(name: string, cb: () => Promise<T>): Promise<T> } }).locks
  return locks ? locks.request('cs-offline-flush', run) : run()
}

/** Sign-out: forget everything this device stored for the account. */
export async function clearOfflineData(): Promise<void> {
  try {
    if (offlineSupported()) await core().idb.clearAll()
  } catch { /* nothing stored */ }
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_PAGES' })
  } catch { /* no worker */ }
  notify()
}
