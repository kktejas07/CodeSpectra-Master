/**
 * Pure helpers for queued offline answers (tests/pwa-offline.test.ts).
 * The sync loop itself is flushQueue() in public/pwa-core.js (shared with the
 * service worker's Background Sync handler).
 */
import type { OfflinePack } from './offline-payload'
import type { QueuedSubmission } from './core'

export const MAX_SOURCE_CHARS = 50_000 // same cap as /api/submissions
export const MAX_QUEUE_ITEMS = 50

export type BuildResult = { ok: true; item: QueuedSubmission } | { ok: false; error: string }

export function buildQueuedSubmission(
  pack: Pick<OfflinePack, 'key' | 'problem'>,
  language: string,
  source: string,
  opts: { id: string; now: number; csrf?: string | null; queueLength?: number },
): BuildResult {
  const lang = String(language || '').trim().toLowerCase()
  if (!lang || !/^[a-z0-9+#._-]{1,20}$/.test(lang)) return { ok: false, error: 'Pick a language' }
  if (!source || !source.trim()) return { ok: false, error: 'Write some code before submitting' }
  if (source.length > MAX_SOURCE_CHARS) return { ok: false, error: 'Your code is over 50,000 characters' }
  if ((opts.queueLength ?? 0) >= MAX_QUEUE_ITEMS) return { ok: false, error: 'Too many answers waiting to sync. Go online to send them first.' }
  return {
    ok: true,
    item: {
      id: opts.id,
      pack_key: pack.key,
      endpoint: '/api/submissions',
      body: { problem_slug: pack.problem.slug, language: lang, source_code: source, mode: 'submit' },
      title: pack.problem.title,
      csrf: opts.csrf ?? null,
      state: 'queued',
      attempts: 0,
      created_at: opts.now,
    },
  }
}

/** Packs past their expiry are dropped from the device. */
export function isPackExpired(pack: Pick<OfflinePack, 'expires_at'>, now: number): boolean {
  const t = Date.parse(pack.expires_at)
  return !Number.isFinite(t) || t <= now
}

/** Plain-language status line for a queued answer. */
export function queueStatusLabel(i: Pick<QueuedSubmission, 'state' | 'result' | 'error'>): string {
  switch (i.state) {
    case 'queued': return 'Waiting for a connection'
    case 'sending': return 'Sending…'
    case 'retry': return 'Will retry when the connection is back'
    case 'auth': return 'Sign in to send this answer'
    case 'rejected': return i.error || 'Not accepted'
    case 'synced': {
      const r = i.result
      if (!r) return 'Submitted'
      const tests = typeof r.passed === 'number' && typeof r.total === 'number' ? ` · ${r.passed}/${r.total} tests` : ''
      return `${r.status === 'accepted' ? 'Accepted' : r.status.replace(/_/g, ' ')}${tests}`
    }
  }
}
