/**
 * Phase 7 stub — GitHub webhook queue worker pending re-implementation
 * against the new MongoDB `github_webhook_scan_queue` collection.
 *
 * The legacy implementation pulled rows from Supabase + Postgres
 * advisory-locked them. A future Phase 7.5 task will rebuild this on
 * MongoDB using `findOneAndUpdate({ status: 'pending' }, { $set: { status: 'running' } })`.
 */

export type QueueProcessResult = {
  processed: boolean
  status?: 'completed' | 'failed' | 'skipped'
  message?: string
  scanId?: string | null
  itemId?: string
}

export async function processGithubScanQueueItem(): Promise<QueueProcessResult> {
  return { processed: false, message: 'Queue worker not yet re-implemented for MongoDB.' }
}

export async function processGithubScanQueueBatch(_max: number): Promise<QueueProcessResult[]> {
  return []
}
