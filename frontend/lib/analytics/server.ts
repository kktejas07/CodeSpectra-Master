/**
 * Server-side business event tracking.
 *
 *   import { trackServer } from '@/lib/analytics/server'
 *   trackServer('test_started', { userId, tenantId, props: { exam_id }, key: `test_started:${examId}:${userId}:${attempt}` })
 *
 * Fire-and-forget: never throws, never blocks the caller. `key` makes a replay
 * a no-op. Props go through the same PII scrub as client events.
 */
import 'server-only'
import { newId } from '@/lib/db/ids'
import { scrubProps } from './privacy'
import { mapBusEvent } from './events'

export interface ServerTrackOptions {
  userId?: string | null
  tenantId?: string | null
  props?: Record<string, unknown>
  /** Idempotency key (unique). */
  key?: string
  at?: Date
}

export async function recordServerEvent(name: string, o: ServerTrackOptions = {}): Promise<boolean> {
  const at = o.at ?? new Date()
  const { eventsCol, markUserDay } = await import('./store')
  try {
    await (await eventsCol()).insertOne({
      id: newId(),
      event: name.slice(0, 64),
      kind: 'server',
      mode: 'server',
      ts: at,
      timestamp: at.toISOString(),
      day: at.toISOString().slice(0, 10),
      ...(o.userId ? { user_id: o.userId } : {}),
      tenant_id: o.tenantId ?? null,
      properties: scrubProps(o.props),
      ...(o.key ? { dedupe_key: o.key.slice(0, 300) } : {}),
    })
  } catch (e) {
    if ((e as { code?: number })?.code === 11000) return false
    throw e
  }
  if (o.userId) await markUserDay(o.userId, o.tenantId, at)
  return true
}

export function trackServer(name: string, o: ServerTrackOptions = {}): void {
  void recordServerEvent(name, o).catch((e) => console.error('[analytics] trackServer failed:', name, (e as Error)?.message))
}

/**
 * Mirror new automation-outbox rows into analytics events (read-only on the
 * outbox; cursor in analytics_state). Idempotent through `dedupe_key`.
 */
export async function mirrorBusEvents(limit = 2000): Promise<number> {
  const { getMongoDb } = await import('@/lib/mongodb')
  const { stateCol, eventsCol, markUserDay } = await import('./store')
  const db = await getMongoDb()
  const state = await stateCol()
  const cur = await state.findOne({ _id: 'bus_cursor' })
  // First run: start 30 days back so dashboards have recent history.
  const since = (cur?.created_at as string) || new Date(Date.now() - 30 * 86_400_000).toISOString()
  const rows = (await db.collection('automation_events')
    .find({ created_at: { $gte: since } }, { projection: { _id: 0, id: 1, type: 1, payload: 1, tenant_id: 1, created_at: 1 } })
    .sort({ created_at: 1 })
    .limit(limit)
    .toArray()) as unknown as Array<{ id: string; type: string; payload?: Record<string, unknown>; tenant_id?: string | null; created_at: string }>
  if (!rows.length) return 0
  const ev = await eventsCol()
  let n = 0
  for (const r of rows) {
    const at = new Date(r.created_at)
    if (Number.isNaN(at.getTime())) continue
    for (const m of mapBusEvent(r)) {
      try {
        await ev.insertOne({
          id: newId(), event: m.event, kind: 'server', mode: 'server', ts: at, timestamp: at.toISOString(), day: r.created_at.slice(0, 10),
          ...(m.user_id ? { user_id: m.user_id } : {}), tenant_id: m.tenant_id, properties: m.properties, dedupe_key: m.dedupe_key,
        })
        n++
        if (m.user_id) await markUserDay(m.user_id, m.tenant_id, at)
      } catch (e) {
        if ((e as { code?: number })?.code !== 11000) throw e
      }
    }
  }
  // Rows sharing the last timestamp are re-read next time and skipped by dedupe_key.
  await state.updateOne({ _id: 'bus_cursor' }, { $set: { created_at: rows[rows.length - 1].created_at } }, { upsert: true })
  return n
}

/** Sign-in (any method). Looks up the user's organisation so tenant DAU counts it. One per user per hour. */
export function trackLogin(userId: string, method: string): void {
  void (async () => {
    const { getMongoDb } = await import('@/lib/mongodb')
    const u = await (await getMongoDb()).collection('user').findOne({ $or: [{ id: userId }, { _id: userId as never }] }, { projection: { tenantId: 1 } })
    const hour = new Date().toISOString().slice(0, 13)
    await recordServerEvent('login', { userId, tenantId: (u?.tenantId as string) || null, props: { method }, key: `login:${userId}:${hour}` })
  })().catch((e) => console.error('[analytics] trackLogin failed:', (e as Error)?.message))
}
