/**
 * Lazily created pg Pool for the pgvector store (one per process, rebuilt when
 * the configured URL changes). `pg` is imported on first use only, so a
 * Mongo-only deployment never loads it. Tests mock this module with an
 * in-memory stand-in (lib/rag/eval/memory-pg.ts).
 */
import { pgConnectionOptions } from './config'

export interface PgResult {
  rows: Record<string, unknown>[]
  rowCount?: number | null
}

export interface PgQueryable {
  query(text: string, params?: unknown[]): Promise<PgResult>
}

export interface PgClientLike extends PgQueryable {
  release(err?: Error | boolean): void
}

export interface PgPoolLike extends PgQueryable {
  connect(): Promise<PgClientLike>
}

type EndablePool = PgPoolLike & { end?: () => Promise<void> }
let current: { url: string; pool: Promise<EndablePool> } | null = null

export function getPgPool(url: string): Promise<PgPoolLike> {
  if (current?.url === url) return current.pool
  const old = current
  const pool = createPool(url)
  current = { url, pool }
  pool.catch(() => { if (current?.pool === pool) current = null })
  if (old) void old.pool.then((p) => p.end?.()).catch(() => {})
  return pool
}

async function createPool(url: string): Promise<EndablePool> {
  const opts = pgConnectionOptions(url, { caCert: process.env.PGVECTOR_CA_CERT })
  const { Pool } = await import('pg')
  const max = Math.max(1, Math.min(50, Math.floor(Number(process.env.PGVECTOR_POOL_MAX)) || 5))
  const pool = new Pool({
    connectionString: opts.connectionString,
    ssl: opts.ssl,
    max,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 15_000,
    application_name: 'codespectra-rag',
  })
  // An idle client error must not crash the process; the next query reconnects.
  pool.on('error', (e: Error) => console.error('[rag/pgvector] idle client error:', e.message))
  return pool as unknown as EndablePool
}
