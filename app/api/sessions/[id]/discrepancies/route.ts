import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/guards'
import { prisma } from '@/lib/db'

export const GET = withAuth(async (req: NextRequest) => {
  const sessionId = req.nextUrl.pathname.split('/').at(-2)!

  const discrepancies = await prisma.discrepancy.findMany({
    where: { sessionId },
    include: {
      cashierEntry: {
        select: { bankName: true, terminalId: true, terminalCode: true, paymentType: true, amount: true, entityNameRaw: true },
      },
      bankMutation: {
        select: { bankName: true, accountNumber: true, grossAmount: true, description: true, referenceNo: true, direction: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json(discrepancies)
}, ['admin', 'finance', 'manager'])
