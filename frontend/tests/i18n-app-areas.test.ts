/**
 * Signed-in app areas (lib/i18n/areas.ts, + the bundled `exam` namespace):
 * - catalogs complete in Hindi / Telugu, same {placeholders}, real script;
 * - every page only uses area namespaces its layouts load (else it would show keys);
 * - no new hard-coded English in JSX (heuristic scan + explicit allow-list).
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { AREA_NAMESPACES, APP_NAMESPACES } from '@/lib/i18n/areas'
import { APP_INTENTIONALLY_ENGLISH } from '@/lib/i18n/app-untranslated'
import { INTENTIONALLY_ENGLISH } from '@/lib/i18n/untranslated'
import { hardCodedText, listFiles, ROOT } from './i18n-jsx-scan'

const DIR = path.join(ROOT, 'lib/i18n/messages')
const load = (l: string, ns: string): Record<string, string> => JSON.parse(fs.readFileSync(path.join(DIR, l, `${ns}.json`), 'utf8'))
const slots = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
const SCRIPT = { hi: /[ऀ-ॿ]/, te: /[ఀ-౿]/ } as const
const allowedEnglish = (k: string) => APP_INTENTIONALLY_ENGLISH.has(k) || INTENTIONALLY_ENGLISH.has(k)

describe('app area catalogs', () => {
  for (const ns of APP_NAMESPACES) {
    for (const locale of ['hi', 'te'] as const) {
      it(`${locale}/${ns}: complete, same placeholders, translated`, () => {
        const en = load('en', ns)
        const tr = load(locale, ns)
        expect(Object.keys(en).filter((k) => !(k in tr)), 'missing').toEqual([])
        expect(Object.keys(tr).filter((k) => !(k in en)), 'extra').toEqual([])
        for (const [k, v] of Object.entries(tr)) {
          expect(slots(v), `${ns}.${k}`).toEqual(slots(en[k]))
          expect(v.trim().length, `${ns}.${k} empty`).toBeGreaterThan(0)
          if (allowedEnglish(`${ns}.${k}`)) continue
          expect(v === en[k] && /[A-Za-z]{3}/.test(v), `${ns}.${k} copied from English`).toBe(false)
          if (/[A-Za-z]{2}/.test(en[k]) && !/^[A-Z0-9 /&+().:-]+$/.test(en[k].replace(/\{\w+\}/g, ''))) {
            expect(SCRIPT[locale].test(v), `${ns}.${k} has no ${locale} script: "${v}"`).toBe(true)
          }
        }
      })
    }
    it(`en/${ns}: plural pairs complete`, () => {
      const en = load('en', ns)
      for (const k of Object.keys(en)) if (k.endsWith('_one')) expect(en[`${k.slice(0, -4)}_other`], `${ns}.${k}`).toBeDefined()
    })
  }

  it('allow-list only names existing keys', () => {
    for (const k of APP_INTENTIONALLY_ENGLISH) {
      const [ns, key] = [k.slice(0, k.indexOf('.')), k.slice(k.indexOf('.') + 1)]
      expect(key in load('en', ns), k).toBe(true)
    }
  })
})

// ---- namespace provision: page closure ⊆ namespaces its layouts load ----
const AREAS = new Set<string>(AREA_NAMESPACES)
const EXTS = ['', '.tsx', '.ts', '/index.tsx', '/index.ts']
function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? path.join(ROOT, spec.slice(2)) : spec.startsWith('.') ? path.resolve(path.dirname(from), spec) : null
  if (!base) return null
  for (const e of EXTS) if (fs.existsSync(base + e) && fs.statSync(base + e).isFile()) return base + e
  return null
}
const areaKeys = new Map<string, Set<string>>()
function hasKey(ns: string, key: string): boolean {
  if (!areaKeys.has(ns)) areaKeys.set(ns, new Set(Object.keys(load('en', ns)).map((k) => k.replace(/_(zero|one|two|few|many|other)$/, ''))))
  return areaKeys.get(ns)!.has(key)
}
const info = new Map<string, { imports: string[]; ns: Set<string> }>()
function fileInfo(f: string) {
  let i = info.get(f)
  if (i) return i
  const src = fs.readFileSync(f, 'utf8')
  const specs = [...src.matchAll(/(?:import|export)\s+(?!type\b)[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1] || m[2])
  // Server components translate through getAreaI18n (all areas), so they need no provider.
  // Only files translating with the shared client translator; emails and admin pages use their own scoped `t`.
  const serverOnly = /getAreaI18n/.test(src) || !/from '@\/lib\/i18n\/client'/.test(src)
  // Only keys that exist in an area catalog: other features have their own scoped `t` (emails, admin).
  const ns = new Set(serverOnly ? [] : [...src.matchAll(/\b(?:t|tr|tt)\(\s*['`](\w+)\.([\w:]+)/g)].filter((m) => AREAS.has(m[1]) && hasKey(m[1], m[2])).map((m) => m[1]))
  i = { imports: specs.map((s) => resolveImport(f, s)).filter((x): x is string => !!x), ns }
  info.set(f, i)
  return i
}
function closure(f: string): Set<string> {
  const seen = new Set<string>()
  const ns = new Set<string>()
  const stack = [f]
  while (stack.length) {
    const x = stack.pop()!
    if (seen.has(x)) continue
    seen.add(x)
    const i = fileInfo(x)
    i.ns.forEach((n) => ns.add(n))
    stack.push(...i.imports)
  }
  return ns
}
function provided(page: string): Set<string> {
  const out = new Set<string>()
  for (let d = path.dirname(page); d.startsWith(path.join(ROOT, 'app')); d = path.dirname(d)) {
    const lay = path.join(d, 'layout.tsx')
    if (!fs.existsSync(lay)) continue
    const src = fs.readFileSync(lay, 'utf8')
    for (const m of src.matchAll(/(?:AreaI18n ns|areas)=\{\[([^\]]*)\]\}/g)) for (const n of m[1].matchAll(/'(\w+)'/g)) out.add(n[1])
  }
  return out
}
function routeFiles(d: string, out: string[] = []): string[] {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f)
    if (fs.statSync(p).isDirectory()) { if (f !== 'api') routeFiles(p, out) } else if (/^(page|layout|template|error|loading|not-found|default)\.tsx$/.test(f)) out.push(p)
  }
  return out
}

describe('area catalogs are loaded where they are used', () => {
  it('every route only uses namespaces provided by its layouts', () => {
    const problems: string[] = []
    for (const f of routeFiles(path.join(ROOT, 'app'))) {
      const have = provided(f)
      const missing = [...closure(f)].filter((n) => !have.has(n))
      if (missing.length) problems.push(`${path.relative(ROOT, f)}: ${missing.join(', ')}`)
    }
    expect(problems).toEqual([])
  })
})

// ---- hard-coded JSX text ----
type Allow = Record<string, { why: string; text: string[] } | string>
const ALLOW = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/i18n-jsx-allowlist.json'), 'utf8')) as Allow

describe('no new hard-coded English in signed-in app JSX', () => {
  const files = listFiles()
  it('scans a sensible number of files', () => {
    expect(files.length).toBeGreaterThan(150)
  })
  it('every JSX text / text prop goes through t() or is allow-listed', () => {
    const problems: string[] = []
    for (const f of files) {
      const entry = ALLOW[f]
      const allowed = new Set(typeof entry === 'object' ? entry.text : [])
      for (const s of hardCodedText(f)) if (!allowed.has(s)) problems.push(`${f}: ${JSON.stringify(s)}`)
    }
    expect(problems, 'wrap these in t() (add keys to the area catalog) or allow-list them with a reason').toEqual([])
  })
  it('allow-list only shrinks (SEO-038)', () => {
    // Was 208 strings; lower this cap whenever entries are translated, never raise it.
    const total = Object.entries(ALLOW).reduce((n, [f, e]) => n + (f.startsWith('_') || typeof e !== 'object' ? 0 : e.text.length), 0)
    expect(total).toBeLessThanOrEqual(200)
  })
  it('allow-list has no stale entries', () => {
    const stale: string[] = []
    for (const [f, entry] of Object.entries(ALLOW)) {
      if (f.startsWith('_') || typeof entry !== 'object') continue
      if (!fs.existsSync(path.join(ROOT, f))) { stale.push(`${f} (file gone)`); continue }
      const now = new Set(hardCodedText(f))
      for (const s of entry.text) if (!now.has(s)) stale.push(`${f}: ${JSON.stringify(s)}`)
    }
    expect(stale).toEqual([])
  })
})
