/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['xlsx', 'puppeteer', 'bcryptjs'],
  },
  output: 'standalone',
}

export default nextConfig
