export { default } from 'next-auth/middleware'

export const config = {
  matcher: [
    '/home',
    '/accounting',
    '/accounting/:path*',
    '/villa-analytics',
    '/villa-analytics/:path*',
    '/dashboard/:path*',
  ],
}
