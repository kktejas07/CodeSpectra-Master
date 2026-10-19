#!/usr/bin/env node
/**
 * Public-site QA crawler (wave 5 launch polish).
 *
 * Crawls the public pages of a running CodeSpectra app with headless Chromium
 * and reports, per page:
 *   - horizontal overflow at 360 / 390 / 768 / 1280 px (scrollWidth > innerWidth)
 *     plus the widest offending elements,
 *   - broken internal links (every <a href> on a crawled page is fetched; 404/5xx),
 *   - console errors and uncaught page errors,
 *   - missing / duplicate <title>,
 *   - <img> without an alt attribute and images over 300 KB on the wire,
 *   - focus order sanity (first 30 Tab stops: positive tabindex, invisible
 *     focus, focus landing on hidden elements, first stop = skip link).
 *
 * Usage (app already running). Against `next dev` use http://localhost:<port>,
 * not 127.0.0.1: Next blocks dev assets for other origins and the page never hydrates.
 *   node scripts/qa/crawl.mjs --base http://127.0.0.1:3000 [--out qa-report.json]
 *        [--max-pages 120] [--per-pattern 2] [--strict]
 *
 * Exit code: 0 unless --strict and a gating finding exists (overflow, broken
 * link, missing/duplicate title, positive tabindex, 5xx or navigation failure).
 * Console and uncaught page errors from data-backed sections are reported but
 * not gated (CI has no seed data / AI backend). CHROMIUM_PATH overrides the browser binary.
 */
import { chromium } from '@playwright/test'
import { existsSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const arg = (name, def) => {
  const i = args.indexOf(`--${name}`)
  if (i === -1) return def
  const v = args[i + 1]
  return v === undefined || v.startsWith('--') ? true : v
}
const BASE = String(arg('base', process.env.BASE_URL || 'http://127.0.0.1:3000')).replace(/\/$/, '')
const OUT = arg('out', null)
const MAX_PAGES = Number(arg('max-pages', 120))
const PER_PATTERN = Number(arg('per-pattern', 2))
const STRICT = Boolean(arg('strict', false))
const NAV_TIMEOUT = Number(arg('timeout', 90_000))
/** --paths /a,/b crawls only these (plus --discover to follow their links). */
const ONLY = arg('paths', null)
const DISCOVER = ONLY ? Boolean(arg('discover', false)) : true
/** Dev-server noise (HMR socket, Fast Refresh) is not a page bug. */
const NOISE = /_next\/(webpack-)?hmr|\[Fast Refresh\]|\[HMR\]/
const WIDTHS = [360, 390, 768, 1280]
const IMG_LIMIT = 300 * 1024

/** Every public route we own; dynamic ones get a bogus token to exercise the "invalid link" states. */
const SEEDS = [
  '/', '/about', '/api-reference', '/blog', '/careers', '/companies', '/compare', '/contact', '/cookies',
  '/docs', '/editorial-policy', '/events', '/faq', '/features', '/hackathons', '/hackathons/join', '/jobs',
  '/learn', '/marketplace', '/marketplace/cart', '/marketplace/checkout', '/newsletter', '/newsletter/confirm',
  '/open-source', '/pricing', '/privacy', '/security', '/status', '/support', '/terms', '/maintenance',
  '/subscriptions/confirm', '/subscriptions/manage',
  '/auth/login', '/auth/signup', '/auth/forgot-password', '/auth/reset-password',
  '/bgv/qa-invalid-token', '/hr-form/qa-invalid-token', '/interview/join/qa-invalid-token',
  '/interview/schedule/qa-invalid-token', '/hiring-invite/qa-invalid-token', '/assessment/invite/qa-invalid-token',
  '/cert/verify/qa-invalid-token', '/hackathons/verify/qa-invalid-token',
  '/qa-this-page-does-not-exist',
]
/** Never crawl into the signed-in app, APIs or files. */
const SKIP = [/^\/dashboard/, /^\/api\//, /^\/_next\//, /^\/og(\/|$)/, /^\/remotion/, /\.(xml|txt|json|pdf|zip|png|jpe?g|svg|webp|avif|ico|mp4|webm)$/i, /^\/sitemaps?\b/, /^\/logout/]
/** Pages that are expected to answer 404 (the seeded not-found probe). */
const EXPECTED_404 = new Set(['/qa-this-page-does-not-exist'])

const norm = (href) => {
  try {
    const u = new URL(href, BASE)
    if (u.origin !== new URL(BASE).origin) return null
    let p = u.pathname.replace(/\/+$/, '') || '/'
    return p
  } catch {
    return null
  }
}
const skip = (p) => SKIP.some((re) => re.test(p))
/** /blog/foo → /blog/:x so a template is crawled a couple of times, not 400. */
const pattern = (p) => {
  const segs = p.split('/')
  return segs.length > 2 ? [...segs.slice(0, -1), ':x'].join('/') : p
}

function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers'].filter(Boolean)
  for (const root of roots) {
    if (!existsSync(root)) continue
    const dirs = readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse()
    for (const d of dirs) {
      for (const bin of ['chrome-linux/chrome', 'chrome-linux64/chrome']) {
        const p = path.join(root, d, bin)
        if (existsSync(p)) return p
      }
    }
  }
  return undefined
}

async function launch() {
  try {
    return await chromium.launch()
  } catch (e) {
    const exe = findChromium()
    if (!exe) throw e
    return chromium.launch({ executablePath: exe })
  }
}

/** Runs in the page: overflow + offending elements. */
function overflowProbe() {
  const vw = window.innerWidth
  const sw = document.documentElement.scrollWidth
  const offenders = []
  if (sw > vw + 1) {
    const clipped = (el) => {
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const s = getComputedStyle(a)
        if (/(hidden|auto|scroll|clip)/.test(s.overflowX)) return true
      }
      return false
    }
    for (const el of document.body.querySelectorAll('*')) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.right <= vw + 1) continue
      if (getComputedStyle(el).position === 'fixed') continue
      if (clipped(el)) continue
      const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 4).join('.') : ''
      offenders.push({ el: `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${cls ? '.' + cls : ''}`, right: Math.round(r.right), width: Math.round(r.width) })
      if (offenders.length > 40) break
    }
    // Keep the outermost offenders (children of an offender add noise).
    offenders.sort((a, b) => b.width - a.width)
  }
  return { vw, sw, overflow: sw > vw + 1, offenders: offenders.slice(0, 5) }
}

