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
  serverExternalPackages: ['mongodb', 'nodemailer', 'bcryptjs', '@remotion/renderer', '@remotion/bundler'],
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
