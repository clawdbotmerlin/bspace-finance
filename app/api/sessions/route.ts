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
  const { outletId, sessionDate } = await req.json()
  if (!outletId || !sessionDate) {
    return NextResponse.json({ error: 'outletId dan sessionDate wajib diisi.' }, { status: 400 })
  }

  const date = new Date(sessionDate)

  // Create REG and EV sessions simultaneously
  const [regSession, evSession] = await Promise.all([
    prisma.reconciliationSession.create({
      data: { outletId, sessionDate: date, blockType: 'REG', status: 'uploading' },
      include: { outlet: { select: { name: true, code: true } } },
    }),
    prisma.reconciliationSession.create({
      data: { outletId, sessionDate: date, blockType: 'EV', status: 'uploading' },
      include: { outlet: { select: { name: true, code: true } } },
    }),
  ])

  return NextResponse.json({ reg: regSession, ev: evSession }, { status: 201 })
}, ['admin', 'finance'])
