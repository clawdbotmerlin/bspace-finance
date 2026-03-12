import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/guards'
import { prisma } from '@/lib/db'
import { runMatchingEngine } from '@/lib/engine/matching'

export const POST = withAuth(async (req: NextRequest) => {
  const sessionId = req.nextUrl.pathname.split('/').at(-2)!

  const session = await prisma.reconciliationSession.findUnique({
    where: { id: sessionId },
    include: { outlet: true },
  })
  if (!session) return NextResponse.json({ error: 'Sesi tidak ditemukan.' }, { status: 404 })

  // Load all data for this session
  const [cashierEntries, bankMutations, edcTerminals] = await Promise.all([
    prisma.cashierEntry.findMany({ where: { sessionId } }),
    prisma.bankMutation.findMany({ where: { sessionId } }),
    prisma.edcTerminal.findMany({ where: { outletId: session.outletId, isActive: true } }),
  ])

  if (cashierEntries.length === 0) {
    return NextResponse.json({ error: 'Belum ada entri kasir. Upload laporan kasir terlebih dahulu.' }, { status: 400 })
  }

  // Reset all match states (idempotent — safe to re-run)
  await prisma.cashierEntry.updateMany({
    where: { sessionId },
    data: { matchStatus: 'unmatched', matchedMutationId: null },
  })
  await prisma.bankMutation.updateMany({
    where: { sessionId },
    data: { matchStatus: 'unmatched', matchedEntryId: null },
  })
  await prisma.discrepancy.deleteMany({ where: { sessionId } })

  // Run the pure matching engine
  const result = runMatchingEngine(
    cashierEntries.map((e: typeof cashierEntries[number]) => ({
      id: e.id,
      bankName: e.bankName,
      terminalId: e.terminalId,
      paymentType: e.paymentType,
      amount: Number(e.amount),
    })),
    bankMutations.map((m: typeof bankMutations[number]) => ({
      id: m.id,
      bankName: m.bankName,
      accountNumber: m.accountNumber,
      grossAmount: Number(m.grossAmount),
      direction: m.direction,
    })),
    edcTerminals.map((t: typeof edcTerminals[number]) => ({
      bankLabel: t.bankLabel,
      terminalId: t.terminalId,
      accountNumber: t.accountNumber,
    })),
  )

  const matchesWithDiff = result.matches.filter((m: typeof result.matches[number]) => Math.round(Math.abs(m.amountDiff)) > 0)

  // Apply results atomically
  await prisma.$transaction(async (tx) => {
    // Matched pairs
    for (const m of result.matches) {
      await tx.cashierEntry.update({
        where: { id: m.cashierEntryId },
        data: { matchStatus: 'matched', matchedMutationId: m.bankMutationId },
      })
      await tx.bankMutation.update({
        where: { id: m.bankMutationId },
        data: { matchStatus: 'matched', matchedEntryId: m.cashierEntryId },
      })
    }

    // Zero entries
    if (result.zeros.length > 0) {
      await tx.cashierEntry.updateMany({
        where: { id: { in: result.zeros } },
        data: { matchStatus: 'zero' },
      })
    }

    // Discrepancies — amount mismatches
    if (matchesWithDiff.length > 0) {
      await tx.discrepancy.createMany({
        data: matchesWithDiff.map((m: typeof matchesWithDiff[number]) => ({
          sessionId,
          cashierEntryId: m.cashierEntryId,
          bankMutationId: m.bankMutationId,
          discrepancyType: 'amount_mismatch',
          amountDiff: m.amountDiff,
          status: 'open',
        })),
      })
    }

    // Discrepancies — missing in bank
    if (result.missingInBank.length > 0) {
      await tx.discrepancy.createMany({
        data: result.missingInBank.map((id) => ({
          sessionId,
          cashierEntryId: id,
          bankMutationId: null,
          discrepancyType: 'missing_in_bank',
          status: 'open',
        })),
      })
    }

    // Discrepancies — unexpected bank entries
    if (result.unexpectedBank.length > 0) {
      await tx.discrepancy.createMany({
        data: result.unexpectedBank.map((id) => ({
          sessionId,
          cashierEntryId: null,
          bankMutationId: id,
          discrepancyType: 'unexpected_bank_entry',
          status: 'open',
        })),
      })
    }

    // Advance session status
    await tx.reconciliationSession.update({
      where: { id: sessionId },
      data: { status: 'reviewing' },
    })
  })

  const totalDiscrepancies = matchesWithDiff.length + result.missingInBank.length + result.unexpectedBank.length

  return NextResponse.json({
    matched: result.matches.length,
    zeros: result.zeros.length,
    missingInBank: result.missingInBank.length,
    unexpectedBank: result.unexpectedBank.length,
    amountMismatches: matchesWithDiff.length,
    discrepancies: totalDiscrepancies,
  })
}, ['admin', 'finance'])