function pageProbe() {
  const links = [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href'))
  const imgs = [...document.querySelectorAll('img')].map((i) => ({ src: i.currentSrc || i.src, alt: i.getAttribute('alt') }))
  const positiveTabindex = [...document.querySelectorAll('[tabindex]')].filter((e) => Number(e.getAttribute('tabindex')) > 0).map((e) => e.outerHTML.slice(0, 120))
  const h1 = document.querySelectorAll('h1').length
  return { title: document.title.trim(), links, imgs, positiveTabindex, h1, lang: document.documentElement.lang }
}

function focusProbe() {
  const el = document.activeElement
  if (!el || el === document.body) return null
  if (el.tagName === 'NEXTJS-PORTAL') return { skip: true } // dev overlay, not page content
  const s = getComputedStyle(el)
  const r = el.getBoundingClientRect()
  const visibleFocus = (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || (s.boxShadow && s.boxShadow !== 'none') || s.textDecorationLine.includes('underline')
  const label = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('name') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40)
  return { tag: el.tagName.toLowerCase(), label, visibleFocus, hidden: r.width === 0 || r.height === 0 || s.visibility === 'hidden', tabindex: el.tabIndex }
}

async function main() {
  const t0 = Date.now()
  const browser = await launch()
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true })
  const report = { base: BASE, startedAt: new Date().toISOString(), pages: {}, brokenLinks: [], unverifiedLinks: [], summary: {} }
  const queue = ONLY ? String(ONLY).split(',').map((x) => x.trim()).filter(Boolean) : [...SEEDS]
  let serverDown = false
  const seen = new Set()
  const patternCount = new Map()
  const linkSources = new Map() // path -> Set(pages that link to it)

  while (queue.length && seen.size < MAX_PAGES && !serverDown) {
    const p = queue.shift()
    if (seen.has(p) || skip(p)) continue
    const pat = pattern(p)
    if (!SEEDS.includes(p) && !(ONLY && String(ONLY).split(',').includes(p))) {
      const n = patternCount.get(pat) || 0
      if (n >= PER_PATTERN) continue
      patternCount.set(pat, n + 1)
    }
    seen.add(p)
    const page = await ctx.newPage()
    const consoleErrors = []
    const pageErrors = []
    const bigImages = []
    page.on('console', (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) consoleErrors.push(m.text().slice(0, 300)) })
    page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 300)))
    page.on('requestfinished', async (req) => {
      if (req.resourceType() !== 'image') return
      try {
        const sizes = await req.sizes()
        if (sizes.responseBodySize > IMG_LIMIT) bigImages.push({ url: req.url().replace(BASE, ''), kb: Math.round(sizes.responseBodySize / 1024) })
      } catch { /* ignore */ }
    })
    const entry = { status: 0, title: '', overflow: {}, consoleErrors, pageErrors, imagesWithoutAlt: [], bigImages, focus: {} }
    report.pages[p] = entry
    try {
      const res = await page.goto(BASE + p, { waitUntil: 'load', timeout: NAV_TIMEOUT })
      entry.status = res?.status() ?? 0
      await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {})
      // A page may redirect itself on the client (empty checkout → cart): every
      // probe retries once the new document has loaded.
      const ev = async (fn) => {
        for (let attempt = 0; ; attempt++) {
          try {
            return await page.evaluate(fn)
          } catch (err) {
            if (attempt >= 3 || !/context was destroyed|navigat/i.test(String(err))) throw err
            await page.waitForLoadState('load', { timeout: NAV_TIMEOUT }).catch(() => {})
            await page.waitForTimeout(1500)
          }
        }
      }
      const info = await ev(pageProbe)
      if (page.url().replace(BASE, '').split('?')[0] !== p) entry.redirectedTo = page.url().replace(BASE, '')
      entry.title = info.title
      entry.h1 = info.h1
      entry.positiveTabindex = info.positiveTabindex
      entry.imagesWithoutAlt = info.imgs.filter((i) => i.alt === null).map((i) => i.src.replace(BASE, '')).slice(0, 10)
      for (const href of info.links) {
        if (!href || /^(mailto:|tel:|javascript:|#)/i.test(href)) continue
        const lp = norm(href)
        if (!lp || skip(lp)) continue
        if (!linkSources.has(lp)) linkSources.set(lp, new Set())
        linkSources.get(lp).add(p)
        if (DISCOVER && !seen.has(lp)) queue.push(lp)
      }
      // Focus order: Tab through the first 30 stops at desktop width.
      const stops = []
      // Start from the top of the document, like a keyboard user who just landed.
      await page.evaluate(() => { document.activeElement?.blur?.(); window.scrollTo(0, 0) }).catch(() => {})
      for (let i = 0; i < 30; i++) {
        await page.keyboard.press('Tab')
        const f = await ev(focusProbe)
        if (!f) break
        if (f.skip) continue
        stops.push(f)
      }
      entry.focus = {
        firstStop: stops[0]?.label ?? null,
        skipLinkFirst: /skip to/i.test(stops[0]?.label ?? ''),
        invisible: stops.filter((s) => !s.visibleFocus && !s.hidden).map((s) => `${s.tag}:${s.label}`).slice(0, 8),
        hidden: stops.filter((s) => s.hidden).map((s) => `${s.tag}:${s.label}`).slice(0, 8),
      }
      for (const w of WIDTHS) {
        await page.setViewportSize({ width: w, height: 900 })
        await page.waitForTimeout(250)
        entry.overflow[w] = await ev(overflowProbe)
      }
    } catch (e) {
      entry.error = String(e.message || e).split('\n')[0]
      if (/ERR_CONNECTION_REFUSED/.test(entry.error)) {
        serverDown = true
        console.error(`\nServer at ${BASE} stopped answering (at ${p}); ending the crawl early.`)
      }
    } finally {
      await page.close()
    }
    process.stdout.write(`.${seen.size % 50 === 0 ? '\n' : ''}`)
  }
  process.stdout.write('\n')

  // Broken links: fetch every internal target once (crawled pages already have a status).
  const linkErrors = new Map()
  for (const [lp, sources] of serverDown ? [] : linkSources) {
    let status = report.pages[lp]?.status
    if (!status) {
      try {
        // Plain fetch, not ctx.request: Playwright's API client honours HTTPS_PROXY,
        // which must never front a local app.
        const r = await fetch(BASE + lp, { redirect: 'follow', signal: AbortSignal.timeout(NAV_TIMEOUT) })
        status = r.status
        await r.body?.cancel().catch(() => {})
      } catch (e) {
        const code = String(e?.cause?.code || e?.name || e).slice(0, 80)
        // The server went away (crash/OOM), not the link: record as unverified.
        if (/ECONNREFUSED|UND_ERR_SOCKET|ECONNRESET/.test(code)) {
          report.unverifiedLinks.push(lp)
          continue
        }
        status = -1
        linkErrors.set(lp, code)
      }
    }
    if ((status >= 400 || status === -1) && !EXPECTED_404.has(lp)) report.brokenLinks.push({ href: lp, status, ...(linkErrors.has(lp) ? { error: linkErrors.get(lp) } : {}), from: [...sources].slice(0, 5) })
  }
  await browser.close()

  // Titles.
  const byTitle = new Map()
  const titleIssues = []
  for (const [p, e] of Object.entries(report.pages)) {
    if (e.error) continue
    if (!e.title) { titleIssues.push({ page: p, issue: 'missing' }); continue }
    if (!byTitle.has(e.title)) byTitle.set(e.title, [])
    byTitle.get(e.title).push(p)
  }
  for (const [t, ps] of byTitle) if (ps.length > 1) titleIssues.push({ title: t, issue: 'duplicate', pages: ps })

  const overflowByWidth = Object.fromEntries(WIDTHS.map((w) => [w, Object.entries(report.pages).filter(([, e]) => e.overflow[w]?.overflow).map(([p, e]) => ({ page: p, scrollWidth: e.overflow[w].sw, offenders: e.overflow[w].offenders }))]))
  const pages = Object.entries(report.pages)
  report.summary = {
    pagesCrawled: pages.length,
    navErrors: pages.filter(([, e]) => e.error).map(([p, e]) => ({ page: p, error: e.error })),
    serverErrors: pages.filter(([, e]) => e.status >= 500).map(([p, e]) => ({ page: p, status: e.status })),
    overflowPages: Object.fromEntries(WIDTHS.map((w) => [w, overflowByWidth[w].length])),
    brokenLinks: report.brokenLinks.length,
    unverifiedLinks: report.unverifiedLinks.length,
    consoleErrorPages: pages.filter(([, e]) => e.consoleErrors.length).length,
    consoleErrors: pages.reduce((n, [, e]) => n + e.consoleErrors.length, 0),
    pageErrors: pages.reduce((n, [, e]) => n + e.pageErrors.length, 0),
    titleIssues: titleIssues.length,
    imagesWithoutAlt: pages.reduce((n, [, e]) => n + e.imagesWithoutAlt.length, 0),
    bigImages: [...new Set(pages.flatMap(([, e]) => e.bigImages.map((b) => b.url)))].length,
    positiveTabindexPages: pages.filter(([, e]) => e.positiveTabindex?.length).length,
    invisibleFocusPages: pages.filter(([, e]) => e.focus?.invisible?.length).length,
    skipLinkMissing: pages.filter(([, e]) => !e.error && e.focus && e.focus.firstStop && !e.focus.skipLinkFirst).map(([p]) => p),
    seconds: Math.round((Date.now() - t0) / 1000),
    serverDown,
  }
  report.overflowByWidth = overflowByWidth
  report.titleIssues = titleIssues

  const s = report.summary
  console.log(`\nCrawled ${s.pagesCrawled} pages in ${s.seconds}s against ${BASE}`)
  console.log(`Overflow pages: ${WIDTHS.map((w) => `${w}px=${s.overflowPages[w]}`).join('  ')}`)
  for (const w of WIDTHS) for (const o of overflowByWidth[w].slice(0, 15)) console.log(`  [${w}] ${o.page} scrollWidth=${o.scrollWidth} ${o.offenders.map((x) => x.el).slice(0, 2).join(' | ')}`)
  console.log(`Broken links: ${s.brokenLinks}${s.unverifiedLinks ? `  (unverified, server unreachable: ${s.unverifiedLinks})` : ''}`)
  for (const b of report.brokenLinks) console.log(`  ${b.status}${b.error ? ' ' + b.error : ''} ${b.href}  ← ${b.from.join(', ')}`)
  console.log(`Server errors (5xx): ${s.serverErrors.length}  nav errors: ${s.navErrors.length}`)
  for (const e of [...s.serverErrors, ...s.navErrors]) console.log(`  ${e.page} ${e.status ?? e.error}`)
  console.log(`Console errors: ${s.consoleErrors} on ${s.consoleErrorPages} pages; uncaught page errors: ${s.pageErrors}`)
  for (const [p, e] of pages) if (e.pageErrors.length) console.log(`  pageerror ${p}: ${e.pageErrors[0]}`)
  console.log(`Title issues: ${s.titleIssues}`)
  for (const t of titleIssues) console.log(`  ${t.issue}: ${t.title ?? t.page}${t.pages ? ' → ' + t.pages.join(', ') : ''}`)
  console.log(`Images without alt: ${s.imagesWithoutAlt}  images >300KB: ${s.bigImages}`)
  console.log(`Positive tabindex pages: ${s.positiveTabindexPages}  pages with invisible focus stops: ${s.invisibleFocusPages}  skip link not first: ${s.skipLinkMissing.length}`)

  if (OUT) writeFileSync(OUT, JSON.stringify(report, null, 2))

  const gating = WIDTHS.reduce((n, w) => n + s.overflowPages[w], 0) + s.brokenLinks + s.titleIssues + s.positiveTabindexPages + s.serverErrors.length + s.navErrors.length
  if (STRICT && (gating > 0 || serverDown || s.unverifiedLinks > 0)) {
    console.error(`\nQA crawl failed: ${gating} gating finding(s).`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(2)
})
