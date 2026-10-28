/**
 * In-memory Postgres + pgvector stand-in for tests (never used in production).
 *
 * It understands exactly the statements lib/rag/vector-store/pgvector.ts sends
 * (each starts with a `/* rag:<op> *\/` tag) and — the part that matters —
 * EVALUATES the WHERE clause text produced by ./vector-store/sql-filter.ts with
 * its bound parameters, so tests exercise the real SQL ACL predicate rather
 * than a re-implementation of the rule. Search is exact cosine (like an HNSW
 * iterative scan that reaches k matches), ordered by distance.
 *
 * ponytail: no transactions (BEGIN/COMMIT/ROLLBACK are accepted, not isolated)
 * and O(n) scans — fine for the eval corpus.
 */
import { cosine } from '../fusion'
import type { PgClientLike, PgPoolLike, PgResult } from '../vector-store/pg-pool'

type Row = Record<string, unknown> & { id: string; embedding: number[] }
type Pred = (row: Record<string, unknown>) => boolean

const TOKEN = /\s*(\(|\)|AND\b|OR\b|TRUE\b|FALSE\b|"[a-z_]+"|=|ANY\(\$\d+::text\[\]\)|\$\d+)/y

/** Parse the WHERE clause emitted by aclFilterToSql into a predicate over `params`. */
export function compileWhere(sql: string, params: readonly unknown[]): Pred {
  const toks: string[] = []
  TOKEN.lastIndex = 0
  let m: RegExpExecArray | null
  while (TOKEN.lastIndex < sql.length && (m = TOKEN.exec(sql))) toks.push(m[1])
  if (sql.slice(TOKEN.lastIndex).trim()) throw new Error(`memory-pg: cannot parse WHERE near "${sql.slice(TOKEN.lastIndex, TOKEN.lastIndex + 30)}"`)
  let i = 0
  const peek = () => toks[i]
  const take = (want?: string) => {
    const t = toks[i++]
    if (want && t !== want) throw new Error(`memory-pg: expected ${want}, got ${t}`)
    return t
  }
  const param = (t: string) => params[Number(t.match(/\$(\d+)/)![1]) - 1]
  const expr = (): Pred => {
    const t = take()
    if (t === 'TRUE') return () => true
    if (t === 'FALSE') return () => false
    if (t !== '(') throw new Error(`memory-pg: unexpected ${t}`)
    if (peek()?.startsWith('"')) {
      const col = take().slice(1, -1)
      take('=')
      const rhs = take()
      take(')')
      if (rhs.startsWith('ANY(')) {
        const list = param(rhs) as unknown[]
        return (r) => list.includes(r[col])
      }
      const v = param(rhs)
      return (r) => r[col] === v
    }
    const parts = [expr()]
    let op: string | null = null
    while (peek() === 'AND' || peek() === 'OR') {
      const o = take()
      if (op && o !== op) throw new Error('memory-pg: mixed AND/OR without parentheses')
      op = o
      parts.push(expr())
    }
    take(')')
    return op === 'OR' ? (r) => parts.some((p) => p(r)) : (r) => parts.every((p) => p(r))
  }
  const p = expr()
  if (i !== toks.length) throw new Error('memory-pg: trailing tokens in WHERE')
  return p
}

function parseVector(lit: unknown): number[] {
  return String(lit).replace(/^\[|\]$/g, '').split(',').map(Number)
}

const UPSERT_COLS = ['id', 'source_type', 'source_id', 'tenant_key', 'tenant_id', 'visibility', 'chunk_index', 'text_hash', 'embedding_model', 'embedding', 'metadata', 'updated_at'] as const

export class MemoryPg implements PgPoolLike {
  extension: string | null
  readonly tables = new Map<string, { dims: number; rows: Map<string, Row> }>()
  registry: { model: string; table_name: string; dims: number }[] | null = null
  readonly indexes = new Set<string>()
  readonly log: { tag: string; sql: string; params: unknown[] }[] = []
  /** Settings applied by the last search transaction. */
  lastSearchSettings: unknown[] = []
  /** Make the next n statements with this tag fail (failure-path tests). */
  failNext: { tag: string; n: number } | null = null

  constructor(opts: { extensionVersion?: string | null; extensionInstalled?: boolean } = {}) {
    this.extension = opts.extensionInstalled === false ? null : opts.extensionVersion ?? '0.8.0'
  }

  async connect(): Promise<PgClientLike> {
    return { query: (t, p) => this.query(t, p), release: () => {} }
  }

