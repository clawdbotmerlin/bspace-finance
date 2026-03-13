import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/guards'
import { prisma } from '@/lib/db'

export const POST = withAuth(async (req: NextRequest, authedSession) => {
  const sessionId = req.nextUrl.pathname.split('/').at(-2)!

  const body = await req.json()
  const { action, comment } = body as { action: string; comment?: string }

  if (!['approve', 'reject'].includes(action)) {
    return NextResponse.json(
      { error: 'Aksi tidak valid. Gunakan "approve" atau "reject".' },
      { status: 400 },
    )
  }

  const session = await prisma.reconciliationSession.findUnique({
    where: { id: sessionId },
  })
  if (!session) {
    return NextResponse.json({ error: 'Sesi tidak ditemukan.' }, { status: 404 })
  }

  if (session.status !== 'pending_signoff') {
    return NextResponse.json(
      { error: 'Sesi harus berstatus "menunggu tanda tangan" untuk dapat diproses.' },
      { status: 400 },
    )
  }

  const updated = await prisma.reconciliationSession.update({
    where: { id: sessionId },
    data:
      action === 'approve'
        ? {
            status: 'signed_off',
            signedOffBy: authedSession.user.id,
            signedOffAt: new Date(),
            signOffComment: comment ?? null,
          }
        : {
            status: 'reviewing',
            signedOffBy: null,
            signedOffAt: null,
            signOffComment: comment ?? null,
          },
    include: {
      outlet: { select: { name: true, code: true } },
      submitter: { select: { name: true } },
      signer: { select: { name: true } },
      _count: { select: { cashierEntries: true, bankMutations: true } },
    },
  })

  await prisma.auditLog.create({
    data: {
      userId: authedSession.user.id,
      action: action === 'approve' ? 'signoff_approved' : 'signoff_rejected',
      entityType: 'ReconciliationSession',
      entityId: sessionId,
      sessionId,
      payloadSummary: comment ?? undefined,
    },
  })

  return NextResponse.json({ success: true, session: updated })
}, ['admin', 'manager'])
