import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/guards'
import { prisma } from '@/lib/db'

export const GET = withAuth(async (req: NextRequest) => {
  const sessionId = req.nextUrl.pathname.split('/').at(-2)!

  const session = await prisma.reconciliationSession.findUnique({
    where: { id: sessionId },
    select: { kasirNames: true, sessionDate: true, id: true, status: true },
  })
  if (!session) return NextResponse.json({ error: 'Sesi tidak ditemukan.' }, { status: 404 })

  // Fetch ALL cashier entries
  const entries = await prisma.cashierEntry.findMany({
    where: { sessionId },
    select: {
      id: true,
      bankName: true,
      terminalCode: true,
      terminalId: true,
      paymentType: true,
      amount: true,
      notaBill: true,
      entityNameRaw: true,
      kasirName: true,
      blockType: true,
      perKasirAmounts: true,
      sourceRow: true,
      matchStatus: true,
      matchedMutationId: true,
    },
    orderBy: [{ blockType: 'asc' }, { bankName: 'asc' }, { terminalCode: 'asc' }, { paymentType: 'asc' }, { createdAt: 'asc' }],
  })

  // Batch fetch linked bank mutations for matched entries
  const matchedMutationIds = entries
    .filter((e) => e.matchedMutationId !== null)
    .map((e) => e.matchedMutationId!)

  const matchedMutations = await prisma.bankMutation.findMany({
    where: { id: { in: matchedMutationIds } },
    select: {
      id: true,
      bankName: true,
      accountNumber: true,
      transactionDate: true,
      grossAmount: true,
      netAmount: true,
      mdrAmount: true,
      description: true,
      referenceNo: true,
      direction: true,
    },
  })

  const mutMap = new Map(matchedMutations.map((m) => [m.id, m]))

  // Unmatched bank mutations = unexpected entries (CR direction only, exclude DR)
  const unexpectedMutations = await prisma.bankMutation.findMany({
    where: { sessionId, matchStatus: 'unmatched', direction: 'CR' },
    select: {
      id: true,
      bankName: true,
      accountNumber: true,
      transactionDate: true,
      grossAmount: true,
      description: true,
      referenceNo: true,
      direction: true,
      matchStatus: true,
    },
    orderBy: [{ bankName: 'asc' }, { transactionDate: 'asc' }],
  })

  // Build entries with their linked mutation
  const entriesWithMutation = entries.map((e) => ({
    ...e,
    bankMutation: e.matchedMutationId ? (mutMap.get(e.matchedMutationId) ?? null) : null,
  }))

  // Rp summary totals
  const cashierTotal = entries.reduce((sum, e) => sum + Number(e.amount), 0)
  const matchedAmount = entries
    .filter((e) => e.matchStatus === 'matched')
    .reduce((sum, e) => sum + Number(e.amount), 0)
  const unmatchedAmount = entries
    .filter((e) => e.matchStatus === 'unmatched')
    .reduce((sum, e) => sum + Number(e.amount), 0)
  const zeroCount = entries.filter((e) => e.matchStatus === 'zero').length

  return NextResponse.json({
    entries: entriesWithMutation,
    unexpectedMutations,
    kasirNames: (session.kasirNames as string[]) ?? [],
    summary: {
      cashierTotal,
      matchedAmount,
      unmatchedAmount,
      zeroCount,
      unexpectedCount: unexpectedMutations.length,
    },
  })
}, ['admin', 'finance', 'manager'])
