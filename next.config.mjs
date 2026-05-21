/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['xlsx', 'puppeteer', 'bcryptjs'],
  },
  async redirects() {
    return [
      // Legacy routes before superapp restructure (FRO-35) — redirect to /accounting/*
      { source: '/dashboard', destination: '/accounting', permanent: true },
      { source: '/dashboard/:path*', destination: '/accounting/:path*', permanent: true },
      { source: '/sessions/:path*', destination: '/accounting/sessions/:path*', permanent: true },
      { source: '/history', destination: '/accounting/history', permanent: true },
      { source: '/history/:path*', destination: '/accounting/history/:path*', permanent: true },
      { source: '/signoff', destination: '/accounting/signoff', permanent: true },
      { source: '/signoff/:path*', destination: '/accounting/signoff/:path*', permanent: true },
      { source: '/discrepancies', destination: '/accounting/discrepancies', permanent: true },
      { source: '/admin/:path*', destination: '/accounting/admin/:path*', permanent: true },
    ]
  },
}

export default nextConfig
