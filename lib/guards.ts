import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'

type Role = 'admin' | 'finance' | 'manager'

type AuthedUser = {
  id: string
  role: Role
  name?: string | null
  email?: string | null
}

type AuthedSession = {
  user: AuthedUser
}

type AuthedHandler = (req: NextRequest, session: AuthedSession) => Promise<NextResponse>

/**
 * Wraps an API route handler with auth + optional role check.
 * Returns 401 if unauthenticated, 403 if role not allowed.
 */
export function withAuth(handler: AuthedHandler, allowedRoles?: Role[]) {
  return async (req: NextRequest) => {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const role = (session.user as { role?: string }).role as Role | undefined
    if (allowedRoles && (!role || !allowedRoles.includes(role))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return handler(req, session as unknown as AuthedSession)
  }
}

/**
 * Server-component guard. Returns session if user has the required role, null otherwise.
 */
export async function requireRole(role: Role) {
  const session = await getServerSession(authOptions)
  const userRole = (session?.user as { role?: string })?.role
  if (!session?.user || userRole !== role) return null
  return session as unknown as AuthedSession
}
