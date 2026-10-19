import path from 'node:path'
import { fileURLToPath } from 'node:url'

// The repo root also has a package.json + yarn.lock (Remotion helpers), so Next
// would otherwise guess the repo root as the workspace root. The app, its
// lockfile (frontend/yarn.lock, used by CI and the Dockerfile) and every
// traced file live in this folder.
const projectRoot = path.dirname(fileURLToPath(import.meta.url))

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
  images: {
    unoptimized: true,
  },
  async redirects() {
    return [
      {
        source: '/favicon.ico',
        destination: '/icon.svg',
        permanent: true,
      },
    ]
  },
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error'] } : false,
  },
}

export default nextConfig
