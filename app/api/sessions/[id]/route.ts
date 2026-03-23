import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/guards'
import { prisma } from '@/lib/db'

export const GET = withAuth(async (req: NextRequest) => {
  const id = req.nextUrl.pathname.split('/').at(-1)!
  const session = await prisma.reconciliationSession.findUnique({
    where: { id },
    include: {
      outlet: { select: { name: true, code: true } },
      submitter: { select: { name: true } },
      signer: { select: { name: true } },
      _count: { select: { cashierEntries: true, bankMutations: true } },
    },
  })
  if (!session) return NextResponse.json({ error: 'Sesi tidak ditemukan.' }, { status: 404 })
  return NextResponse.json(session)
}, ['admin', 'finance', 'manager'])

export const DELETE = withAuth(async (req: NextRequest, authedSession) => {
  const id = req.nextUrl.pathname.split('/').at(-1)!

  const session = await prisma.reconciliationSession.findUnique({
    where: { id },
    select: { id: true, status: true },
  })

  if (!session) {
    return NextResponse.json({ error: 'Sesi tidak ditemukan.' }, { status: 404 })
  }

  // Signed-off sessions are permanent financial records — never allow deletion
  if (session.status === 'signed_off') {
    return NextResponse.json({ error: 'Sesi yang sudah ditandatangani tidak dapat dihapus.' }, { status: 400 })
  }

  // Finance staff can only delete early-stage sessions (uploading / reviewing)
  const role = (authedSession.user as { role?: string }).role
  if (role === 'finance' && !['uploading', 'reviewing'].includes(session.status)) {
    return NextResponse.json({ error: 'Anda tidak memiliki izin untuk menghapus sesi dengan status ini.' }, { status: 403 })
  }

  // Delete the session — CashierEntry, BankMutation, Discrepancy cascade automatically.
  // AuditLog.sessionId is nullable; Prisma sets it to null on delete.
  await prisma.reconciliationSession.delete({ where: { id } })

  return NextResponse.json({ ok: true })
}, ['admin', 'finance'])
