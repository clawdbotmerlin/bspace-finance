export { default } from 'next-auth/middleware'

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/sessions/:path*',
    '/history/:path*',
    '/admin/:path*',
    '/signoff',
    '/signoff/:path*',
  ],
}