  async query(text: string, params: unknown[] = []): Promise<PgResult> {
    const t = text.trim()
    if (t === 'BEGIN' || t === 'COMMIT' || t === 'ROLLBACK') return { rows: [] }
    const tag = t.match(/^\/\* rag:([a-z-]+) \*\//)?.[1]
    if (!tag) throw new Error(`memory-pg: untagged statement: ${t.slice(0, 60)}`)
    this.log.push({ tag, sql: t, params })
    if (this.failNext && this.failNext.tag === tag && this.failNext.n > 0) {
      this.failNext.n--
      throw new Error(`memory-pg: injected failure on ${tag}`)
    }
    const table = () => {
      const name = t.match(/(?:FROM|INTO) "([a-z0-9_]+)"/)?.[1]
      const tb = name ? this.tables.get(name) : undefined
      if (!tb) throw new Error(`memory-pg: relation "${name}" does not exist`)
      return tb
    }
    switch (tag) {
      case 'ext-version': return { rows: this.extension ? [{ extversion: this.extension }] : [] }
      case 'ext-create': this.extension ??= '0.8.0'; return { rows: [] }
      case 'schema-lock': return { rows: [] }
      case 'ddl': {
        if (!this.extension && /vector\(/.test(t)) throw new Error('memory-pg: type "vector" does not exist')
        const create = t.match(/CREATE TABLE IF NOT EXISTS "?([a-z0-9_]+)"?/)
        if (create) {
          if (create[1] === 'rag_vector_tables') this.registry ??= []
          else if (!this.tables.has(create[1])) this.tables.set(create[1], { dims: Number(t.match(/vector\((\d+)\)/)![1]), rows: new Map() })
        }
        const idx = t.match(/CREATE INDEX IF NOT EXISTS "([a-z0-9_]+)"/)
        if (idx) this.indexes.add(idx[1])
        return { rows: [] }
      }
      case 'registry-exists': return { rows: [{ t: this.registry ? 'rag_vector_tables' : null }] }
      case 'registry': return { rows: [...(this.registry ?? [])].sort((a, b) => (a.model < b.model ? -1 : 1)) }
      case 'registry-insert': {
        const [model, table_name, dims] = params as [string, string, number]
        if (!this.registry!.some((r) => r.model === model)) this.registry!.push({ model, table_name, dims })
        return { rows: [] }
      }
      case 'registry-get': return { rows: (this.registry ?? []).filter((r) => r.model === params[0]) }
      case 'search-settings': this.lastSearchSettings = [...params, t]; return { rows: [{}] }
      case 'search': {
        const tb = table()
        const where = t.match(/ WHERE ([\s\S]*) ORDER BY embedding <=> \$1::vector LIMIT \$2$/)
        if (!where) throw new Error('memory-pg: unexpected search shape')
        const pred = compileWhere(where[1], params)
        const qv = parseVector(params[0])
        if (qv.length !== tb.dims) throw new Error(`memory-pg: expected ${tb.dims} dimensions, not ${qv.length}`)
        const k = Number(params[1])
        const hits = [...tb.rows.values()].filter(pred)
          .map((r) => ({ id: r.id, score: cosine(qv, r.embedding) }))
          .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1))
          .slice(0, k)
        return { rows: hits }
      }
      case 'upsert': {
        const tb = table()
        const n = UPSERT_COLS.length
        for (let i = 0; i < params.length; i += n) {
          const row = Object.fromEntries(UPSERT_COLS.map((c, j) => [c, params[i + j]])) as Record<string, unknown>
          const emb = parseVector(row.embedding)
          if (emb.length !== tb.dims) throw new Error(`memory-pg: expected ${tb.dims} dimensions, not ${emb.length}`)
          tb.rows.set(String(row.id), { ...row, id: String(row.id), embedding: emb, metadata: JSON.parse(String(row.metadata)) })
        }
        return { rows: [], rowCount: params.length / n }
      }
      case 'delete-source': {
        const tb = table()
        let n = 0
        for (const [id, r] of tb.rows) if (r.source_type === params[0] && r.source_id === params[1]) { tb.rows.delete(id); n++ }
        return { rows: [], rowCount: n }
      }
      case 'count': return { rows: [{ n: table().rows.size }] }
      case 'list-ids': {
        const ids = [...table().rows.keys()].filter((id) => id > String(params[0])).sort().slice(0, Number(params[1]))
        return { rows: ids.map((id) => ({ id })) }
      }
      case 'delete-ids': {
        const tb = table()
        let n = 0
        for (const id of params[0] as string[]) if (tb.rows.delete(id)) n++
        return { rows: [], rowCount: n }
      }
      default: throw new Error(`memory-pg: unknown tag ${tag}`)
    }
  }
}
