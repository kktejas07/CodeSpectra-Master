import path from 'path'
import { fileURLToPath } from 'url'

const projectRoot = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/dashboard/identity-verify/:path*',
        headers: [
          {
            key: 'Permissions-Policy',
            value: 'camera=(self)',
          },
        ],
      },
    ]
  },
  allowedDevOrigins: [
    '*.preview.emergentagent.com',
    '*.preview.emergentcf.cloud',
  ],
  serverExternalPackages: ['mongodb', 'nodemailer', 'bcryptjs'],
  typescript: {
    ignoreBuildErrors: true,
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
}

export default nextConfig
