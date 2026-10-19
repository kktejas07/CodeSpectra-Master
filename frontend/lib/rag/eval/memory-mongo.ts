/**
 * In-memory MongoDB stand-in for the offline RAG evaluation (never used in
 * production). It covers what lib/rag's ingest + search + source loaders call:
 * find/findOne (projection, sort, skip, limit, next), counts, distinct,
 * updates/upserts, findOneAndUpdate, bulkWrite, a small aggregate, and — the
 * important part — a `$text` emulation that follows MongoDB's English text
 * index: Snowball stemming, English stop words, per-field weights from the
 * `createIndex({...: 'text'}, { weights })` call, OR semantics, `-negation`,
 * "phrases", and MongoDB's textScore formula:
 *
 *   per field: for each term, freq = Σ 1/2^(occurrence-1) (saturates at 2),
 *              coeff = 0.5 · count / numTokens + 0.5,
 *              score += weight · freq · coeff · (1.1 if the whole field is the term)
 *   textScore = Σ over distinct query terms of the document's term scores.
 *
 * ponytail: single-process, O(n) scans. Fine for a few thousand chunks.
 */
import { rawTokens, textIndexTerms } from './stemmer'

type Doc = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

function getPath(doc: Doc, path: string): unknown {
  return path.split('.').reduce<unknown>((v, k) => (v == null ? undefined : (v as Doc)[k]), doc)
}
function setPath(doc: Doc, path: string, value: unknown) {
  const keys = path.split('.')
  let cur = doc
  for (const k of keys.slice(0, -1)) cur = (cur[k] ??= {})
  cur[keys[keys.length - 1]] = value
}
function unsetPath(doc: Doc, path: string) {
  const keys = path.split('.')
  let cur: Doc | undefined = doc
  for (const k of keys.slice(0, -1)) { cur = cur?.[k]; if (!cur) return }
  delete cur[keys[keys.length - 1]]
}
const clone = <T,>(v: T): T => (v == null ? v : typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)))

function bsonType(v: unknown): string {
  if (v === null) return 'null'
  if (v === undefined) return 'missing'
  if (Array.isArray(v)) return 'array'
  if (typeof v === 'string') return 'string'
  if (typeof v === 'number') return Number.isInteger(v) ? 'int' : 'double'
  if (typeof v === 'boolean') return 'bool'
  if (v instanceof Date) return 'date'
  return 'object'
}

function cmp(a: unknown, b: unknown): number {
  if (a === b) return 0
  if (a === undefined || a === null) return -1
  if (b === undefined || b === null) return 1
  return (a as number) < (b as number) ? -1 : (a as number) > (b as number) ? 1 : 0
}

// ─── Text index ──────────────────────────────────────────────────────────────

interface TextIndex { fields: Record<string, number>; name?: string }

function fieldTermScores(raw: string, weight: number, into: Map<string, number>) {
  const terms = textIndexTerms(raw)
  if (!terms.length) return
  const data = new Map<string, { count: number; freq: number; exp: number }>()
  for (const t of terms) {
    const d = data.get(t) ?? { count: 0, freq: 0, exp: 0 }
    d.exp = d.exp ? d.exp * 2 : 1
    d.count += 1
    d.freq += 1 / d.exp
    data.set(t, d)
  }
  const whole = rawTokens(raw).join(' ')
  for (const [t, d] of data) {
    const coeff = 0.5 * d.count / terms.length + 0.5
    const adjustment = whole === t ? 1.1 : 1
    into.set(t, (into.get(t) ?? 0) + weight * d.freq * coeff * adjustment)
  }
}

interface ParsedTextQuery { terms: string[]; negated: Set<string>; phrases: string[] }

export function parseTextSearch(search: string): ParsedTextQuery {
  const phrases: string[] = []
  const rest = search.replace(/"([^"]*)"/g, (_m, p: string) => { if (p.trim()) phrases.push(p.toLowerCase()); return ` ${p} ` })
  const terms: string[] = []
  const negated = new Set<string>()
  for (const word of rest.split(/\s+/).filter(Boolean)) {
    if (word.startsWith('-') && word.length > 1) textIndexTerms(word.slice(1)).forEach((t) => negated.add(t))
    else terms.push(...textIndexTerms(word))
  }
  return { terms: [...new Set(terms)].filter((t) => !negated.has(t)), negated, phrases }
}

