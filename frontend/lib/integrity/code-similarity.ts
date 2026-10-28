/**
 * Source-code similarity, MOSS-style (pure, client-safe, tested).
 *
 *  1. normalise: drop comments and whitespace; every identifier becomes `V`,
 *     every string `S`, every number `N`; keywords and operators stay. So
 *     renaming variables, reformatting or re-commenting changes nothing.
 *  2. fingerprints: hash every k-gram of tokens (FNV-1a) and keep the
 *     winnowed minimum of each window of w hashes (Schleimer et al. 2003) —
 *     any shared run of ≥ w + k − 1 tokens is guaranteed to be detected.
 *  3. compare: Dice overlap of the fingerprint sets, blended with a small
 *     "structure" score (cosine of control-flow skeleton bigrams — an AST-ish
 *     view that survives statement reordering inside blocks).
 *  4. starter code and fingerprints most submissions share are ignored.
 *
 * Pairs are found through an inverted index, so only submissions that share
 * at least one fingerprint are compared.
 */

export interface CodeSubmission {
  /** Submission id. */
  id: string
  /** Person or team; pairs from the same owner are skipped. */
  owner: string
  code: string
  language?: string
}

export interface SimilarPair {
  a: string
  b: string
  /** 0–1 blended similarity. */
  score: number
  /** Share of a's fingerprints found in b, and the reverse. */
  a_in_b: number
  b_in_a: number
  structure: number
  shared: number
}

export interface Cluster {
  members: string[]
  max_score: number
  pairs: SimilarPair[]
}

const KEYWORDS = new Set([
  // shared / C-family
  'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue', 'return', 'goto',
  'int', 'long', 'short', 'char', 'float', 'double', 'bool', 'boolean', 'void', 'unsigned', 'signed', 'const', 'static',
  'struct', 'class', 'interface', 'enum', 'new', 'delete', 'try', 'catch', 'finally', 'throw', 'throws',
  'public', 'private', 'protected', 'import', 'package', 'namespace', 'using', 'template', 'typename', 'auto',
  'true', 'false', 'null', 'this', 'super', 'extends', 'implements', 'final', 'abstract', 'virtual', 'override',
  'string', 'String', 'vector', 'map', 'set', 'include', 'define', 'sizeof', 'std', 'cout', 'cin', 'endl',
  // js / ts
  'function', 'var', 'let', 'async', 'await', 'yield', 'typeof', 'instanceof', 'undefined', 'of', 'in', 'export', 'from',
  // python
  'def', 'lambda', 'pass', 'elif', 'and', 'or', 'not', 'is', 'None', 'True', 'False', 'with', 'as', 'global', 'nonlocal', 'raise', 'except', 'print', 'range', 'len', 'self',
  // go / rust
  'func', 'go', 'chan', 'defer', 'select', 'type', 'fn', 'mut', 'impl', 'match', 'loop', 'pub', 'use', 'mod', 'trait', 'where',
])

/** Extra keywords for SQL answers only (they are ordinary identifiers elsewhere). */
const SQL_KEYWORDS = new Set([
  'select', 'from', 'where', 'join', 'left', 'right', 'inner', 'outer', 'group', 'by', 'order', 'having', 'limit', 'union', 'insert', 'update',
  'values', 'distinct', 'count', 'sum', 'avg', 'min', 'max', 'on', 'as', 'and', 'or', 'not', 'in', 'is', 'null', 'like', 'between', 'case', 'when', 'then', 'else', 'end',
])

const CONTROL = new Set(['if', 'else', 'elif', 'for', 'while', 'do', 'switch', 'case', 'return', 'break', 'continue', 'try', 'catch', 'except', 'def', 'function', 'func', 'fn', 'class', 'lambda', 'yield', 'match', 'loop', '{', '}'])

const HASH_LANGS = /^(py|python|python3|rb|ruby|r|sh|bash|perl|pl)$/i

