/**
 * ACL filter → SQL WHERE clause (pure).
 *
 * The knowledge ACL has ONE definition: lib/rag/acl.ts builds a Mongo-style
 * filter that Mongo $text, $vectorSearch and the in-process scan all run. The
 * pgvector store translates that same object here, so both stores enforce the
 * exact same rule inside the query. Only the shapes acl.ts produces are
 * accepted — anything else throws (fail closed), never "match everything".
 *
 *   { field: 'x' }                 → ("field" = $n)
 *   { field: { $in: [..] } }       → ("field" = ANY($n::text[]))     ($in: [] → FALSE)
 *   { $or: [..] } / { $and: [..] } → (a OR b) / (a AND b)
 *   {}                             → TRUE
 *
 * Values are always bound parameters; column names come from a fixed allowlist.
 */
import type { AclFilter } from '../acl'

/** Filterable fields (rag_chunks name → SQL column). */
const COLUMNS: Readonly<Record<string, string>> = {
  id: 'id',
  tenant_key: 'tenant_key',
  tenant_id: 'tenant_id',
  visibility: 'visibility',
  source_type: 'source_type',
  source_id: 'source_id',
  embedding_model: 'embedding_model',
}

export class UnsupportedFilterError extends Error {
  constructor(what: string) {
    super(`vector store: unsupported ACL filter (${what})`)
  }
}

export interface SqlWhere {
  sql: string
  params: unknown[]
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

/**
 * Translate `filter` into a parenthesised SQL predicate. Placeholders start at
 * `$${firstParam}` so the caller can put its own parameters first.
 */
export function aclFilterToSql(filter: AclFilter, firstParam = 1): SqlWhere {
  const params: unknown[] = []
  const bind = (v: unknown) => {
    params.push(v)
    return `$${firstParam + params.length - 1}`
  }

  const walk = (f: unknown): string => {
    if (!isPlainObject(f)) throw new UnsupportedFilterError('filter is not an object')
    const parts: string[] = []
    for (const [key, cond] of Object.entries(f)) {
      if (key === '$or' || key === '$and') {
        if (!Array.isArray(cond) || cond.length === 0) throw new UnsupportedFilterError(`${key} needs a non-empty array`)
        const sub = cond.map(walk)
        parts.push(sub.length === 1 ? sub[0] : `(${sub.join(key === '$or' ? ' OR ' : ' AND ')})`)
        continue
      }
      const col = COLUMNS[key]
      if (!col) throw new UnsupportedFilterError(`field ${key}`)
      if (typeof cond === 'string') {
        parts.push(`("${col}" = ${bind(cond)})`)
        continue
      }
      if (isPlainObject(cond)) {
        const ops = Object.keys(cond)
        if (ops.length !== 1 || ops[0] !== '$in') throw new UnsupportedFilterError(`operator ${ops.join(',')} on ${key}`)
        const list = cond.$in
        if (!Array.isArray(list) || list.some((x) => typeof x !== 'string')) throw new UnsupportedFilterError(`$in on ${key} must be a string array`)
        parts.push(list.length === 0 ? 'FALSE' : `("${col}" = ANY(${bind([...new Set(list as string[])])}::text[]))`)
        continue
      }
      throw new UnsupportedFilterError(`value of ${key}`)
    }
    if (parts.length === 0) return 'TRUE'
    return parts.length === 1 ? parts[0] : `(${parts.join(' AND ')})`
  }

  return { sql: walk(filter), params }
}
