/**
 * Minimal in-memory MongoDB stand-in for unit tests. Supports the filter /
 * update operators the app uses, with MongoDB semantics where it matters for
 * concurrency tests: dotted paths through arrays ('lines.id'), $elemMatch,
 * null matching a missing field, $expr ($add/$ifNull/$lt/…), positional `$`,
 * `$[]` and `$[name]` (arrayFilters) updates, $pull by condition, upserts,
 * unique indexes. Every call is applied synchronously after one await, so
 * interleaved Promise.all calls behave like separate atomic MongoDB writes.
 */
type Doc = Record<string, any>

const isObj = (v: unknown): v is Doc => !!v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)
const hasOps = (v: unknown) => isObj(v) && Object.keys(v).some((k) => k.startsWith('$'))
const clone = <T,>(v: T): T => (v == null ? v : JSON.parse(JSON.stringify(v)))

function get(doc: Doc, path: string): any {
  return path.split('.').reduce((v, k) => (v == null ? undefined : v[k]), doc)
}
function set(doc: Doc, path: string, value: any) {
  const keys = path.split('.')
  let cur = doc
  for (const k of keys.slice(0, -1)) cur = cur[k] ??= {}
  cur[keys[keys.length - 1]] = value
}
function unset(doc: Doc, path: string) {
  const keys = path.split('.')
  let cur = doc
  for (const k of keys.slice(0, -1)) { cur = cur?.[k]; if (!cur) return }
  delete cur[keys[keys.length - 1]]
}

/** Candidate values at a dotted path, walking into arrays like MongoDB does. */
function candidates(v: any, keys: string[]): any[] {
  if (!keys.length) return [v]
  if (v == null) return [undefined]
  const [k, ...rest] = keys
  if (Array.isArray(v)) {
    if (/^\d+$/.test(k)) return candidates(v[Number(k)], rest)
    const out = v.flatMap((el) => (isObj(el) || Array.isArray(el) ? candidates(el, keys) : []))
    return out.length ? out : [undefined]
  }
  if (typeof v !== 'object') return [undefined]
  return candidates(v[k], rest)
}

const eq = (a: any, b: any): boolean => {
  if (b === null) return a === null || a === undefined
  if (typeof a === 'object' && a !== null) return JSON.stringify(a) === JSON.stringify(b)
  return a === b
}
/** A value and, when it is an array, its elements. */
const expand = (v: any): any[] => (Array.isArray(v) ? [v, ...v] : [v])

function matchCond(values: any[], cond: any): boolean {
  if (!hasOps(cond)) return values.some((v) => expand(v).some((x) => eq(x, cond)))
  return Object.entries(cond).every(([op, arg]) => {
    switch (op) {
      case '$eq': return values.some((v) => expand(v).some((x) => eq(x, arg)))
      case '$ne': return !values.some((v) => expand(v).some((x) => eq(x, arg)))
      case '$in': return values.some((v) => expand(v).some((x) => (arg as any[]).some((a) => eq(x, a))))
      case '$nin': return !values.some((v) => expand(v).some((x) => (arg as any[]).some((a) => eq(x, a))))
      case '$gt': return values.some((v) => expand(v).some((x) => x != null && x > (arg as any)))
      case '$gte': return values.some((v) => expand(v).some((x) => x != null && x >= (arg as any)))
      case '$lt': return values.some((v) => expand(v).some((x) => x != null && x < (arg as any)))
      case '$lte': return values.some((v) => expand(v).some((x) => x != null && x <= (arg as any)))
      case '$exists': return arg ? values.some((v) => v !== undefined) : values.every((v) => v === undefined)
      case '$size': return values.some((v) => Array.isArray(v) && v.length === arg)
      case '$all': { const flat = values.flatMap((v) => expand(v)); return (arg as any[]).every((a) => flat.some((x) => eq(x, a))) }
      case '$not': return !matchCond(values, arg)
      case '$regex': {
        const re = new RegExp(arg as string, (cond as Doc).$options || '')
        return values.some((v) => expand(v).some((x) => typeof x === 'string' && re.test(x)))
      }
      case '$options': return true
      case '$elemMatch': return values.some((v) => Array.isArray(v) && v.some((el) => elemMatches(el, arg)))
      default: throw new Error(`fake-mongo: unsupported operator ${op}`)
    }
  })
}