/** Remove comments (C-style, `#`, `--` for SQL) while keeping string literals intact. */
export function stripComments(code: string, language = ''): string {
  const hash = HASH_LANGS.test(language) || (!language && /^\s*(def |import |from \S+ import )/m.test(code))
  const sql = /^(sql|mysql|postgres|postgresql|sqlite|plsql|tsql)$/i.test(language)
  let out = ''
  let i = 0
  const n = code.length
  while (i < n) {
    const c = code[i]
    const d = code[i + 1]
    // strings (keep; tokenizer turns them into S)
    if (c === '"' || c === "'" || c === '`') {
      // python triple quotes
      if (hash && code.startsWith(c.repeat(3), i)) {
        const end = code.indexOf(c.repeat(3), i + 3)
        const stop = end < 0 ? n : end + 3
        out += code.slice(i, stop)
        i = stop
        continue
      }
      let j = i + 1
      while (j < n && code[j] !== c && code[j] !== '\n') j += code[j] === '\\' ? 2 : 1
      out += code.slice(i, Math.min(n, j + 1))
      i = j + 1
      continue
    }
    if (!hash && c === '/' && d === '/') { while (i < n && code[i] !== '\n') i++; continue }
    if (!hash && c === '/' && d === '*') { const e = code.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; out += ' '; continue }
    if (hash && c === '#') { while (i < n && code[i] !== '\n') i++; continue }
    if (sql && c === '-' && d === '-') { while (i < n && code[i] !== '\n') i++; continue }
    out += c
    i++
  }
  return out
}

