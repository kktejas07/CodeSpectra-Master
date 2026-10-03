/**
 * Cron heartbeats.
 *
 * The admin Cron jobs page previously equated "CRON_SECRET is set" with
 * "this job is running" — which proves nothing. An external scheduler can be
 * unconfigured, mis-pointed, or silently failing, and every endpoint still
 * showed "Ready". Every cron route now records when it last ran (success or
 * failure) into the `cron_runs` collection, and the page shows real last-run
 * evidence plus a stale/never state.
 *
 * Writes are best-effort: a heartbeat failure must never fail the job itself.
 */
import { getMongoDb } from '@/lib/mongodb'

export interface CronRunRow {
  id: string
  last_run_at: string
  last_status: 'ok' | 'error'
  last_duration_ms: number
  last_error?: string | null
  runs: number
  failures: number
}

/** Record one execution of a cron job. Never throws. */
export async function recordCronRun(
  id: string,
  ok: boolean,
  durationMs: number,
  error?: string,
): Promise<void> {
  try {
    const db = await getMongoDb()
    await db.collection('cron_runs').updateOne(
      { id },
      {
        $set: {
          id,
          last_run_at: new Date().toISOString(),
          last_status: ok ? 'ok' : 'error',
          last_duration_ms: Math.max(0, Math.round(durationMs)),
          last_error: error ? error.slice(0, 300) : null,
        },
        $inc: { runs: 1, failures: ok ? 0 : 1 },
      },
      { upsert: true },
    )
  } catch {
    /* heartbeat is observability only — never fail the job */
  }
}

/**
 * Wrap a cron route handler so every run is recorded. HTTP <400 counts as ok;
 * a 401 from a bad secret still records (it proves the endpoint was called).
 */
export function withCronHeartbeat<TReq extends Request>(
  id: string,
  handler: (req: TReq) => Promise<Response>,
): (req: TReq) => Promise<Response> {
  return async (req: TReq): Promise<Response> => {
    const started = Date.now()
    try {
      const res = await handler(req)
      await recordCronRun(id, res.status < 400, Date.now() - started, res.status >= 400 ? `HTTP ${res.status}` : undefined)
      return res
    } catch (e) {
      await recordCronRun(id, false, Date.now() - started, e instanceof Error ? e.message : String(e))
      throw e
    }
  }
}

/** Fetch the latest run row per job id. Never throws (empty map on error). */
export async function getCronRuns(ids: string[]): Promise<Record<string, CronRunRow>> {
  try {
    const db = await getMongoDb()
    const rows = await db.collection('cron_runs').find({ id: { $in: ids } }).toArray()
    const map: Record<string, CronRunRow> = {}
    for (const r of rows as unknown as CronRunRow[]) {
      if (r?.id) map[r.id] = r
    }
    return map
  } catch {
    return {}
  }
}