// ─── Matching ────────────────────────────────────────────────────────────────

type MatchCtx = { textScore: (doc: Doc, search: string) => number; scores: WeakMap<Doc, number> }

function matchValue(v: unknown, cond: unknown): boolean {
  if (cond instanceof RegExp) return typeof v === 'string' && cond.test(v)
  if (cond && typeof cond === 'object' && !Array.isArray(cond) && Object.keys(cond).some((k) => k.startsWith('$'))) {
    const c = cond as Doc
    return Object.entries(c).every(([op, arg]) => {
      const arr = Array.isArray(v) ? v : [v]
      switch (op) {
        case '$eq': return matchValue(v, arg)
        case '$in': return (arg as unknown[]).some((a) => (a === null ? v == null : arr.includes(a)))
        case '$nin': return !(arg as unknown[]).some((a) => (a === null ? v == null : arr.includes(a)))
        case '$ne': return arg === null ? v != null : !arr.includes(arg)
        case '$gt': return v != null && cmp(v, arg) > 0
        case '$gte': return v != null && cmp(v, arg) >= 0
        case '$lt': return v != null && cmp(v, arg) < 0
        case '$lte': return v != null && cmp(v, arg) <= 0
        case '$exists': return (v !== undefined) === !!arg
        case '$type': return bsonType(v) === arg || (arg === 'number' && typeof v === 'number')
        case '$regex': return typeof v === 'string' && new RegExp(arg as string, String(c.$options ?? '')).test(v)
        case '$options': return true
        case '$not': return !matchValue(v, arg)
        case '$size': return Array.isArray(v) && v.length === arg
        default: throw new Error(`memory-mongo: unsupported operator ${op}`)
      }
    })
  }
  if (cond === null) return v === null || v === undefined
  if (Array.isArray(v) && !Array.isArray(cond)) return v.includes(cond)
  if (Array.isArray(v) && Array.isArray(cond)) return JSON.stringify(v) === JSON.stringify(cond)
  return v === cond
}

function matches(doc: Doc, filter: Doc, ctx: MatchCtx): boolean {
  return Object.entries(filter || {}).every(([k, cond]) => {
    if (k === '$or') return (cond as Doc[]).some((f) => matches(doc, f, ctx))
    if (k === '$and') return (cond as Doc[]).every((f) => matches(doc, f, ctx))
    if (k === '$nor') return !(cond as Doc[]).some((f) => matches(doc, f, ctx))
    if (k === '$text') {
      const score = ctx.textScore(doc, String((cond as Doc).$search ?? ''))
      if (score <= 0) return false
      ctx.scores.set(doc, score)
      return true
    }
    return matchValue(getPath(doc, k), cond)
  })
}

// ─── Updates ─────────────────────────────────────────────────────────────────

function applyUpdate(doc: Doc, update: Doc, inserting: boolean) {
  for (const [op, fields] of Object.entries(update)) {
    for (const [path, val] of Object.entries(fields as Doc)) {
      switch (op) {
        case '$set': setPath(doc, path, clone(val)); break
        case '$unset': unsetPath(doc, path); break
        case '$setOnInsert': if (inserting) setPath(doc, path, clone(val)); break
        case '$inc': setPath(doc, path, ((getPath(doc, path) as number) || 0) + (val as number)); break
        case '$max': { const cur = getPath(doc, path); if (cur === undefined || cmp(val, cur) > 0) setPath(doc, path, val); break }
        case '$min': { const cur = getPath(doc, path); if (cur === undefined || cmp(val, cur) < 0) setPath(doc, path, val); break }
        case '$push': { const a = (getPath(doc, path) as unknown[]) || []; a.push(clone(val)); setPath(doc, path, a); break }
        case '$addToSet': { const a = (getPath(doc, path) as unknown[]) || []; if (!a.includes(val)) a.push(val); setPath(doc, path, a); break }
        case '$pull': { const a = getPath(doc, path); if (Array.isArray(a)) setPath(doc, path, a.filter((x) => x !== val)); break }
        default: throw new Error(`memory-mongo: unsupported update ${op}`)
      }
    }
  }
}

function seedFromFilter(filter: Doc): Doc {
  const out: Doc = {}
  for (const [k, v] of Object.entries(filter)) {
    if (k.startsWith('$')) continue
    if (v === null || typeof v !== 'object' || v instanceof Date) setPath(out, k, v)
    else if (Object.keys(v).length === 1 && '$eq' in v) setPath(out, k, (v as Doc).$eq)
  }
  return out
}

