import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/guards'
import { prisma } from '@/lib/db'
import { parseBankMutationFile, BankConfigForParser, ColumnMapping } from '@/lib/parsers/bankMutation'

export const POST = withAuth(async (req: NextRequest) => {
  const pathParts = req.nextUrl.pathname.split('/')
  // path: /api/sessions/[id]/upload/bankmutation → id is at index -3
  const sessionId = pathParts.at(-3)!

  const session = await prisma.reconciliationSession.findUnique({ where: { id: sessionId } })
  if (!session) return NextResponse.json({ error: 'Sesi tidak ditemukan.' }, { status: 404 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const bankName = (formData.get('bankName') as string | null)?.toUpperCase()

  if (!file) return NextResponse.json({ error: 'File tidak ditemukan dalam request.' }, { status: 400 })
  if (!bankName) return NextResponse.json({ error: 'bankName wajib diisi.' }, { status: 400 })

  const appendMode = formData.get('append') === 'true'

  const dbConfig = await prisma.bankColumnConfig.findUnique({ where: { bankName } })
  if (!dbConfig) {
    return NextResponse.json({ error: `Konfigurasi untuk bank "${bankName}" belum tersedia.` }, { status: 400 })
  }

  const config: BankConfigForParser = {
    bankName: dbConfig.bankName,
    fileFormat: dbConfig.fileFormat,
    skipRowsTop: dbConfig.skipRowsTop,
    skipRowsBottom: dbConfig.skipRowsBottom,
    columnMapping: dbConfig.columnMapping as unknown as ColumnMapping,
  }

  const buffer = await file.arrayBuffer()
  const result = parseBankMutationFile(buffer, config, session.sessionDate)

  // Re-upload for the same bank replaces existing mutations (unless append mode for multi-file)
  if (!appendMode) {
    await prisma.bankMutation.deleteMany({ where: { sessionId, bankName } })
  }

  if (result.mutations.length > 0) {
    await prisma.bankMutation.createMany({
      data: result.mutations.map((m: typeof result.mutations[number]) => ({
        sessionId,
        bankName:        m.bankName,
        accountNumber:   m.accountNumber,
        transactionDate: new Date(m.transactionDate),
        description:     m.description,
        grossAmount:     m.grossAmount,
        direction:       m.direction,
        referenceNo:     m.referenceNo,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rawData:         m.rawData as any,
        matchStatus:     'unmatched' as const,
      })),
    })
  }

  return NextResponse.json({
    parsed:  result.mutations.length,
    skipped: result.skipped,
    errors:  result.errors,
  })
}, ['admin', 'finance'])
