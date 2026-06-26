import path from 'path'
import { fileURLToPath } from 'url'

const projectRoot = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pin workspace when a parent folder has another lockfile.
  turbopack: {
    root: projectRoot,
  },
  // Allow the Emergent preview domain to load Next.js dev resources (HMR, etc.).
  allowedDevOrigins: [
    'code-spectrum-6.preview.emergentagent.com',
    'code-spectrum-6.cluster-12.preview.emergentcf.cloud',
    '*.preview.emergentagent.com',
    '*.preview.emergentcf.cloud',
  ],
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