// ─── Aggregation expressions ─────────────────────────────────────────────────

function evalExpr(doc: Doc, e: unknown): unknown {
  if (typeof e === 'string' && e.startsWith('$')) return getPath(doc, e.slice(1))
  if (Array.isArray(e)) return e.map((x) => evalExpr(doc, x))
  if (e && typeof e === 'object' && !(e instanceof Date)) {
    const [op, arg] = Object.entries(e as Doc)[0] ?? []
    if (!op?.startsWith('$')) return Object.fromEntries(Object.entries(e as Doc).map(([k, v]) => [k, evalExpr(doc, v)]))
    const a = (i: number) => evalExpr(doc, (arg as unknown[])[i])
    switch (op) {
      case '$cond': return Array.isArray(arg) ? (a(0) ? a(1) : a(2)) : (evalExpr(doc, (arg as Doc).if) ? evalExpr(doc, (arg as Doc).then) : evalExpr(doc, (arg as Doc).else))
      case '$eq': return a(0) === a(1)
      case '$ne': return a(0) !== a(1)
      case '$gt': return cmp(a(0), a(1)) > 0
      case '$gte': return cmp(a(0), a(1)) >= 0
      case '$lt': return cmp(a(0), a(1)) < 0
      case '$lte': return cmp(a(0), a(1)) <= 0
      case '$in': return ((a(1) as unknown[]) ?? []).includes(a(0))
      case '$and': return (arg as unknown[]).every((x) => !!evalExpr(doc, x))
      case '$or': return (arg as unknown[]).some((x) => !!evalExpr(doc, x))
      case '$not': return !evalExpr(doc, Array.isArray(arg) ? arg[0] : arg)
      case '$ifNull': return a(0) ?? a(1)
      case '$type': return bsonType(evalExpr(doc, arg))
      case '$strLenCP': { const s = evalExpr(doc, arg); return typeof s === 'string' ? [...s].length : 0 }
      case '$size': { const s = evalExpr(doc, arg); return Array.isArray(s) ? s.length : 0 }
      case '$divide': return (a(0) as number) / (a(1) as number)
      case '$add': return (arg as unknown[]).reduce<number>((n, x) => n + (Number(evalExpr(doc, x)) || 0), 0)
      case '$isArray': return Array.isArray(evalExpr(doc, Array.isArray(arg) ? arg[0] : arg))
      default: throw new Error(`memory-mongo: unsupported expression ${op}`)
    }
  }
  return e
}

function runGroup(rows: Doc[], spec: Doc): Doc[] {
  const groups = new Map<string, { _id: unknown; rows: Doc[] }>()
  for (const r of rows) {
    const id = evalExpr(r, spec._id)
    const key = JSON.stringify(id ?? null)
    if (!groups.has(key)) groups.set(key, { _id: id ?? null, rows: [] })
    groups.get(key)!.rows.push(r)
  }
  return [...groups.values()].map((g) => {
    const out: Doc = { _id: g._id }
    for (const [field, acc] of Object.entries(spec)) {
      if (field === '_id') continue
      const [op, arg] = Object.entries(acc as Doc)[0]
      const vals = g.rows.map((r) => evalExpr(r, arg))
      const nums = vals.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
      switch (op) {
        case '$sum': out[field] = nums.reduce((s, n) => s + n, 0); break
        case '$avg': out[field] = nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : null; break
        case '$max': out[field] = vals.filter((v) => v != null).sort(cmp).pop() ?? null; break
        case '$min': out[field] = vals.filter((v) => v != null).sort(cmp)[0] ?? null; break
        case '$first': out[field] = vals[0] ?? null; break
        case '$push': out[field] = vals; break
        case '$addToSet': out[field] = [...new Set(vals.map((v) => JSON.stringify(v)))].map((s) => JSON.parse(s)); break
        default: throw new Error(`memory-mongo: unsupported accumulator ${op}`)
      }
    }
    return out
  })
}