function elemMatches(el: any, cond: any): boolean {
  if (hasOps(cond) && Object.keys(cond).every((k) => k.startsWith('$') && !['$and', '$or', '$nor'].includes(k))) return matchCond([el], cond)
  return isObj(el) && matches(el, cond)
}

// $expr — the handful of aggregation operators the app uses in filters.
function evalExpr(doc: Doc, e: any): any {
  if (typeof e === 'string' && e.startsWith('$')) return get(doc, e.slice(1))
  if (!isObj(e)) return e
  const [[op, raw]] = Object.entries(e)
  const args = (Array.isArray(raw) ? raw : [raw]).map((a) => evalExpr(doc, a))
  switch (op) {
    case '$add': return args.reduce((a, b) => (a ?? 0) + (b ?? 0), 0)
    case '$subtract': return (args[0] ?? 0) - (args[1] ?? 0)
    case '$ifNull': return args[0] ?? args[1]
    case '$lt': return args[0] < args[1]
    case '$lte': return args[0] <= args[1]
    case '$gt': return args[0] > args[1]
    case '$gte': return args[0] >= args[1]
    case '$eq': return args[0] === args[1]
    case '$and': return args.every(Boolean)
    case '$or': return args.some(Boolean)
    default: throw new Error(`fake-mongo: unsupported $expr operator ${op}`)
  }
}

export function matches(doc: Doc, filter: Doc): boolean {
  return Object.entries(filter || {}).every(([k, cond]) => {
    if (k === '$or') return (cond as Doc[]).some((f) => matches(doc, f))
    if (k === '$and') return (cond as Doc[]).every((f) => matches(doc, f))
    if (k === '$nor') return !(cond as Doc[]).some((f) => matches(doc, f))
    if (k === '$expr') return !!evalExpr(doc, cond)
    return matchCond(candidates(doc, k.split('.')), cond)
  })
}

// ─── Updates ────────────────────────────────────────────────────────────────

/** Conditions in `filter` that apply to elements of the array at `prefix`. */
function elementConds(filter: Doc, prefix: string): Array<(el: any) => boolean> {
  const out: Array<(el: any) => boolean> = []
  for (const [k, v] of Object.entries(filter || {})) {
    if (k === '$and') for (const f of v as Doc[]) out.push(...elementConds(f, prefix))
    else if (k === prefix && isObj(v) && '$elemMatch' in v) out.push((el) => elemMatches(el, v.$elemMatch))
    else if (k.startsWith(`${prefix}.`)) {
      const sub = k.slice(prefix.length + 1)
      out.push((el) => matchCond(candidates(el, sub.split('.')), v))
    }
  }
  return out
}

/** Concrete paths for a path with `$`, `$[]` or `$[name]` segments. */
function resolvePaths(doc: Doc, path: string, filter: Doc, arrayFilters: Doc[]): string[] {
  const keys = path.split('.')
  const i = keys.findIndex((k) => k === '$' || /^\$\[\w*\]$/.test(k))
  if (i < 0) return [path]
  const prefix = keys.slice(0, i).join('.')
  const arr = get(doc, prefix)
  if (!Array.isArray(arr)) return []
  let idx: number[]
  const seg = keys[i]
  if (seg === '$') {
    const conds = elementConds(filter, prefix)
    const first = arr.findIndex((el) => conds.every((c) => c(el)))
    if (first < 0) throw new Error(`fake-mongo: positional $ on ${prefix} matched no element`)
    idx = [first]
  } else if (seg === '$[]') {
    idx = arr.map((_, n) => n)
  } else {
    const name = seg.slice(2, -1)
    const af = arrayFilters.find((f) => Object.keys(f).some((k) => k === name || k.startsWith(`${name}.`)))
    if (!af) throw new Error(`fake-mongo: no arrayFilter for ${name}`)
    const stripped: Doc = {}
    for (const [k, v] of Object.entries(af)) stripped[k === name ? '' : k.slice(name.length + 1)] = v
    idx = arr.map((_, n) => n).filter((n) => Object.entries(stripped).every(([k, v]) => (k ? matchCond(candidates(arr[n], k.split('.')), v) : matchCond([arr[n]], v))))
  }
  const rest = keys.slice(i + 1).join('.')
  return idx.flatMap((n) => resolvePaths(doc, [prefix, String(n), rest].filter(Boolean).join('.'), filter, arrayFilters))
}

