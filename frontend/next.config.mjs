import path from 'node:path'
import { fileURLToPath } from 'node:url'

// The repo root also has a package.json + yarn.lock (Remotion helpers), so Next
// would otherwise guess the repo root as the workspace root. The app, its
// lockfile (frontend/yarn.lock, used by CI and the Dockerfile) and every
// traced file live in this folder.
const projectRoot = path.dirname(fileURLToPath(import.meta.url))

/**
 * Remote hosts next/image may optimise: a fixed list plus NEXT_IMAGE_REMOTE_HOSTS
 * (comma-separated exact hostnames, read at build time, e.g. the public bucket /
 * CDN host). Wildcards are refused so the optimiser never fetches arbitrary URLs.
 */
function imageRemotePatterns() {
  const fixed = ['avatars.githubusercontent.com', 'lh3.googleusercontent.com', 'i.ytimg.com']
  const extra = (process.env.NEXT_IMAGE_REMOTE_HOSTS || '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter((h) => /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(h))
  return [...new Set([...fixed, ...extra])].map((hostname) => ({ protocol: 'https', hostname, pathname: '/**' }))
}

/**
 * Shared cache across instances (lib/cache/redis-cache-handler.mjs): only when
 * a Redis URL is in the environment (CACHE_REDIS_URL / REDIS_URL /
 * UPSTASH_REDIS_REST_URL+TOKEN). Otherwise Next's built-in per-instance cache.
 */
function sharedCacheConfig() {
  const url = (process.env.CACHE_REDIS_URL || process.env.REDIS_URL || '').trim()
  const rest = (process.env.UPSTASH_REDIS_REST_URL || '').trim() && (process.env.UPSTASH_REDIS_REST_TOKEN || '').trim()
  if (process.env.CACHE_HANDLER_DISABLED === '1' || !(url || rest)) return {}
  return { cacheHandler: path.join(projectRoot, 'lib/cache/redis-cache-handler.mjs'), cacheMaxMemorySize: 0 }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: projectRoot,
  ...sharedCacheConfig(),
  async headers() {
    return [
      {
        // iOS Universal Links: Apple fetches this extension-less file and
        // requires application/json (mobile/capacitor/docs/APP_STORE.md).
        source: '/.well-known/apple-app-site-association',
        headers: [
          { key: 'Content-Type', value: 'application/json' },
          { key: 'Cache-Control', value: 'public, max-age=3600' },
        ],
      },
      {
        // Content-hashed by scripts/build-animated-icons.mjs → safe to cache forever.
        source: '/animated-icons/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/dashboard/identity-verify/:path*',
        headers: [
          {
            key: 'Permissions-Policy',
            // Keep in sync with lib/security-headers.ts (PERMISSIONS_POLICY) —
            // this route must not drop the microphone grant the proxy sets.
            value: 'camera=(self), microphone=(self), display-capture=(self), geolocation=(self), usb=(), serial=(), bluetooth=(), hid=(), midi=(), interest-cohort=()',
          },
        ],
      },
    ]
  },
  allowedDevOrigins: [
    '*.preview.emergentagent.com',
    '*.preview.emergentcf.cloud',
  ],
  serverExternalPackages: ['mongodb', 'nodemailer', 'bcryptjs', '@remotion/renderer', '@remotion/bundler', 'pdfjs-dist'],
  // Keeps peak build memory down on small build machines (the app has grown past 200 routes).
  experimental: {
    webpackMemoryOptimizations: true,
    // Type-check in a separate `tsc` process so it doesn't share a heap with webpack
    // (the in-process checker ran out of memory on 8 GB build machines).
    useTypeScriptCli: true,
  },
  typescript: {
    ignoreBuildErrors: false, // SECURITY: TypeScript errors must be fixed, not silently ignored
  },
  webpack: (config) => {
    config.ignoreWarnings = [
      { module: /node_modules\/@vladmandic\/face-api/ }
    ]
    return config
  },
  // Wave 7: next/image optimisation on (sharp ships in dependencies, incl. the
  // linuxmusl build the Alpine Dockerfile needs). Only our own folders and an
  // exact host allow-list are optimised — never a `**` host. Publisher
  // og:images (news, events) and user/bucket files stay plain <img> (or
  // `unoptimized`), so the optimiser can't be used as an open image proxy.
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [360, 414, 640, 768, 1024, 1280, 1536, 1920],
    imageSizes: [32, 48, 64, 96, 128, 256, 384],
    qualities: [60, 75, 85],
    // public/ images keep stable names: a week, then re-fetched.
    minimumCacheTTL: 604800,
    localPatterns: [
      { pathname: '/covers/**', search: '' },
      { pathname: '/courses/**', search: '' },
      { pathname: '/images/**', search: '' },
      { pathname: '/icons/**', search: '' },
      { pathname: '/illustrations/**', search: '' },
    ],
    remotePatterns: imageRemotePatterns(),
    maximumRedirects: 0,
  },
  async redirects() {
    // /favicon.ico is a real multi-size ICO in public/ now (wave 5), no redirect.
    return []
  },
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error'] } : false,
  },
}

export default nextConfig