function sortRows(rows: Doc[], sort: Doc | undefined, scores?: WeakMap<Doc, number>): Doc[] {
  if (!sort || !Object.keys(sort).length) return rows
  const keys = Object.entries(sort)
  return [...rows].sort((a, b) => {
    for (const [k, dir] of keys) {
      const isMeta = dir && typeof dir === 'object'
      const va = isMeta ? scores?.get(a) ?? 0 : getPath(a, k)
      const vb = isMeta ? scores?.get(b) ?? 0 : getPath(b, k)
      const c = cmp(va, vb) * (isMeta ? -1 : (dir as number))
      if (c) return c
    }
    return 0
  })
}

function project(doc: Doc, projection: Doc | undefined, score?: number): Doc {
  if (!projection || !Object.keys(projection).length) return clone(doc)
  const entries = Object.entries(projection)
  const meta = entries.filter(([, v]) => v && typeof v === 'object')
  const plain = entries.filter(([, v]) => !(v && typeof v === 'object'))
  const inclusive = plain.some(([k, v]) => k !== '_id' && (v === 1 || v === true))
  let out: Doc
  if (inclusive) {
    out = {}
    for (const [k, v] of plain) if (v === 1 || v === true) { const x = getPath(doc, k); if (x !== undefined) setPath(out, k, clone(x)) }
    if (projection._id !== 0 && doc._id !== undefined) out._id = doc._id
  } else {
    out = clone(doc)
    for (const [k, v] of plain) if (v === 0 || v === false) unsetPath(out, k)
  }
  for (const [k] of meta) out[k] = score ?? 0
  return out
}

// ─── Collection ──────────────────────────────────────────────────────────────

export class MemoryCursor {
  private sortSpec?: Doc
  private skipN = 0
  private limitN = 0
  constructor(private rows: () => Doc[], private projection: Doc | undefined, private scores: WeakMap<Doc, number>) {}
  sort(s: Doc) { this.sortSpec = s; return this }
  skip(n: number) { this.skipN = n; return this }
  limit(n: number) { this.limitN = n; return this }
  project(p: Doc) { this.projection = p; return this }
  private materialise(): Doc[] {
    let rows = sortRows(this.rows(), this.sortSpec, this.scores)
    if (this.skipN) rows = rows.slice(this.skipN)
    if (this.limitN) rows = rows.slice(0, this.limitN)
    return rows.map((r) => project(r, this.projection, this.scores.get(r)))
  }
  async toArray() { return this.materialise() }
  async next() { return this.materialise()[0] ?? null }
}

export class MemoryCollection {
  docs: Doc[] = []
  private textIndex: TextIndex | null = null
  private termCache = new WeakMap<Doc, Map<string, number>>()
  private scores = new WeakMap<Doc, number>()
  private uniques: string[][] = []

  private ctx(): MatchCtx {
    return { textScore: (d, s) => this.textScore(d, s), scores: this.scores }
  }

  private docTerms(doc: Doc): Map<string, number> {
    let m = this.termCache.get(doc)
    if (!m) {
      m = new Map()
      for (const [field, weight] of Object.entries(this.textIndex?.fields ?? {})) {
        const v = getPath(doc, field)
        const raw = Array.isArray(v) ? v.filter((x) => typeof x === 'string').join(' ') : typeof v === 'string' ? v : ''
        if (raw) fieldTermScores(raw, weight, m)
      }
      this.termCache.set(doc, m)
    }
    return m
  }

  textScore(doc: Doc, search: string): number {
    if (!this.textIndex) throw new Error('memory-mongo: text index required for $text query')
    const q = parseTextSearch(search)
    const terms = this.docTerms(doc)
    if ([...q.negated].some((t) => terms.has(t))) return 0
    if (q.phrases.length) {
      const hay = Object.keys(this.textIndex.fields).map((f) => String(getPath(doc, f) ?? '')).join('\n').toLowerCase()
      if (!q.phrases.every((p) => hay.includes(p))) return 0
    }
    let score = 0
    for (const t of q.terms) score += terms.get(t) ?? 0
    return score
  }

  private filterRows(filter: Doc = {}): Doc[] {
    const ctx = this.ctx()
    return this.docs.filter((d) => matches(d, filter, ctx))
  }

  private checkUnique(candidate: Doc, self?: Doc) {
    for (const keys of this.uniques) {
      const vals = keys.map((k) => getPath(candidate, k))
      if (vals.some((v) => v === undefined)) continue
      if (this.docs.some((d) => d !== self && keys.every((k, i) => getPath(d, k) === vals[i]))) {
        throw Object.assign(new Error('E11000 duplicate key'), { code: 11000 })
      }
    }
  }