function applyUpdate(doc: Doc, update: Doc, inserting: boolean, filter: Doc = {}, arrayFilters: Doc[] = []) {
  // Positional / filtered paths resolve against the document as it was BEFORE this update (as in MongoDB).
  const before = clone(doc)
  for (const [op, fields] of Object.entries(update)) {
    for (const [rawPath, val] of Object.entries(fields as Doc)) {
      for (const path of resolvePaths(before, rawPath, filter, arrayFilters)) {
        switch (op) {
          case '$set': set(doc, path, clone(val)); break
          case '$unset': unset(doc, path); break
          case '$setOnInsert': if (inserting) set(doc, path, clone(val)); break
          case '$inc': set(doc, path, (get(doc, path) || 0) + (val as number)); break
          case '$addToSet': { const a = get(doc, path) || []; if (!a.some((x: any) => eq(x, val))) a.push(clone(val)); set(doc, path, a); break }
          case '$push': {
            const a = get(doc, path) || []
            if (isObj(val) && '$each' in val) {
              a.push(...clone(val.$each as any[]))
              const sl = (val as Doc).$slice
              set(doc, path, typeof sl === 'number' ? (sl < 0 ? a.slice(sl) : a.slice(0, sl)) : a)
            } else { a.push(clone(val)); set(doc, path, a) }
            break
          }
          case '$min': { const cur = get(doc, path); if (cur === undefined || val < cur) set(doc, path, clone(val)); break }
          case '$max': { const cur = get(doc, path); if (cur === undefined || val > cur) set(doc, path, clone(val)); break }
          case '$pull': {
            const a = get(doc, path)
            if (Array.isArray(a)) set(doc, path, a.filter((x: any) => !(isObj(val) ? elemMatches(x, val) : eq(x, val))))
            break
          }
          default: throw new Error(`fake-mongo: unsupported update ${op}`)
        }
      }
    }
  }
}

function sortDocs(docs: Doc[], sort?: Doc): Doc[] {
  if (!sort) return docs
  const [[key, dir]] = Object.entries(sort)
  return [...docs].sort((a, b) => ((get(a, key) ?? '') < (get(b, key) ?? '') ? -1 : 1) * (dir as number))
}

type UpdateOpts = { upsert?: boolean; arrayFilters?: Doc[]; sort?: Doc }

export class FakeCollection {
  docs: Doc[] = []
  /** Unique indexes: single-key (legacy behaviour) or compound; `partial` skips docs missing/null on any key. */
  unique: { keys: string[]; partial: boolean }[] = []

  private checkUnique(candidate: Doc, self?: Doc) {
    for (const { keys, partial } of this.unique) {
      const vals = keys.map((k) => get(candidate, k))
      if (keys.length === 1 && (vals[0] === undefined || vals[0] === '')) continue
      if (partial && vals.some((v) => v === undefined || v === null || v === '')) continue
      if (this.docs.some((d) => d !== self && keys.every((k, i) => get(d, k) === vals[i]))) {
        throw Object.assign(new Error('E11000 duplicate key'), { code: 11000 })
      }
    }
  }

