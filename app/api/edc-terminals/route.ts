import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth } from '@/lib/guards'

export const GET = withAuth(async () => {
  const terminals = await prisma.edcTerminal.findMany({
    include: {
      outlet: { select: { name: true, code: true } },
    },
    orderBy: [{ outlet: { name: 'asc' } }, { terminalCode: 'asc' }, { bankLabel: 'asc' }],
  })
  return NextResponse.json(
    terminals.map((t) => ({
      id: t.id,
      terminalCode: t.terminalCode,
      bankLabel: t.bankLabel,
      terminalId: t.terminalId,
      accountNumber: t.accountNumber,
      isActive: t.isActive,
      outletId: t.outletId,
      outletName: t.outlet.name,
      outletCode: t.outlet.code,
    }))
  )
}, ['admin', 'finance', 'manager'])

export const POST = withAuth(async (req: NextRequest) => {
  const { terminalCode, bankLabel, terminalId, accountNumber, outletId } = await req.json()
  if (!terminalCode || !bankLabel || !terminalId || !outletId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  const terminal = await prisma.edcTerminal.create({
    data: { terminalCode, bankLabel, terminalId, accountNumber, outletId },
  })
  return NextResponse.json(terminal, { status: 201 })
}, ['admin'])
