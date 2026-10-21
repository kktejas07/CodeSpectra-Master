/**
 * Wave 7 guard for the CSP / caching split (lib/csp/policy.ts):
 *
 *  1. Every page that is NOT a public marketing path gets the nonce CSP, so it
 *     must render per request — a prerendered page has no nonce and would be
 *     blank once CSP_ENFORCE=1. Accepted proof: `dynamic = 'force-dynamic'` on
 *     the page or an ancestor server layout, a dynamic segment without
 *     generateStaticParams, or a server page reading searchParams.
 *  2. Public marketing pages may be cached (static / ISR), so they must not
 *     read cookies, headers or the session on the server.
 *
 * Static scan of app/**\/page.tsx — no build needed.
 * Run: npx vitest run tests/csp-dynamic-routes.test.ts
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { isPublicMarketingPath } from '@/lib/seo/public-routes'

const APP = path.resolve(__dirname, '../app')

function pages(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (p === path.join(APP, 'api')) continue
      pages(p, out)
    } else if (e.name === 'page.tsx' || e.name === 'page.ts') out.push(p)
  }
  return out
}

const read = (f: string) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null)
const isClient = (src: string) => /^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*['"]use client['"]/.test(src)
const forceDynamic = (src: string | null) => !!src && !isClient(src) && /export const dynamic\s*=\s*['"]force-dynamic['"]/.test(src)

interface Route { file: string; url: string; segs: string[] }

const ROUTES: Route[] = pages(APP).map((file) => {
  const rel = path.relative(APP, path.dirname(file))
  const segs = rel ? rel.split(path.sep) : []
  const url = '/' + segs.filter((s) => !s.startsWith('(') && !s.startsWith('@')).map((s) => (s.startsWith('[') ? 'x' : s)).join('/')
  return { file, url: url === '/' ? '/' : url.replace(/\/$/, ''), segs }
})

function rendersPerRequest(r: Route): boolean {
  const page = read(r.file)!
  if (forceDynamic(page)) return true
  if (!isClient(page) && /\bsearchParams\b/.test(page)) return true
  const chain = [page]
  for (let i = r.segs.length; i >= 1; i--) {
    const layout = read(path.join(APP, ...r.segs.slice(0, i), 'layout.tsx'))
    if (forceDynamic(layout)) return true
    if (layout) chain.push(layout)
  }
  // Root layout too (it must NOT force-dynamic, but count it if someone does).
  if (forceDynamic(read(path.join(APP, 'layout.tsx')))) return true
  const hasParam = r.segs.some((s) => s.startsWith('['))
  return hasParam && !chain.some((src) => /generateStaticParams/.test(src))
}

describe('CSP nonce pages render per request', () => {
  it('scans a realistic number of pages', () => {
    expect(ROUTES.length).toBeGreaterThan(150)
  })

  it('every non-marketing page is dynamic', () => {
    const bad = ROUTES.filter((r) => !isPublicMarketingPath(r.url) && !rendersPerRequest(r)).map((r) => path.relative(APP, r.file))
    expect(bad).toEqual([])
  })

  it('DB-backed public pages are never prerendered at build (no DB there)', () => {
    const dbPages = ROUTES.filter((r) => /@\/lib\/cache\/public-data/.test(read(r.file)!))
    expect(dbPages.map((r) => r.url).sort()).toEqual(expect.arrayContaining(['/', '/contests', '/events', '/events/x', '/learn/x', '/news/x', '/pricing']))
    const bad = dbPages.filter((r) => !forceDynamic(read(r.file))).map((r) => path.relative(APP, r.file))
    expect(bad).toEqual([])
  })

  it('the root layout no longer forces the whole app dynamic', () => {
    expect(forceDynamic(read(path.join(APP, 'layout.tsx')))).toBe(false)
  })
})

describe('cacheable marketing pages never read the request on the server', () => {
  it('no cookies / headers / session in server marketing pages', () => {
    const bad = ROUTES.filter((r) => isPublicMarketingPath(r.url)).filter((r) => {
      const src = read(r.file)!
      return !isClient(src) && /from ['"]next\/headers['"]|await\s+(getAPIUser|getSessionUser|getServerSession|requireAuth|requireAdmin|cookies|headers)\s*\(/.test(src)
    }).map((r) => path.relative(APP, r.file))
    expect(bad).toEqual([])
  })
})
