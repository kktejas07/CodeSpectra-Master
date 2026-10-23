#!/usr/bin/env node
/**
 * Builds the small subset of the licensed animated Material icon set
 * ("Animated icons by Sadjad") that the app actually uses.
 *
 *   node scripts/build-animated-icons.mjs "<path to 'Ae & JSON' folder>"
 *
 * Licence: the set may be used in the app, but must NOT be redistributed as a
 * set or as standalone icons, and this repository is public. So:
 *  - only the icons listed in ICONS below are copied (keep it ≤ 30, and only
 *    icons that are rendered somewhere),
 *  - each one is minified (names / editor metadata stripped, numbers rounded),
 *  - the full purchased set is never committed (keep it outside the repo),
 *  - adding/removing an icon here means updating LICENSE-THIRD-PARTY.md.
 *
 * Output (content-hashed names, served with Cache-Control: immutable):
 *  - public/animated-icons/<name>.<hash>.json  Lottie data
 *  - public/animated-icons/<name>.<hash>.svg   still frame (CSS-mask fallback
 *    before the player loads, under reduced motion and without JS)
 *  - components/icons/animated-icon-manifest.ts
 *
 * The still frame is rendered with the same lottie-web light (SVG, no eval)
 * player in headless Chromium (Playwright).
 */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = path.join(root, 'public/animated-icons')
const MANIFEST = path.join(root, 'components/icons/animated-icon-manifest.ts')

/**
 * name → source file (+ which frame to use as the still: 'first' | 'last').
 * Keep in sync with LICENSE-THIRD-PARTY.md.
 */
const ICONS = {
  menu: { src: 'Menu_lottie.json' },
  close: { src: 'Close_lottie.json' },
  search: { src: 'Search_lottie.json' },
  bolt: { src: 'Bolt_lottie.json' },
  download: { src: 'Download_lottie.json' },
  'download-done': { src: 'Download_Done_lottie.json', still: 'last' },
  'check-circle': { src: 'Check_Circle_lottie.json', still: 'last' },
  share: { src: 'iOS_Share_lottie.json' },
  'full-screen': { src: 'Full_Screen_lottie.json' },
  'full-screen-exit': { src: 'FullScreen_Exit_lottie.json' },
  clock: { src: 'Clock_lottie.json' },
  settings: { src: 'Settings_lottie.json' },
  logout: { src: 'Logout_lottie.json' },
  refresh: { src: 'Refresh_lottie.json' },
  'external-link': { src: 'External_link_lottie.json' },
  'create-new-folder': { src: 'Create_New_Folder_lottie.json' },
  upload: { src: 'Publish_lottie.json' },
}

const DROP_KEYS = new Set(['nm', 'mn', 'ix', 'cix', 'np', 'markers', 'props'])

function round(n) {
  return Number.isInteger(n) ? n : Math.round(n * 1000) / 1000
}

function minify(node) {
  if (Array.isArray(node)) return node.map(minify)
  if (node && typeof node === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(node)) {
      if (DROP_KEYS.has(k)) continue
      if (k === 'hd' && v === false) continue
      out[k] = minify(v)
    }
    return out
  }
  return typeof node === 'number' ? round(node) : node
}

const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 10)

function cleanSvg(svg) {
  return svg
    .replace(/^<svg[^>]*>/, (tag) => tag.replace(/\s(?:style|width|height|preserveAspectRatio)="[^"]*"/g, '')) // root sizing only
    .replace(/-?\d+\.\d{3,}/g, (m) => String(Math.round(Number(m) * 100) / 100))
}

async function renderStills(datas) {
  const { chromium } = await import('@playwright/test')
  const executablePath = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined
  const browser = await chromium.launch({ executablePath })
  const page = await browser.newPage()
  await page.setContent('<!doctype html><div id="c" style="width:128px;height:128px"></div>')
  await page.addScriptTag({ path: path.join(root, 'node_modules/lottie-web/build/player/lottie_light.min.js') })
  const stills = {}
  for (const [name, { data, still }] of Object.entries(datas)) {
    stills[name] = await page.evaluate(
      ({ data, still }) => {
        const c = document.getElementById('c')
        c.innerHTML = ''
        const anim = window.lottie.loadAnimation({ container: c, renderer: 'svg', loop: false, autoplay: false, animationData: data })
        anim.goToAndStop(still === 'last' ? anim.totalFrames - 1 : 0, true)
        const svg = c.querySelector('svg')
        svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
        const html = svg.outerHTML
        anim.destroy()
        return html
      },
      { data, still },
    )
  }
  await browser.close()
  return stills
}

async function main() {
  const src = process.argv[2]
  if (!src || !existsSync(src)) {
    process.stderr.write('usage: node scripts/build-animated-icons.mjs "<Ae & JSON folder>"\n')
    process.exit(1)
  }
  mkdirSync(OUT_DIR, { recursive: true })
  for (const f of readdirSync(OUT_DIR)) if (/\.(json|svg)$/.test(f)) unlinkSync(path.join(OUT_DIR, f))

  const datas = {}
  for (const [name, cfg] of Object.entries(ICONS)) {
    const raw = JSON.parse(readFileSync(path.join(src, cfg.src), 'utf8'))
    datas[name] = { data: minify(raw), still: cfg.still || 'first' }
  }
  const stills = await renderStills(datas)

  const entries = []
  let total = 0
  for (const [name, { data, still }] of Object.entries(datas)) {
    const json = JSON.stringify(data)
    const svg = cleanSvg(stills[name])
    const jsonFile = `${name}.${hash(json)}.json`
    const svgFile = `${name}.${hash(svg)}.svg`
    writeFileSync(path.join(OUT_DIR, jsonFile), json)
    writeFileSync(path.join(OUT_DIR, svgFile), svg)
    total += json.length + svg.length
    entries.push(`  '${name}': { json: '/animated-icons/${jsonFile}', still: '/animated-icons/${svgFile}', rest: '${still}' },`)
  }
  writeFileSync(
    MANIFEST,
    `// Generated by scripts/build-animated-icons.mjs — do not edit by hand.\n` +
      `// Animated icons by Sadjad (licensed; see LICENSE-THIRD-PARTY.md). Only these are in the repo.\n` +
      `export const ANIMATED_ICONS = {\n${entries.join('\n')}\n} as const\n\n` +
      `export type AnimatedIconName = keyof typeof ANIMATED_ICONS\n`,
  )
  process.stdout.write(`${entries.length} icons, ${(total / 1024).toFixed(1)} KB total\n`)
}

main().catch((e) => {
  process.stderr.write(`${e?.stack || e}\n`)
  process.exit(1)
})