  async createIndex(spec: Doc, opts: { unique?: boolean; weights?: Record<string, number>; name?: string } = {}) {
    const textFields = Object.entries(spec).filter(([, v]) => v === 'text').map(([k]) => k)
    if (textFields.length) {
      const fields = Object.fromEntries(textFields.map((f) => [f, opts.weights?.[f] ?? 1]))
      // Like MongoDB: one text index per collection; a different definition conflicts (code 85).
      if (this.textIndex && JSON.stringify(this.textIndex.fields) !== JSON.stringify(fields)) {
        throw Object.assign(new Error('Index with name already exists with different options'), { code: 85, codeName: 'IndexOptionsConflict' })
      }
      this.textIndex = { fields, name: opts.name }
      this.termCache = new WeakMap()
    } else if (opts.unique) {
      this.uniques.push(Object.keys(spec))
    }
    return 'ok'
  }
  async indexes() {
    return this.textIndex ? [{ name: this.textIndex.name ?? 'text', key: { _fts: 'text', _ftsx: 1 }, weights: { ...this.textIndex.fields } }] : []
  }
  async dropIndex(name: string) {
    if (!this.textIndex || (this.textIndex.name ?? 'text') !== name) throw Object.assign(new Error('index not found'), { code: 27, codeName: 'IndexNotFound' })
    this.textIndex = null
    this.termCache = new WeakMap()
  }
  /** Evaluation knob: re-weight the text index fields (what-if experiments). */
  setTextWeights(weights: Record<string, number>) {
    if (!this.textIndex) return
    this.textIndex = { fields: { ...this.textIndex.fields, ...weights } }
    this.termCache = new WeakMap()
  }
  get textWeights(): Record<string, number> | null {
    return this.textIndex ? { ...this.textIndex.fields } : null
  }
  listSearchIndexes() {
    return { toArray: async () => { throw new Error('memory-mongo: no Atlas Search') } }
  }
  async createSearchIndex() { throw new Error('memory-mongo: no Atlas Search') }

