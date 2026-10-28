#!/usr/bin/env node
/**
 * After `cap sync android`, give each build flavour its own site URL.
 *
 * `cap sync` writes ONE capacitor.config.json (prod: server.url in
 * ../capacitor.config.json) into android/app/src/main/assets. Android merges
 * flavour assets over main, so we write src/dev/assets + src/staging/assets
 * copies with server.url swapped, and stamp each flavour's URL into the
 * offline screen. URLs must match productFlavors in android/app/build.gradle.
 *
 *   CS_DEV_URL      (default https://dev.codespectra.ai)
 *   CS_STAGING_URL  (default https://staging.codespectra.ai)
 *   CS_IAP_ENABLED  "1" only once Google Play Billing is integrated: adds
 *                   `CSIAP/1` to the user agent so the web app shows purchase
 *                   buttons (docs/IN_APP_PURCHASES.md). Default: hidden.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const PLACEHOLDER = '__CS_SERVER_URL__'

export function flavourUrls(env = process.env, prodUrl = 'https://codespectra.ai') {
  return {
    dev: env.CS_DEV_URL || 'https://dev.codespectra.ai',
    staging: env.CS_STAGING_URL || 'https://staging.codespectra.ai',
    prod: prodUrl,
  }
}

/** Only https origins (no path, query or credentials) may be a shell's start URL. */
export function assertOrigin(url) {
  const u = new URL(url)
  if (u.protocol !== 'https:' || u.username || u.password || (u.pathname !== '/' && u.pathname !== '') || u.search || u.hash) {
    throw new Error(`Flavour URL must be a bare https origin: ${url}`)
  }
  return u.origin
}

export function configFor(baseConfig, url) {
  const cfg = structuredClone(baseConfig)
  cfg.server = { ...(cfg.server || {}), url: assertOrigin(url) }
  return cfg
}

export const IAP_UA = 'CSIAP/1'

/** Tag the shell's user agent when in-app purchase is enabled for this build. */
export function withIap(cfg, enabled) {
  const out = structuredClone(cfg)
  const ua = (out.android?.appendUserAgent || 'CodeSpectraAndroid/1').split(' ').filter((t) => t && t !== IAP_UA)
  if (enabled) ua.push(IAP_UA)
  out.android = { ...(out.android || {}), appendUserAgent: ua.join(' ') }
  return out
}

export function offlineFor(html, url) {
  return html.split(PLACEHOLDER).join(assertOrigin(url))
}

function main() {
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
  const appSrc = path.join(root, 'android', 'app', 'src')
  const mainAssets = path.join(appSrc, 'main', 'assets')
  const cfgPath = path.join(mainAssets, 'capacitor.config.json')
  if (!fs.existsSync(cfgPath)) throw new Error('Run `npx cap sync android` first')
  const iap = process.env.CS_IAP_ENABLED === '1'
  const base = withIap(JSON.parse(fs.readFileSync(cfgPath, 'utf8')), iap)
  fs.writeFileSync(cfgPath, JSON.stringify(base, null, 2) + '\n')
  const urls = flavourUrls(process.env, base.server?.url)
  const offlinePath = path.join(mainAssets, 'public', 'offline.html')
  const offlineTpl = fs.readFileSync(path.join(root, 'www', 'offline.html'), 'utf8')

  // prod = main source set
  fs.writeFileSync(offlinePath, offlineFor(offlineTpl, urls.prod))
  for (const flavour of ['dev', 'staging']) {
    const dir = path.join(appSrc, flavour, 'assets')
    fs.mkdirSync(path.join(dir, 'public'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'capacitor.config.json'), JSON.stringify(configFor(base, urls[flavour]), null, 2) + '\n')
    fs.writeFileSync(path.join(dir, 'public', 'offline.html'), offlineFor(offlineTpl, urls[flavour]))
  }
  process.stdout.write(`flavour configs: ${Object.entries(urls).map(([k, v]) => `${k}=${v}`).join(' ')} iap=${iap ? 'on' : 'off'}\n`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main()
