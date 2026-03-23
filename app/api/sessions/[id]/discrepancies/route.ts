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

// Bulk ignore — sets all open missing_in_bank discrepancies in the session to 'ignored'
export const PATCH = withAuth(async (req: NextRequest, authedSession) => {
  const sessionId = req.nextUrl.pathname.split('/').at(-2)!
  const { action } = await req.json() as { action: string }

  if (action !== 'ignore_all') {
    return NextResponse.json({ error: 'Aksi tidak valid.' }, { status: 400 })
  }

  await prisma.discrepancy.updateMany({
    where: { sessionId, status: 'open', discrepancyType: 'missing_in_bank' },
    data: {
      status: 'ignored',
      resolvedBy: authedSession.user.id,
      resolvedAt: new Date(),
      resolutionNotes: 'Diabaikan',
    },
  })

  // Return full updated list so client can sync
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
}, ['admin', 'finance'])
