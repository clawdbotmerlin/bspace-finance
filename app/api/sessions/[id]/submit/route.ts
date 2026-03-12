import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/guards'
import { prisma } from '@/lib/db'

export const POST = withAuth(async (req: NextRequest, authedSession) => {
  const sessionId = req.nextUrl.pathname.split('/').at(-2)!

  const session = await prisma.reconciliationSession.findUnique({
    where: { id: sessionId },
  })
  if (!session) {
    return NextResponse.json({ error: 'Sesi tidak ditemukan.' }, { status: 404 })
  }

  if (session.status !== 'reviewing') {
    return NextResponse.json(
      { error: 'Sesi harus berstatus "reviewing" untuk disubmit.' },
      { status: 400 },
    )
  }

  const updated = await prisma.reconciliationSession.update({
    where: { id: sessionId },
    data: {
      status: 'pending_signoff',
      submittedBy: authedSession.user.id,
      submittedAt: new Date(),
    },
    include: {
      outlet: { select: { name: true, code: true } },
      _count: { select: { cashierEntries: true, bankMutations: true } },
    },
  })

  // Audit log
  await prisma.auditLog.create({
    data: {
      userId: authedSession.user.id,
      action: 'submit_for_signoff',
      entityType: 'ReconciliationSession',
      entityId: sessionId,
      sessionId,
    },
  })

  return NextResponse.json({ success: true, session: updated })
}, ['admin', 'finance'])