  async createIndex(spec: Doc, opts?: { unique?: boolean; partialFilterExpression?: Doc }) {
    if (opts?.unique) this.unique.push({ keys: Object.keys(spec), partial: !!opts.partialFilterExpression })
    return 'ok'
  }
  async findOne(filter: Doc = {}, opts: { sort?: Doc } = {}) {
    return clone(sortDocs(this.docs.filter((d) => matches(d, filter)), opts.sort)[0] ?? null)
  }
  find(filter: Doc = {}, opts: { sort?: Doc } = {}) {
    let rows = sortDocs(this.docs.filter((d) => matches(d, filter)), opts.sort)
    const cursor = {
      sort: (s: Doc) => { rows = sortDocs(rows, s); return cursor },
      limit: (n: number) => { if (n) rows = rows.slice(0, n); return cursor },
      project: () => cursor,
      toArray: async () => clone(rows),
      next: async () => clone(rows[0] ?? null),
    }
    return cursor
  }
  async distinct(key: string, filter: Doc = {}) {
    const out: any[] = []
    for (const d of this.docs.filter((x) => matches(x, filter))) {
      const v = get(d, key)
      for (const x of Array.isArray(v) ? v : [v]) if (x !== undefined && !out.some((o) => eq(o, x))) out.push(x)
    }
    return out
  }
  async countDocuments(filter: Doc = {}) {
    return this.docs.filter((d) => matches(d, filter)).length
  }
  async insertOne(doc: Doc) {
    const d = clone(doc)
    this.checkUnique(d)
    this.docs.push(d)
    return { insertedId: d.id }
  }
  async insertMany(docs: Doc[]) {
    for (const d of docs) await this.insertOne(d)
    return { insertedCount: docs.length }
  }
  async updateOne(filter: Doc, update: Doc, opts: UpdateOpts = {}) {
    const doc = this.docs.find((d) => matches(d, filter))
    if (doc) {
      const next = clone(doc)
      applyUpdate(next, update, false, filter, opts.arrayFilters)
      this.checkUnique(next, doc)
      const changed = JSON.stringify(next) !== JSON.stringify(doc)
      Object.keys(doc).forEach((k) => delete doc[k])
      Object.assign(doc, next)
      return { matchedCount: 1, modifiedCount: changed ? 1 : 0, upsertedCount: 0 }
    }
    if (opts.upsert) {
      const fresh: Doc = {}
      for (const [k, v] of Object.entries(filter)) if (!k.startsWith('$') && (typeof v !== 'object' || v === null)) set(fresh, k, v)
      applyUpdate(fresh, update, true, filter, opts.arrayFilters)
      this.checkUnique(fresh)
      this.docs.push(fresh)
      return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 }
    }
    return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 }
  }
  async updateMany(filter: Doc, update: Doc, opts: UpdateOpts = {}) {
    const rows = this.docs.filter((d) => matches(d, filter))
    rows.forEach((d) => applyUpdate(d, update, false, filter, opts.arrayFilters))
    return { matchedCount: rows.length, modifiedCount: rows.length }
  }
  async replaceOne(filter: Doc, doc: Doc, opts: { upsert?: boolean } = {}) {
    const i = this.docs.findIndex((d) => matches(d, filter))
    if (i >= 0) { this.docs[i] = clone(doc); return { matchedCount: 1, modifiedCount: 1 } }
    if (opts.upsert) { this.docs.push(clone(doc)); return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 } }
    return { matchedCount: 0, modifiedCount: 0 }
  }
  async findOneAndUpdate(filter: Doc, update: Doc, opts: UpdateOpts = {}) {
    const doc = sortDocs(this.docs.filter((d) => matches(d, filter)), opts.sort)[0]
    if (!doc) return null
    applyUpdate(doc, update, false, filter, opts.arrayFilters)
    return clone(doc)
  }
  async deleteMany(filter: Doc) {
    const before = this.docs.length
    this.docs = this.docs.filter((d) => !matches(d, filter))
    return { deletedCount: before - this.docs.length }
  }
  async deleteOne(filter: Doc) {
    const i = this.docs.findIndex((d) => matches(d, filter))
    if (i >= 0) this.docs.splice(i, 1)
    return { deletedCount: i >= 0 ? 1 : 0 }
  }
}

export class FakeDb {
  cols = new Map<string, FakeCollection>()
  collection(name: string) {
    if (!this.cols.has(name)) this.cols.set(name, new FakeCollection())
    return this.cols.get(name)!
  }
}
