import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/guards'
import { prisma } from '@/lib/db'

export const GET = withAuth(async (_req, authedSession) => {
  const role = authedSession.user.role

  let pendingSignoff = 0
  let openDiscrepancies = 0

  // Managers and admins: count sessions awaiting sign-off
  if (role === 'admin' || role === 'manager') {
    pendingSignoff = await prisma.reconciliationSession.count({
      where: { status: 'pending_signoff' },
    })
  }

  // Admins and finance: count open discrepancies
  if (role === 'admin' || role === 'finance') {
    openDiscrepancies = await prisma.discrepancy.count({
      where: { status: 'open' },
    })
  }

  return NextResponse.json({
    pendingSignoff,
    openDiscrepancies,
    total: pendingSignoff + openDiscrepancies,
  })
}, ['admin', 'finance', 'manager'])
