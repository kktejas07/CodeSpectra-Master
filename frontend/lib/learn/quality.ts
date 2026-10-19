/**
 * Cheap quality checks for generated posts (pure): code-block syntax where it
 * costs nothing, a complexity-table sanity check, a verbatim-copy check
 * against the reference pages, source vetting against the allowlist, and the
 * resulting 0–100 score. Flags are shown to the reviewing admin.
 */
import type { GeneratedPost } from './schema'

/**
 * JavaScript: compile (never run) the code with the engine's own parser.
 * `new Function` only parses the body until it is called — we never call it.
 * Module syntax (import/export lines) is stripped first. Returns an error or null.
 */
export function checkJsSyntax(code: string): string | null {
  const body = code
    .split('\n')
    .map((l) => (/^\s*(import\s.+from\s|import\s+['"]|export\s+(default\s+)?)/.test(l) ? l.replace(/^\s*export\s+(default\s+)?/, '').replace(/^\s*import\s.*$/, '') : l))
    .join('\n')
  try {
    const AsyncFunction = Object.getPrototypeOf(async function () { /* noop */ }).constructor as FunctionConstructor
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    new AsyncFunction(body)
    return null
  } catch (e) {
    return e instanceof SyntaxError ? e.message.slice(0, 200) : null
  }
}

/** Bracket balance ignoring strings and comments (Java, C++, TypeScript, Python). */
export function checkBrackets(code: string, lang: string): string | null {
  const pairs: Record<string, string> = { ')': '(', ']': '[', '}': '{' }
  const stack: string[] = []
  const hashComments = lang === 'python'
  for (let i = 0; i < code.length; i++) {
    const c = code[i]
    const n = code[i + 1]
    if (!hashComments && c === '/' && n === '/') { while (i < code.length && code[i] !== '\n') i++; continue }
    if (!hashComments && c === '/' && n === '*') { i += 2; while (i < code.length && !(code[i] === '*' && code[i + 1] === '/')) i++; i++; continue }
    if (hashComments && c === '#') { while (i < code.length && code[i] !== '\n') i++; continue }
    if (c === '"' || c === "'" || c === '`') {
      const q = c
      // Python triple quotes
      if (hashComments && code.slice(i, i + 3) === q.repeat(3)) {
        const end = code.indexOf(q.repeat(3), i + 3)
        i = end < 0 ? code.length : end + 2
        continue
      }
      i++
      while (i < code.length && code[i] !== q) {
        if (code[i] === '\\') i++
        if (code[i] === '\n' && q !== '`') break
        i++
      }
      continue
    }
    if (c === '(' || c === '[' || c === '{') stack.push(c)
    else if (c === ')' || c === ']' || c === '}') {
      if (stack.pop() !== pairs[c]) return `unbalanced "${c}"`
    }
  }
  return stack.length ? `unclosed "${stack[stack.length - 1]}"` : null
}

export function checkCodeExamples(examples: GeneratedPost['sections']['code_examples']): string[] {
  const flags: string[] = []
  for (const ex of examples) {
    const err = ex.language === 'javascript' ? checkJsSyntax(ex.code) : ['python', 'java', 'cpp', 'typescript'].includes(ex.language) ? checkBrackets(ex.code, ex.language) : null
    if (err) flags.push(`code:${ex.language}:${err}`)
  }
  return flags
}

const normO = (s: string) => s.toLowerCase().replace(/\s+/g, '').replace(/[θΘΩω]/g, 'o').replace(/\*/g, '').replace(/\^/g, '')

/** Known complexities: when a topic title matches, the table must mention the expected bound. */
const EXPECTED: Array<{ re: RegExp; any: string[] }> = [
  { re: /binary search(?! tree)/i, any: ['o(logn)'] },
  { re: /merge sort/i, any: ['o(nlogn)'] },
  { re: /quick ?sort/i, any: ['o(nlogn)', 'o(n2)'] },
  { re: /heap ?sort/i, any: ['o(nlogn)'] },
  { re: /bubble|insertion sort|selection sort/i, any: ['o(n2)'] },
  { re: /breadth-first|\bbfs\b|depth-first|\bdfs\b/i, any: ['o(v+e)', 'o(n+m)', 'o(e+v)'] },
  { re: /dijkstra/i, any: ['o((v+e)logv)', 'o(elogv)', 'o((e+v)logv)', 'o(v2)', 'o(e+vlogv)', 'o(mlogn)'] },
  { re: /floyd/i, any: ['o(v3)', 'o(n3)'] },
  { re: /bellman/i, any: ['o(ve)', 'o(ev)', 'o(nm)', 'o(v·e)'] },
  { re: /linear search/i, any: ['o(n)'] },
  { re: /hash (table|map)/i, any: ['o(1)'] },
  { re: /topological/i, any: ['o(v+e)', 'o(n+m)', 'o(e+v)'] },
]

/** Flags when every time cell is not O/Θ/Ω notation, or a known bound is missing. */
export function checkComplexity(title: string, c: GeneratedPost['sections']['complexity']): string[] {
  if (!c || !c.rows.length) return []
  const flags: string[] = []
  const notation = /^[OΘΩθω]\s*\(.+\)/
  const bad = c.rows.filter((r) => !notation.test(r.time.trim()) && !/n\/a|not applicable/i.test(r.time))
  if (bad.length) flags.push(`complexity:not-big-o(${bad.map((r) => r.case).join(',').slice(0, 80)})`)
  const cells = c.rows.map((r) => normO(r.time)).join(' ')
  for (const e of EXPECTED) {
    if (e.re.test(title) && !e.any.some((x) => cells.includes(x))) {
      flags.push(`complexity:expected-${e.any[0]}`)
      break
    }
  }
  return flags
}

function words(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean)
}

/**
 * Number of 12-word runs in `output` that also appear verbatim in a reference
 * text. Posts must be original: any hit is flagged for the reviewer.
 */
export function verbatimOverlap(output: string, references: readonly string[], n = 12): number {
  if (!references.length) return 0
  const refShingles = new Set<string>()
  for (const r of references) {
    const w = words(r)
    for (let i = 0; i + n <= w.length; i++) refShingles.add(w.slice(i, i + n).join(' '))
  }
  const w = words(output)
  let hits = 0
  for (let i = 0; i + n <= w.length; i++) if (refShingles.has(w.slice(i, i + n).join(' '))) hits++
  return hits
}

/** True when `host` is an allowlisted domain or a subdomain of one. */
export function hostAllowed(host: string, domains: readonly string[]): boolean {
  const h = host.toLowerCase().replace(/^www\./, '')
  return domains.some((d) => {
    const dd = d.toLowerCase().replace(/^www\./, '')
    return h === dd || h.endsWith(`.${dd}`)
  })
}

/**
 * Keep only citations the bot could have learned from: https URLs on an
 * allowlisted domain (or pages we actually fetched). Others are dropped
 * (LLM-invented links are a real risk). Dedupes by URL.
 */
export function vetSources(cited: ReadonlyArray<{ title: string; url: string }>, allowDomains: readonly string[], fetched: ReadonlyArray<{ title: string; url: string }> = []): { kept: Array<{ title: string; url: string }>; dropped: string[] } {
  const kept: Array<{ title: string; url: string }> = []
  const dropped: string[] = []
  const seen = new Set<string>()
  const fetchedSet = new Set(fetched.map((f) => f.url))
  for (const c of [...fetched, ...cited]) {
    let u: URL
    try { u = new URL(c.url) } catch { dropped.push(c.url); continue }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') { dropped.push(c.url); continue }
    u.hash = ''
    const key = u.toString()
    if (seen.has(key)) continue
    if (!fetchedSet.has(c.url) && !hostAllowed(u.hostname, allowDomains)) { dropped.push(c.url); continue }
    seen.add(key)
    kept.push({ title: c.title.trim().slice(0, 200) || u.hostname, url: key })
  }
  return { kept: kept.slice(0, 10), dropped }
}

/** Is this link target allowed inside generated prose? Site-relative paths, or https on an allowlisted domain. */
export function proseLinkAllowed(url: string, allowDomains: readonly string[]): boolean {
  const u = url.trim()
  if (/^\/(?!\/)/.test(u)) return true // same-site path (not protocol-relative //host)
  if (/^#[\w-]*$/.test(u)) return true
  try {
    const p = new URL(u)
    return p.protocol === 'https:' && !p.username && !p.password && hostAllowed(p.hostname, allowDomains)
  } catch {
    return false
  }
}

/**
 * Vet links INSIDE generated prose (markdown links, <autolinks> and bare URLs). Links outside the
 * allowlist are unlinked (the text stays, the URL goes); bare / autolinked off-list URLs are
 * replaced by their host name. Inline `code` spans are left alone. Returns the number removed.
 */
export function vetProseLinks(md: string, allowDomains: readonly string[]): { text: string; dropped: number } {
  let dropped = 0
  // A plain host name (no www. — GFM would autolink that again).
  const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./i, '') } catch { return 'link removed' } }
  const parts = String(md || '').split(/(`[^`\n]*`)/)
  const out = parts.map((seg, i) => {
    if (i % 2 === 1) return seg // inline code
    let s = seg.replace(/(!?)\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g, (m, _bang: string, text: string, url: string) => {
      if (proseLinkAllowed(url, allowDomains)) return m
      dropped++
      return text // links and images: keep only the label
    })
    s = s.replace(/<((?:https?|ftp|mailto|javascript|data):[^>\s]+)>/gi, (m, url: string) => {
      if (proseLinkAllowed(url, allowDomains)) return m
      dropped++
      return host(url)
    })
    s = s.replace(/(^|[^\w(<"'=\]])((?:https?:\/\/|www\.)[^\s<>()\]]+)/gi, (m, pre: string, url: string) => {
      const full = url.startsWith('www.') ? `https://${url}` : url
      if (proseLinkAllowed(full.replace(/[.,;:!?]+$/, ''), allowDomains)) return m
      dropped++
      return `${pre}${host(full)}`
    })
    return s
  })
  return { text: out.join(''), dropped }
}

/** 0–100. Starts at 100; each flag costs points by kind. */
export function qualityScore(flags: readonly string[]): number {
  let score = 100
  for (const f of flags) {
    if (f.startsWith('code:missing-languages')) score -= 5
    else if (f.startsWith('code:')) score -= 12
    else if (f.startsWith('complexity:')) score -= 10
    else if (f.startsWith('copy:')) score -= 25
    else if (f.startsWith('sources:dropped')) score -= 3
    else if (f.startsWith('sources:none')) score -= 8
    else if (f.startsWith('research:injection')) score -= 5
    else if (f.startsWith('length:')) score -= 8
    else score -= 4
  }
  return Math.max(0, Math.min(100, score))
}
