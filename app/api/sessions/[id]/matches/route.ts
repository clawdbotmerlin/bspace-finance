import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/guards'
import { prisma } from '@/lib/db'
import { Decimal } from '@prisma/client/runtime/library'

interface MatchedEntry {
  id: string
  bankName: string
  terminalCode: string | null
  terminalId: string | null
  paymentType: string
  amount: Decimal
  entityNameRaw: string | null
  matchedMutationId: string | null
}

interface MutationRow {
  id: string
  bankName: string
  accountNumber: string | null
  grossAmount: Decimal
  netAmount: Decimal | null
  mdrAmount: Decimal | null
  description: string | null
  referenceNo: string | null
  direction: string
}

export const GET = withAuth(async (req: NextRequest) => {
  const sessionId = req.nextUrl.pathname.split('/').at(-2)!

  const session = await prisma.reconciliationSession.findUnique({
    where: { id: sessionId },
  })
  if (!session) return NextResponse.json({ error: 'Sesi tidak ditemukan.' }, { status: 404 })

  // Fetch matched cashier entries
  const entries: MatchedEntry[] = await prisma.cashierEntry.findMany({
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
    .map((e: MatchedEntry) => e.matchedMutationId)
    .filter((id: string | null): id is string => id !== null)

  const mutations: MutationRow[] = await prisma.bankMutation.findMany({
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

  const mutMap = new Map<string, MutationRow>(mutations.map((m: MutationRow) => [m.id, m]))

  const pairs = entries.map((e: MatchedEntry) => {
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
