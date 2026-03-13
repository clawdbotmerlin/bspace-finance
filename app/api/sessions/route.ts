import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/guards'
import { prisma } from '@/lib/db'

export const GET = withAuth(async () => {
  const sessions = await prisma.reconciliationSession.findMany({
    orderBy: { sessionDate: 'desc' },
    include: {
      outlet: { select: { name: true, code: true } },
      submitter: { select: { name: true } },
      _count: { select: { cashierEntries: true, bankMutations: true } },
    },
  })
  return NextResponse.json(sessions)
}, ['admin', 'finance', 'manager'])

export const POST = withAuth(async (req: NextRequest) => {
  const { outletId, sessionDate, blockType } = await req.json()
  if (!outletId || !sessionDate || !blockType) {
    return NextResponse.json({ error: 'outletId, sessionDate, dan blockType wajib diisi.' }, { status: 400 })
  }

  const date = new Date(sessionDate)
  const existing = await prisma.reconciliationSession.findUnique({
    where: { outletId_sessionDate_blockType: { outletId, sessionDate: date, blockType } },
  })
  if (existing) {
    return NextResponse.json({ error: 'Sesi untuk outlet, tanggal, dan blok ini sudah ada.', existingId: existing.id }, { status: 409 })
  }

  const session = await prisma.reconciliationSession.create({
    data: { outletId, sessionDate: date, blockType, status: 'uploading' },
    include: { outlet: { select: { name: true, code: true } } },
  })
  return NextResponse.json(session, { status: 201 })
}, ['admin', 'finance'])
