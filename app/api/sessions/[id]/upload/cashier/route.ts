import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/guards'
import { prisma } from '@/lib/db'
import { parseCashierFile } from '@/lib/parsers/cashier'

export const POST = withAuth(async (req: NextRequest) => {
  const pathParts = req.nextUrl.pathname.split('/')
  // path: /api/sessions/[id]/upload/cashier → id is at index -3
  const sessionId = pathParts.at(-3)!

  const session = await prisma.reconciliationSession.findUnique({ where: { id: sessionId } })
  if (!session) return NextResponse.json({ error: 'Sesi tidak ditemukan.' }, { status: 404 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'File tidak ditemukan dalam request.' }, { status: 400 })

  const buffer = await file.arrayBuffer()
  // Parser now auto-detects both REG and EV sections; each entry carries its blockType
  const result = await parseCashierFile(buffer, session.sessionDate)

  if (!result.sheetFound) {
    return NextResponse.json({ error: result.errors[0] }, { status: 422 })
  }

  // Find the paired session (same outlet + date, opposite blockType)
  const pairedBlockType = session.blockType === 'REG' ? 'EV' : 'REG'
  const pairedSession = await prisma.reconciliationSession.findUnique({
    where: {
      outletId_sessionDate_blockType: {
        outletId:    session.outletId,
        sessionDate: session.sessionDate,
        blockType:   pairedBlockType,
      },
    },
  })

  // Split entries by their auto-detected block
  const thisEntries   = result.entries.filter((e) => e.blockType === session.blockType)
  const pairedEntries = pairedSession
    ? result.entries.filter((e) => e.blockType === pairedBlockType)
    : []

  // Re-upload replaces all existing entries for both sessions
  await prisma.cashierEntry.deleteMany({ where: { sessionId } })
  if (pairedSession) {
    await prisma.cashierEntry.deleteMany({ where: { sessionId: pairedSession.id } })
  }

  type PaymentType = 'QR' | 'DEBIT' | 'KK' | 'CASH' | 'VOUCHER'

  if (thisEntries.length > 0) {
    await prisma.cashierEntry.createMany({
      data: thisEntries.map((e) => ({
        sessionId,
        terminalCode:  e.terminalCode,
        bankName:      e.bankName,
        terminalId:    e.terminalId,
        paymentType:   e.paymentType as PaymentType,
        amount:        e.amount,
        notaBill:      e.notaBill,
        entityNameRaw: e.entityNameRaw,
        matchStatus:   'unmatched',
      })),
    })
  }

  if (pairedEntries.length > 0 && pairedSession) {
    await prisma.cashierEntry.createMany({
      data: pairedEntries.map((e) => ({
        sessionId:     pairedSession.id,
        terminalCode:  e.terminalCode,
        bankName:      e.bankName,
        terminalId:    e.terminalId,
        paymentType:   e.paymentType as PaymentType,
        amount:        e.amount,
        notaBill:      e.notaBill,
        entityNameRaw: e.entityNameRaw,
        matchStatus:   'unmatched',
      })),
    })
  }

  const regParsed = session.blockType === 'REG' ? thisEntries.length : pairedEntries.length
  const evParsed  = session.blockType === 'EV'  ? thisEntries.length : pairedEntries.length

  return NextResponse.json({
    reg: { parsed: regParsed },
    ev:  { parsed: evParsed },
    skipped: result.skipped,
    errors:  result.errors,
  })
}, ['admin', 'finance'])
