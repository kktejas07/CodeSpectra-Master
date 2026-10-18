/**
 * Minimal in-memory MongoDB stand-in for billing tests: the filter / update
 * operators the billing code uses ($in, $gt, $lte, $exists, $ne, $or, $set,
 * $unset, $setOnInsert, $addToSet, $pull, $inc, upsert, sort).
 */
type Doc = Record<string, any>

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

function matchValue(v: any, cond: any): boolean {
  if (cond && typeof cond === 'object' && !Array.isArray(cond) && Object.keys(cond).some((k) => k.startsWith('$'))) {
    return Object.entries(cond).every(([op, arg]) => {
      switch (op) {
        case '$in': return (arg as any[]).some((a) => (Array.isArray(v) ? v.includes(a) : v === a))
        case '$ne': return Array.isArray(v) ? !v.includes(arg) : v !== arg
        case '$gt': return v !== undefined && v > (arg as any)
        case '$gte': return v !== undefined && v >= (arg as any)
        case '$lt': return v !== undefined && v < (arg as any)
        case '$lte': return v !== undefined && v <= (arg as any)
        case '$exists': return (v !== undefined) === arg
        default: throw new Error(`fake-mongo: unsupported operator ${op}`)
      }
    })
  }
  if (Array.isArray(v) && !Array.isArray(cond)) return v.includes(cond)
  return v === cond
}

export function matches(doc: Doc, filter: Doc): boolean {
  return Object.entries(filter || {}).every(([k, cond]) => {
    if (k === '$or') return (cond as Doc[]).some((f) => matches(doc, f))
    if (k === '$and') return (cond as Doc[]).every((f) => matches(doc, f))
    return matchValue(get(doc, k), cond)
  })
}

function applyUpdate(doc: Doc, update: Doc, inserting: boolean) {
  for (const [op, fields] of Object.entries(update)) {
    for (const [path, val] of Object.entries(fields as Doc)) {
      switch (op) {
        case '$set': set(doc, path, val); break
        case '$unset': unset(doc, path); break
        case '$setOnInsert': if (inserting) set(doc, path, val); break
        case '$inc': set(doc, path, (get(doc, path) || 0) + (val as number)); break
        case '$addToSet': { const a = get(doc, path) || []; if (!a.includes(val)) a.push(val); set(doc, path, a); break }
        case '$push': { const a = get(doc, path) || []; a.push(val); set(doc, path, a); break }
        case '$pull': { const a = get(doc, path); if (Array.isArray(a)) set(doc, path, a.filter((x: any) => x !== val)); break }
        default: throw new Error(`fake-mongo: unsupported update ${op}`)
      }
    }
  }
}

function sortDocs(docs: Doc[], sort?: Doc): Doc[] {
  if (!sort) return docs
  const [[key, dir]] = Object.entries(sort)
  return [...docs].sort((a, b) => ((get(a, key) ?? '') < (get(b, key) ?? '') ? -1 : 1) * (dir as number))
}

const clone = <T,>(v: T): T => (v == null ? v : JSON.parse(JSON.stringify(v)))

export class FakeCollection {
  docs: Doc[] = []
  unique: string[] = []

  private checkUnique(candidate: Doc, self?: Doc) {
    for (const key of this.unique) {
      const v = get(candidate, key)
      if (v === undefined || v === '') continue
      if (this.docs.some((d) => d !== self && get(d, key) === v)) {
        throw Object.assign(new Error('E11000 duplicate key'), { code: 11000 })
      }
    }
  }

  async createIndex(spec: Doc, opts?: { unique?: boolean }) {
    if (opts?.unique) this.unique.push(Object.keys(spec)[0])
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
      toArray: async () => clone(rows),
    }
    return cursor
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
  async updateOne(filter: Doc, update: Doc, opts: { upsert?: boolean } = {}) {
    const doc = this.docs.find((d) => matches(d, filter))
    if (doc) {
      const next = clone(doc)
      applyUpdate(next, update, false)
      this.checkUnique(next, doc)
      Object.keys(doc).forEach((k) => delete doc[k])
      Object.assign(doc, next)
      return { matchedCount: 1, modifiedCount: 1, upsertedCount: 0 }
    }
    if (opts.upsert) {
      const fresh: Doc = {}
      for (const [k, v] of Object.entries(filter)) if (!k.startsWith('$') && (typeof v !== 'object' || v === null)) set(fresh, k, v)
      applyUpdate(fresh, update, true)
      this.checkUnique(fresh)
      this.docs.push(fresh)
      return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 }
    }
    return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 }
  }
  async updateMany(filter: Doc, update: Doc) {
    const rows = this.docs.filter((d) => matches(d, filter))
    rows.forEach((d) => applyUpdate(d, update, false))
    return { matchedCount: rows.length, modifiedCount: rows.length }
  }
  async findOneAndUpdate(filter: Doc, update: Doc, opts: { sort?: Doc } = {}) {
    const doc = sortDocs(this.docs.filter((d) => matches(d, filter)), opts.sort)[0]
    if (!doc) return null
    applyUpdate(doc, update, false)
    return clone(doc)
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
