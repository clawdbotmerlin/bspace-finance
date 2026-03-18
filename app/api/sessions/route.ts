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

  const session = await prisma.reconciliationSession.create({
    data: { outletId, sessionDate: date, status: 'uploading' },
    include: { outlet: { select: { name: true, code: true } } },
  })

  return NextResponse.json({ session }, { status: 201 })
}, ['admin', 'finance'])