const TOKEN_RE = /[A-Za-z_$][A-Za-z0-9_$]*|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|"(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?|`[^`]*`?|"""[\s\S]*?"""|'''[\s\S]*?'''|==|!=|<=|>=|&&|\|\||\+\+|--|->|=>|::|\+=|-=|\*=|\/=|<<|>>|[{}()[\];,.:<>+\-*/%=!&|^~?@]/g

/** Normalised token stream of a piece of code. */
export function normalizeTokens(code: string, language = ''): string[] {
  const src = stripComments(String(code ?? ''), language)
  const sql = /^(sql|mysql|postgres|postgresql|sqlite|plsql|tsql)$/i.test(language)
  const out: string[] = []
  for (const m of src.matchAll(TOKEN_RE)) {
    const t = m[0]
    const ch = t[0]
    if (ch === '"' || ch === "'" || ch === '`') out.push('S')
    else if (/\d/.test(ch)) out.push('N')
    else if (/[A-Za-z_$]/.test(ch)) {
      const key = sql ? t.toLowerCase() : t
      out.push((sql ? SQL_KEYWORDS.has(key) || KEYWORDS.has(key) : KEYWORDS.has(key)) ? key : 'V')
    } else if (ch === ';' || ch === ',') continue // punctuation noise (optional semicolons, trailing commas)
    else out.push(t)
  }
  return out
}

function fnv1a(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Winnowed fingerprints of a token stream (set of hashes). */
export function fingerprints(tokens: readonly string[], k = 5, w = 4): Set<number> {
  const out = new Set<number>()
  if (tokens.length < k) {
    if (tokens.length) out.add(fnv1a(tokens.join(' ')))
    return out
  }
  const hashes: number[] = []
  for (let i = 0; i + k <= tokens.length; i++) hashes.push(fnv1a(tokens.slice(i, i + k).join(' ')))
  if (hashes.length <= w) {
    out.add(Math.min(...hashes))
    return out
  }
  let lastPos = -1
  for (let i = 0; i + w <= hashes.length; i++) {
    let minPos = i
    for (let j = i; j < i + w; j++) if (hashes[j] <= hashes[minPos]) minPos = j // rightmost minimum
    if (minPos !== lastPos) {
      out.add(hashes[minPos])
      lastPos = minPos
    }
  }
  return out
}

/** Control-flow skeleton bigram counts (AST-ish structure). */
export function structureProfile(tokens: readonly string[]): Map<string, number> {
  const skel = tokens.filter((t) => CONTROL.has(t))
  const m = new Map<string, number>()
  for (let i = 0; i + 1 < skel.length; i++) {
    const key = `${skel[i]} ${skel[i + 1]}`
    m.set(key, (m.get(key) ?? 0) + 1)
  }
  return m
}

export function cosine(a: Map<string, number>, b: Map<string, number>): number {
  if (!a.size || !b.size) return 0
  let dot = 0, na = 0, nb = 0
  for (const [k, v] of a) { na += v * v; const bv = b.get(k); if (bv) dot += v * bv }
  for (const v of b.values()) nb += v * v
  return na && nb ? dot / Math.sqrt(na * nb) : 0
}

export interface PreparedCode {
  id: string
  owner: string
  tokens: number
  prints: Set<number>
  structure: Map<string, number>
}

export function prepare(sub: CodeSubmission, opts: { k?: number; w?: number; ignore?: Set<number> } = {}): PreparedCode {
  const tokens = normalizeTokens(sub.code, sub.language)
  const prints = fingerprints(tokens, opts.k, opts.w)
  if (opts.ignore) for (const h of opts.ignore) prints.delete(h)
  return { id: sub.id, owner: sub.owner, tokens: tokens.length, prints, structure: structureProfile(tokens) }
}

/** Similarity of two prepared submissions. */
export function comparePrepared(a: PreparedCode, b: PreparedCode): SimilarPair {
  let shared = 0
  const [small, big] = a.prints.size <= b.prints.size ? [a.prints, b.prints] : [b.prints, a.prints]
  for (const h of small) if (big.has(h)) shared++
  const dice = a.prints.size + b.prints.size ? (2 * shared) / (a.prints.size + b.prints.size) : 0
  const structure = cosine(a.structure, b.structure)
  const hasStructure = a.structure.size > 0 && b.structure.size > 0
  const score = hasStructure ? 0.85 * dice + 0.15 * structure : dice
  const r = (x: number) => Math.round(x * 1000) / 1000
  return {
    a: a.id, b: b.id, score: r(score),
    a_in_b: r(a.prints.size ? shared / a.prints.size : 0),
    b_in_a: r(b.prints.size ? shared / b.prints.size : 0),
    structure: r(structure), shared,
  }
}

/** Similarity of two raw pieces of code (convenience for tests and the diff view). */
export function codeSimilarity(a: string, b: string, language = ''): number {
  return comparePrepared(prepare({ id: 'a', owner: 'a', code: a, language }), prepare({ id: 'b', owner: 'b', code: b, language })).score
}

export interface PairwiseOptions {
  threshold?: number
  /** Skip submissions with fewer normalised tokens than this. */
  minTokens?: number
  /** Starter / template code whose fingerprints never count. */
  starterCode?: string[]
  /** Fingerprints in more than this share of submissions are boilerplate (only with ≥ 6 submissions). */
  commonShare?: number
  k?: number
  w?: number
  /** Hard cap on submissions considered (largest first are kept). */
  maxSubmissions?: number
}

/** All pairs at or above `threshold` among submissions of ONE question / task. */
export function pairwiseSimilarity(subs: readonly CodeSubmission[], opts: PairwiseOptions = {}): SimilarPair[] {
  const threshold = opts.threshold ?? 0.6
  const minTokens = opts.minTokens ?? 25
  const ignore = new Set<number>()
  for (const s of opts.starterCode ?? []) for (const h of fingerprints(normalizeTokens(s), opts.k, opts.w)) ignore.add(h)
  let prepared = subs.map((s) => prepare(s, { k: opts.k, w: opts.w, ignore })).filter((p) => p.tokens >= minTokens && p.prints.size > 0)
  if (opts.maxSubmissions && prepared.length > opts.maxSubmissions) prepared = prepared.sort((x, y) => y.tokens - x.tokens).slice(0, opts.maxSubmissions)

  // Inverted index hash → submissions; drop boilerplate everyone shares.
  const index = new Map<number, number[]>()
  prepared.forEach((p, i) => { for (const h of p.prints) { const l = index.get(h); if (l) l.push(i); else index.set(h, [i]) } })
  const commonLimit = prepared.length >= 6 ? Math.ceil(prepared.length * (opts.commonShare ?? 0.5)) : Infinity
  const common = new Set<number>()
  for (const [h, l] of index) if (l.length > commonLimit) common.add(h)
  if (common.size) prepared = prepared.map((p) => ({ ...p, prints: new Set([...p.prints].filter((h) => !common.has(h))) }))

  const candidates = new Set<string>()
  for (const [h, l] of index) {
    if (common.has(h) || l.length < 2) continue
    for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) candidates.add(`${l[i]}:${l[j]}`)
  }
  const pairs: SimilarPair[] = []
  for (const key of candidates) {
    const [i, j] = key.split(':').map(Number)
    const a = prepared[i], b = prepared[j]
    if (a.owner === b.owner) continue
    const p = comparePrepared(a, b)
    if (p.score >= threshold) pairs.push(p)
  }
  return pairs.sort((x, y) => y.score - x.score)
}

/** Group pairs into clusters (connected components), strongest first. */
export function clusterPairs(pairs: readonly SimilarPair[]): Cluster[] {
  const parent = new Map<string, string>()
  const find = (x: string): string => {
    let r = x
    while (parent.get(r) !== r) r = parent.get(r) as string
    let c = x
    while (parent.get(c) !== r) { const n = parent.get(c) as string; parent.set(c, r); c = n }
    return r
  }
  for (const p of pairs) {
    if (!parent.has(p.a)) parent.set(p.a, p.a)
    if (!parent.has(p.b)) parent.set(p.b, p.b)
    const ra = find(p.a), rb = find(p.b)
    if (ra !== rb) parent.set(ra, rb)
  }
  const groups = new Map<string, Cluster>()
  for (const p of pairs) {
    const root = find(p.a)
    const g = groups.get(root) ?? { members: [], max_score: 0, pairs: [] }
    for (const m of [p.a, p.b]) if (!g.members.includes(m)) g.members.push(m)
    g.pairs.push(p)
    g.max_score = Math.max(g.max_score, p.score)
    groups.set(root, g)
  }
  return [...groups.values()].sort((x, y) => y.max_score - x.max_score || y.members.length - x.members.length)
}

export interface DiffRow {
  left: { no: number; text: string } | null
  right: { no: number; text: string } | null
  /** Lines equal after whitespace normalisation. */
  same: boolean
}

const normLine = (s: string) => s.replace(/\s+/g, ' ').trim()

/** Side-by-side line diff (LCS on whitespace-normalised lines). Capped at `maxLines` per side. */
export function sideBySideDiff(a: string, b: string, maxLines = 800): DiffRow[] {
  const A = String(a ?? '').split('\n').slice(0, maxLines)
  const B = String(b ?? '').split('\n').slice(0, maxLines)
  const na = A.map(normLine), nb = B.map(normLine)
  const m = A.length, n = B.length
  // LCS lengths, rows of Uint16 to keep memory small.
  const L: Uint16Array[] = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1))
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) {
    L[i][j] = na[i] === nb[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1])
  }
  const rows: DiffRow[] = []
  let i = 0, j = 0
  while (i < m || j < n) {
    if (i < m && j < n && na[i] === nb[j]) {
      rows.push({ left: { no: i + 1, text: A[i] }, right: { no: j + 1, text: B[j] }, same: true }); i++; j++
    } else if (j < n && (i >= m || L[i][j + 1] >= L[i + 1][j])) {
      rows.push({ left: null, right: { no: j + 1, text: B[j] }, same: false }); j++
    } else {
      rows.push({ left: { no: i + 1, text: A[i] }, right: null, same: false }); i++
    }
  }
  return rows
}
