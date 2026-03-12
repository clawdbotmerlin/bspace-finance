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
  const result = await parseCashierFile(buffer, session.sessionDate, session.blockType as 'REG' | 'EV')

  if (!result.sheetFound) {
    return NextResponse.json({ error: result.errors[0] }, { status: 422 })
  }

  // Re-upload replaces existing entries
  await prisma.cashierEntry.deleteMany({ where: { sessionId } })

  if (result.entries.length > 0) {
    await prisma.cashierEntry.createMany({
      data: result.entries.map((e: typeof result.entries[number]) => ({
        sessionId,
        terminalCode: e.terminalCode,
        bankName: e.bankName,
        terminalId: e.terminalId,
        paymentType: e.paymentType as 'QR' | 'DEBIT' | 'KK' | 'CASH' | 'VOUCHER',
        amount: e.amount,
        notaBill: e.notaBill,
        entityNameRaw: e.entityNameRaw,
        matchStatus: 'unmatched',
      })),
    })
  }

  return NextResponse.json({
    parsed: result.entries.length,
    skipped: result.skipped,
    errors: result.errors,
  })
}, ['admin', 'finance'])
