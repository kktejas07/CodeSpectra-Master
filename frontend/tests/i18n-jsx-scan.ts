/**
 * Finds user-visible English left in JSX (text nodes and a few text props)
 * in the signed-in app areas. Heuristic, on purpose: anything with two
 * letters in a row that isn't inside code-ish elements and isn't a pure
 * brand / tech token. Used by tests/i18n-app-areas.test.ts.
 */
import fs from 'node:fs'
import path from 'node:path'
// next ships Babel's parser untyped; only `parse` is used.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { parse } = require('next/dist/compiled/babel/parser') as { parse: (src: string, opts: object) => any }

export const ROOT = path.resolve(__dirname, '..')

/** Where the signed-in learner / recruiter / college app lives (admin pages are owned elsewhere). */
export const SCAN_DIRS = [
  'app/dashboard',
  ...['achievements', 'ai', 'assessment', 'cad', 'campus', 'challenges', 'code-scanner', 'codeathons', 'courses', 'dashboard', 'gamification',
    'hiring', 'integrity', 'interview-sim', 'kyc', 'leagues', 'marketplace', 'mentors', 'passport', 'problems', 'proctoring', 'pwa', 'resources', 'scanner'].map((d) => `components/${d}`),
]
const SKIP_DIRS = ['app/dashboard/admin', 'components/marketplace/admin', 'components/dashboard/settings']
const SKIP_PARENTS = new Set(['code', 'pre', 'kbd', 'samp', 'script', 'style', 'text', 'tspan', 'title', 'svg', 'math'])
const TEXT_PROPS = new Set(['placeholder', 'title', 'aria-label', 'alt', 'label', 'description', 'actionLabel', 'emptyText', 'message', 'confirmLabel', 'cancelLabel'])
const KEEP = /^(CodeSpectra|GitHub|LinkedIn|Google|SQL|API|JSON|CSV|PDF|AI|ATS|BGV|OK|Python|Java|JavaScript|TypeScript|C\+\+|Go|Rust|React|Node\.js|HTML|CSS|DSA|AWS|Docker|Git|CAD|XP|PR|UPI|PAN|GST|INR|USD|ID|OTP|QR|IST|UTC|LOC|CTC|CGPA|vs|px|ms|min|MB|KB|Aadhaar|DigiLocker|WhatsApp|Stripe|Zoom)$/

function isHuman(s: string): boolean {
  const v = s.replace(/\s+/g, ' ').trim()
  if (!/[A-Za-z]{2}/.test(v)) return false
  if (/^(https?:|\/|#|mailto:)/.test(v)) return false
  if (!/\s/.test(v) && /[_./:=@[\]]/.test(v)) return false
  return !v.split(/[\s,/·•|:()+\-–—.&!?]+/).filter(Boolean).every((w) => KEEP.test(w) || !/[A-Za-z]{2}/.test(w))
}

export function listFiles(): string[] {
  const out: string[] = []
  const walk = (d: string) => {
    for (const f of fs.readdirSync(path.join(ROOT, d))) {
      const rel = `${d}/${f}`
      if (SKIP_DIRS.some((s) => rel === s || rel.startsWith(`${s}/`))) continue
      const st = fs.statSync(path.join(ROOT, rel))
      if (st.isDirectory()) walk(rel)
      else if (rel.endsWith('.tsx')) out.push(rel)
    }
  }
  for (const d of SCAN_DIRS) if (fs.existsSync(path.join(ROOT, d))) walk(d)
  return out.sort()
}

type Node = { type: string; start: number; end: number; [k: string]: unknown }

export function hardCodedText(rel: string): string[] {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8')
  const ast = parse(src, { sourceType: 'module', plugins: ['jsx', 'typescript'] }) as unknown as { program: Node }
  const found: string[] = []
  const visit = (n: Node, skip: boolean) => {
    if (!n || typeof n.type !== 'string') return
    let s = skip
    if (n.type === 'JSXElement') {
      const name = ((n.openingElement as Node).name as Node & { name?: string }).name
      if (typeof name === 'string' && SKIP_PARENTS.has(name)) s = true
    }
    if (!s && n.type === 'JSXText' && isHuman(String(n.value))) found.push(String(n.value).replace(/\s+/g, ' ').trim())
    if (!s && n.type === 'JSXAttribute') {
      const nm = (n.name as Node & { name?: string }).name
      const val = n.value as Node | null
      if (typeof nm === 'string' && TEXT_PROPS.has(nm) && val?.type === 'StringLiteral' && isHuman(String(val.value))) found.push(`${nm}="${val.value}"`)
    }
    for (const k of Object.keys(n)) {
      if (k === 'loc' || k === 'extra') continue
      const v = n[k]
      if (Array.isArray(v)) v.forEach((c) => c && typeof (c as Node).type === 'string' && visit(c as Node, s))
      else if (v && typeof (v as Node).type === 'string') visit(v as Node, s)
    }
  }
  visit(ast.program, false)
  return found
}
