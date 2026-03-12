import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/guards'
import { prisma } from '@/lib/db'

export const GET = withAuth(async (req: NextRequest) => {
  const sessionId = req.nextUrl.pathname.split('/').at(-2)!

  const session = await prisma.reconciliationSession.findUnique({
    where: { id: sessionId },
  })
  if (!session) return NextResponse.json({ error: 'Sesi tidak ditemukan.' }, { status: 404 })

  // Fetch matched cashier entries
  const entries = await prisma.cashierEntry.findMany({
    where: { sessionId, matchStatus: 'matched' },
    select: {
      id: true,
      bankName: true,
      terminalCode: true,
      terminalId: true,
      paymentType: true,
      amount: true,
      entityNameRaw: true,
      matchedMutationId: true,
    },
    orderBy: { createdAt: 'asc' },
  })

  // Batch fetch linked bank mutations
  const mutationIds = entries
    .map((e) => e.matchedMutationId)
    .filter((id): id is string => id !== null)

  const mutations = await prisma.bankMutation.findMany({
    where: { id: { in: mutationIds } },
    select: {
      id: true,
      bankName: true,
      accountNumber: true,
      grossAmount: true,
      netAmount: true,
      mdrAmount: true,
      description: true,
      referenceNo: true,
      direction: true,
    },
  })

  const mutMap = new Map(mutations.map((m) => [m.id, m]))

  const pairs = entries.map((e) => {
    const mut = e.matchedMutationId ? mutMap.get(e.matchedMutationId) ?? null : null
    return {
      cashierEntry: e,
      bankMutation: mut,
      amountDiff: mut ? Number(mut.grossAmount) - Number(e.amount) : 0,
    }
  })

  // Count zero-amount entries for summary
  const zeroCount = await prisma.cashierEntry.count({
    where: { sessionId, matchStatus: 'zero' },
  })

  return NextResponse.json({ pairs, zeroCount })
}, ['admin', 'finance', 'manager'])
