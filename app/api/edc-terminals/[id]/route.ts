import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth } from '@/lib/guards'

export const PUT = withAuth(async (req: NextRequest) => {
  const id = req.nextUrl.pathname.split('/').at(-1)!
  const { terminalCode, bankLabel, terminalId, accountNumber, isActive, outletId } = await req.json()
  const data: Record<string, unknown> = {}
  if (terminalCode !== undefined) data.terminalCode = terminalCode
  if (bankLabel !== undefined) data.bankLabel = bankLabel
  if (terminalId !== undefined) data.terminalId = terminalId
  if (accountNumber !== undefined) data.accountNumber = accountNumber
  if (isActive !== undefined) data.isActive = isActive
  if (outletId !== undefined) data.outletId = outletId
  const terminal = await prisma.edcTerminal.update({ where: { id }, data })
  return NextResponse.json(terminal)
}, ['admin'])

export const DELETE = withAuth(async (req: NextRequest) => {
  const id = req.nextUrl.pathname.split('/').at(-1)!
  await prisma.edcTerminal.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}, ['admin'])
