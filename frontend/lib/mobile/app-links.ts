/**
 * CORE-043: Android App Links (assetlinks.json) and iOS Universal Links /
 * webcredentials (apple-app-site-association), built from admin settings or
 * env instead of committed placeholder files.
 *
 *   Admin → server secrets          env fallback
 *   apple_team_id                    APPLE_TEAM_ID (10 chars)
 *   ios_bundle_ids                   IOS_BUNDLE_IDS            default "ai.codespectra.app"
 *   android_package_names            ANDROID_PACKAGE_NAMES     default "ai.codespectra.app"
 *   android_sha256_cert_fingerprints ANDROID_SHA256_CERT_FINGERPRINTS (AA:BB:… colon hex)
 *   android_cert_sha256              ANDROID_CERT_SHA256       (base64url, the Play Integrity value — converted)
 *
 * Nothing configured → the route answers 404 (never a placeholder), so the
 * OS simply doesn't verify instead of caching a bogus association.
 */
import { isPackageName } from '@/lib/mobile/play-integrity'
import { isBundleId, isTeamId } from '@/lib/mobile/app-attest'

const splitList = (s: string | undefined) => (s || '').split(/[\s,]+/).map((x) => x.trim()).filter(Boolean)

/**
 * Normalise one SHA-256 certificate fingerprint to the upper-case colon hex
 * form Google expects ("14:6D:E9:…", 32 bytes). Accepts colon hex, plain hex,
 * or base64/base64url of the 32-byte digest. Anything else → null.
 */
export function normalizeCertFingerprint(raw: string): string | null {
  const v = raw.trim()
  if (!v) return null
  let hex: string | null = null
  if (/^([0-9a-fA-F]{2}:){31}[0-9a-fA-F]{2}$/.test(v)) hex = v.replace(/:/g, '')
  else if (/^[0-9a-fA-F]{64}$/.test(v)) hex = v
  else if (/^[A-Za-z0-9_\-+/]{43}=?$/.test(v)) {
    const buf = Buffer.from(v.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
    if (buf.length === 32) hex = buf.toString('hex')
  }
  if (!hex) return null
  return hex.toUpperCase().match(/.{2}/g)!.join(':')
}

export interface AppLinksConfig {
  teamId: string | null
  bundleIds: string[]
  packageNames: string[]
  fingerprints: string[]
}

export type AppLinksSource = Record<string, string | undefined>

/** Pure: resolve the config from an admin-secrets record + env. */
export function resolveAppLinksConfig(rec: AppLinksSource, env: AppLinksSource = process.env): AppLinksConfig {
  const team = (rec.apple_team_id || env.APPLE_TEAM_ID || '').trim()
  const bundleIds = splitList(rec.ios_bundle_ids || env.IOS_BUNDLE_IDS).filter(isBundleId)
  const packageNames = splitList(rec.android_package_names || env.ANDROID_PACKAGE_NAMES).filter(isPackageName)
  const rawFps = [
    ...splitList(rec.android_sha256_cert_fingerprints || env.ANDROID_SHA256_CERT_FINGERPRINTS),
    ...splitList(rec.android_cert_sha256 || env.ANDROID_CERT_SHA256),
  ]
  const fingerprints = [...new Set(rawFps.map(normalizeCertFingerprint).filter((x): x is string => !!x))]
  return {
    teamId: isTeamId(team) ? team : null,
    bundleIds: bundleIds.length ? bundleIds : ['ai.codespectra.app'],
    packageNames: packageNames.length ? packageNames : ['ai.codespectra.app'],
    fingerprints,
  }
}

/** assetlinks.json body, or null when no valid fingerprint is configured. */
export function buildAssetLinks(cfg: AppLinksConfig): unknown[] | null {
  if (!cfg.fingerprints.length) return null
  return cfg.packageNames.map((pkg) => ({
    relation: ['delegate_permission/common.handle_all_urls', 'delegate_permission/common.get_login_creds'],
    target: { namespace: 'android_app', package_name: pkg, sha256_cert_fingerprints: cfg.fingerprints },
  }))
}

/** apple-app-site-association body, or null when the team id is missing. */
export function buildAppleAppSiteAssociation(cfg: AppLinksConfig): Record<string, unknown> | null {
  if (!cfg.teamId) return null
  const appIDs = cfg.bundleIds.map((b) => `${cfg.teamId}.${b}`)
  return {
    applinks: {
      details: [
        {
          appIDs,
          components: [
            { '/': '/api/*', exclude: true, comment: 'API calls never open the app' },
            { '/': '/_next/*', exclude: true },
            { '/': '/auth/github/*', exclude: true, comment: 'OAuth returns finish in the browser' },
            { '/': '/*' },
          ],
        },
      ],
    },
    webcredentials: { apps: appIDs },
  }
}

export async function loadAppLinksConfig(): Promise<AppLinksConfig> {
  let rec: AppLinksSource = {}
  try {
    const { readServerSecrets } = await import('@/lib/server-secrets-cache')
    rec = (await readServerSecrets()) as AppLinksSource
  } catch { /* env fallback */ }
  return resolveAppLinksConfig(rec)
}

/** Shared JSON response for both route handlers. */
export function appLinksResponse(body: unknown | null): Response {
  if (body == null) {
    return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain' } })
  }
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
  })
}
