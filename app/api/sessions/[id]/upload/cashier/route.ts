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
  const result = await parseCashierFile(buffer, session.sessionDate)

  if (!result.sheetFound) {
    return NextResponse.json({ error: result.errors[0] }, { status: 422 })
  }

  // Re-upload replaces all existing entries for this session
  await prisma.cashierEntry.deleteMany({ where: { sessionId } })

  // Update session with kasirNames and rekapQuinos if available
  await prisma.reconciliationSession.update({
    where: { id: sessionId },
    data: {
      ...(result.kasirNames && result.kasirNames.length > 0 ? { kasirNames: result.kasirNames } : {}),
      ...(Object.keys(result.rekapQuinos).length > 0 ? { rekapQuinos: result.rekapQuinos } : {}),
    },
  })

  type PaymentType = 'QR' | 'DEBIT' | 'KK' | 'CASH' | 'VOUCHER'

  if (result.entries.length > 0) {
    await prisma.cashierEntry.createMany({
      data: result.entries.map((e) => ({
        sessionId,
        terminalCode:     e.terminalCode,
        bankName:         e.bankName,
        terminalId:       e.terminalId,
        paymentType:      e.paymentType as PaymentType,
        amount:           e.amount,
        notaBill:         e.notaBill,
        entityNameRaw:    e.entityNameRaw,
        kasirName:        e.kasirName,
        blockType:        e.blockType,
        perKasirAmounts:  e.perKasirAmounts ?? {},
        sourceRow:        e.sourceRow,
        matchStatus:      (e.paymentType === 'CASH' || e.paymentType === 'VOUCHER') ? 'zero' : 'unmatched',
      })),
    })
  }

  const regParsed = result.entries.filter((e) => e.blockType === 'REG').length
  const evParsed  = result.entries.filter((e) => e.blockType === 'EV').length

  return NextResponse.json({
    reg: { parsed: regParsed },
    ev:  { parsed: evParsed },
    skipped: result.skipped,
    errors:  result.errors,
  })
}, ['admin', 'finance'])
