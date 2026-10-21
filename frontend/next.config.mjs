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

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: projectRoot,
  async headers() {
    return [
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
