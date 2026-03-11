import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/guards'
import { prisma } from '@/lib/db'

export const GET = withAuth(async (req: NextRequest) => {
  const id = req.nextUrl.pathname.split('/').at(-1)!
  const session = await prisma.reconciliationSession.findUnique({
    where: { id },
    include: {
      outlet: { select: { name: true, code: true } },
      _count: { select: { cashierEntries: true, bankMutations: true } },
    },
  })
  if (!session) return NextResponse.json({ error: 'Sesi tidak ditemukan.' }, { status: 404 })
  return NextResponse.json(session)
}, ['admin', 'finance', 'manager'])
