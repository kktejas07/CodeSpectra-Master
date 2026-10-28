/**
 * Vector store configuration.
 *
 *   PGVECTOR_URL / Admin → Settings secret `pgvector_url`
 *       postgres://user:pass@host:5432/db — when set, every index write is
 *       mirrored to pgvector (so a backfill + the live mirror keep it current).
 *   RAG_VECTOR_STORE / Admin → Settings `rag_vector_store`   mongo | pgvector
 *       Which store answers the vector leg. 'pgvector' takes effect only once
 *       the backfill for the corpus model has completed against this database
 *       (lib/rag/vector-store/backfill.ts); until then reads stay on Mongo.
 *   PGVECTOR_CA_CERT   optional PEM CA bundle (e.g. the AWS RDS bundle).
 *   PGVECTOR_POOL_MAX  pool size per process (default 5).
 *
 * Admin-saved values win over env (same order as lib/piston.ts).
 * TLS: required, with certificate verification, for any host that isn't
 * localhost / a loopback address / a Unix socket.
 */
import { createHash } from 'crypto'
import { readServerSecrets } from '@/lib/server-secrets-cache'
import type { VectorStoreKind } from './types'

export interface VectorStoreConfig {
  /** Store the operator asked for. */
  want: VectorStoreKind
  /** Postgres URL (credentials included) or null when pgvector isn't configured. */
  url: string | null
  /** Why `url` was rejected (bad URL, TLS disabled for a remote host, …). */
  error: string | null
}

export function parseStoreKind(raw: unknown): VectorStoreKind {
  return String(raw ?? '').trim().toLowerCase() === 'pgvector' ? 'pgvector' : 'mongo'
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

export function isLocalHost(host: string): boolean {
  const h = host.trim().toLowerCase()
  return !h || h.startsWith('/') || LOCAL_HOSTS.has(h) || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h) || h.endsWith('.localhost')
}

const SSL_PARAMS = ['ssl', 'sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'sslpassword', 'uselibpqcompat']
const INSECURE_MODES = new Set(['disable', 'allow', 'prefer', 'no-verify'])

export interface PgConnectionOptions {
  connectionString: string
  ssl: false | { rejectUnauthorized: true; ca?: string; servername?: string }
  host: string
  database: string
  /** Stable id of the target database (host:port/db) — never includes credentials. */
  fingerprint: string
}

/**
 * Validate a Postgres URL and build pg Pool options (pure). SSL query params
 * are stripped from the connection string because pg lets them override the
 * explicit `ssl` object; TLS is set here instead.
 */
export function pgConnectionOptions(rawUrl: string, opts: { caCert?: string | null } = {}): PgConnectionOptions {
  let u: URL
  try {
    u = new URL(rawUrl.trim())
  } catch {
    throw new Error('PGVECTOR_URL is not a valid URL')
  }
  if (u.protocol !== 'postgres:' && u.protocol !== 'postgresql:') throw new Error('PGVECTOR_URL must start with postgres:// or postgresql://')
  const socketHost = u.searchParams.get('host') ?? ''
  const host = decodeURIComponent(u.hostname || socketHost)
  const database = decodeURIComponent(u.pathname.replace(/^\//, '')) || 'postgres'
  const mode = (u.searchParams.get('sslmode') ?? '').toLowerCase()
  const local = isLocalHost(host)
  if (!local && (INSECURE_MODES.has(mode) || u.searchParams.get('ssl') === 'false')) {
    throw new Error(`TLS is required for the non-local Postgres host ${host} (remove sslmode=${mode || 'false'})`)
  }
  for (const p of SSL_PARAMS) u.searchParams.delete(p)
  const wantTls = !local || ['require', 'verify-ca', 'verify-full'].includes(mode)
  const ca = opts.caCert?.trim() || undefined
  const fingerprint = createHash('sha256').update(`${host}:${u.port || '5432'}/${database}`).digest('hex').slice(0, 16)
  return {
    connectionString: u.toString(),
    ssl: wantTls ? { rejectUnauthorized: true, ...(ca ? { ca } : {}), ...(host && !host.startsWith('/') ? { servername: host } : {}) } : false,
    host,
    database,
    fingerprint,
  }
}

let cached: { at: number; value: VectorStoreConfig } | null = null
const TTL_MS = 30_000

export async function readVectorStoreConfig(): Promise<VectorStoreConfig> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value
  let secrets: { pgvector_url?: string; rag_vector_store?: string } = {}
  try {
    secrets = (await readServerSecrets()) as typeof secrets
  } catch { /* cold start: env only */ }
  const url = (secrets.pgvector_url?.trim() || process.env.PGVECTOR_URL?.trim() || '') || null
  const want = parseStoreKind(secrets.rag_vector_store?.trim() || process.env.RAG_VECTOR_STORE)
  let error: string | null = null
  if (url) {
    try {
      pgConnectionOptions(url)
    } catch (e) {
      error = (e as Error).message
    }
  }
  const value: VectorStoreConfig = { want, url: error ? null : url, error }
  cached = { at: Date.now(), value }
  return value
}

/** Tests / admin saves: drop the cached config. */
export function resetVectorStoreConfigCache(): void {
  cached = null
}