  find(filter: Doc = {}, opts: { projection?: Doc; sort?: Doc } = {}) {
    const c = new MemoryCursor(() => this.filterRows(filter), opts.projection, this.scores)
    if (opts.sort) c.sort(opts.sort)
    return c
  }
  async findOne(filter: Doc = {}, opts: { projection?: Doc; sort?: Doc } = {}) {
    return this.find(filter, opts).limit(1).next()
  }
  async countDocuments(filter: Doc = {}) { return this.filterRows(filter).length }
  async estimatedDocumentCount() { return this.docs.length }
  async distinct(field: string, filter: Doc = {}) {
    const out = new Set<unknown>()
    for (const d of this.filterRows(filter)) {
      const v = getPath(d, field)
      if (Array.isArray(v)) v.forEach((x) => out.add(x))
      else if (v !== undefined) out.add(v)
    }
    return [...out]
  }
  async insertOne(doc: Doc) {
    const d = clone(doc)
    this.checkUnique(d)
    this.docs.push(d)
    return { acknowledged: true, insertedId: d._id ?? d.id }
  }
  async insertMany(docs: Doc[]) {
    for (const d of docs) await this.insertOne(d)
    return { acknowledged: true, insertedCount: docs.length }
  }
  private replaceInPlace(target: Doc, next: Doc) {
    const i = this.docs.indexOf(target)
    if (i >= 0) this.docs[i] = next // new object → fresh text-term cache
  }
  async updateOne(filter: Doc, update: Doc, opts: { upsert?: boolean } = {}) {
    const doc = this.filterRows(filter)[0]
    if (doc) {
      const next = clone(doc)
      applyUpdate(next, update, false)
      this.checkUnique(next, doc)
      this.replaceInPlace(doc, next)
      return { acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedCount: 0 }
    }
    if (opts.upsert) {
      const fresh = seedFromFilter(filter)
      applyUpdate(fresh, update, true)
      this.checkUnique(fresh)
      this.docs.push(fresh)
      return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 1 }
    }
    return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0 }
  }
  async updateMany(filter: Doc, update: Doc) {
    const rows = this.filterRows(filter)
    for (const d of rows) { const next = clone(d); applyUpdate(next, update, false); this.replaceInPlace(d, next) }
    return { acknowledged: true, matchedCount: rows.length, modifiedCount: rows.length }
  }
  async replaceOne(filter: Doc, replacement: Doc, opts: { upsert?: boolean } = {}) {
    const doc = this.filterRows(filter)[0]
    if (doc) {
      const next = clone(replacement)
      this.checkUnique(next, doc)
      this.replaceInPlace(doc, next)
      return { acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedCount: 0 }
    }
    if (opts.upsert) { await this.insertOne(replacement); return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 1 } }
    return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0 }
  }
  async findOneAndUpdate(filter: Doc, update: Doc, opts: { sort?: Doc; returnDocument?: 'before' | 'after'; upsert?: boolean } = {}) {
    const doc = sortRows(this.filterRows(filter), opts.sort)[0]
    if (!doc) {
      if (!opts.upsert) return null
      await this.updateOne(filter, update, { upsert: true })
      return opts.returnDocument === 'after' ? clone(this.docs[this.docs.length - 1]) : null
    }
    const next = clone(doc)
    applyUpdate(next, update, false)
    this.replaceInPlace(doc, next)
    return clone(opts.returnDocument === 'after' ? next : doc)
  }
  async deleteMany(filter: Doc = {}) {
    const gone = new Set(this.filterRows(filter))
    this.docs = this.docs.filter((d) => !gone.has(d))
    return { acknowledged: true, deletedCount: gone.size }
  }
  async deleteOne(filter: Doc) {
    const doc = this.filterRows(filter)[0]
    if (doc) this.docs.splice(this.docs.indexOf(doc), 1)
    return { acknowledged: true, deletedCount: doc ? 1 : 0 }
  }
  async bulkWrite(ops: Doc[]) {
    let upserted = 0, modified = 0
    for (const op of ops) {
      const [kind, a] = Object.entries(op)[0] as [string, Doc]
      let r: Doc = {}
      if (kind === 'replaceOne') r = await this.replaceOne(a.filter, a.replacement, { upsert: a.upsert })
      else if (kind === 'updateOne') r = await this.updateOne(a.filter, a.update, { upsert: a.upsert })
      else if (kind === 'updateMany') r = await this.updateMany(a.filter, a.update)
      else if (kind === 'insertOne') r = await this.insertOne(a.document)
      else if (kind === 'deleteOne') r = await this.deleteOne(a.filter)
      else if (kind === 'deleteMany') r = await this.deleteMany(a.filter)
      else throw new Error(`memory-mongo: unsupported bulk op ${kind}`)
      upserted += r.upsertedCount ?? 0
      modified += r.modifiedCount ?? 0
    }
    return { acknowledged: true, upsertedCount: upserted, modifiedCount: modified }
  }
  aggregate<T = Doc>(pipeline: Doc[]) {
    const run = (): T[] => {
      let rows: Doc[] = this.docs
      for (const stage of pipeline) {
        const [op, arg] = Object.entries(stage)[0]
        if (op === '$match') { const ctx = this.ctx(); rows = rows.filter((d) => matches(d, arg, ctx)) }
        else if (op === '$group') rows = runGroup(rows, arg)
        else if (op === '$sort') rows = sortRows(rows, arg)
        else if (op === '$limit') rows = rows.slice(0, arg)
        else if (op === '$skip') rows = rows.slice(arg)
        else if (op === '$count') rows = [{ [arg]: rows.length }]
        else if (op === '$project') {
          rows = rows.map((d) => {
            const out: Doc = {}
            for (const [k, v] of Object.entries(arg as Doc)) {
              if (v === 0 || v === false) continue
              out[k] = v === 1 || v === true ? getPath(d, k) : evalExpr(d, v)
            }
            if ((arg as Doc)._id !== 0 && out._id === undefined && d._id !== undefined) out._id = d._id
            return out
          })
        } else throw new Error(`memory-mongo: unsupported stage ${op}`)
      }
      return clone(rows) as T[]
    }
    return { toArray: async () => run(), next: async () => run()[0] ?? null }
  }
}

export class MemoryDb {
  cols = new Map<string, MemoryCollection>()
  collection(name: string): MemoryCollection {
    if (!this.cols.has(name)) this.cols.set(name, new MemoryCollection())
    return this.cols.get(name)!
  }
  async command() { return { ok: 1 } }
}
