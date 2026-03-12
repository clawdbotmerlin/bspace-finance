import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/guards'
import { prisma } from '@/lib/db'

export const PUT = withAuth(async (req: NextRequest, authedSession) => {
  const segments = req.nextUrl.pathname.split('/')
  const discrepancyId = segments.at(-1)!
  const sessionId = segments.at(-3)!

  const body = await req.json()
  const { status, resolutionNotes } = body as {
    status?: 'open' | 'investigating' | 'resolved'
    resolutionNotes?: string
  }

  if (!status) {
    return NextResponse.json({ error: 'Status wajib diisi.' }, { status: 400 })
  }

  if (!['open', 'investigating', 'resolved'].includes(status)) {
    return NextResponse.json({ error: 'Status tidak valid.' }, { status: 400 })
  }

  // Verify discrepancy belongs to this session
  const discrepancy = await prisma.discrepancy.findFirst({
    where: { id: discrepancyId, sessionId },
  })
  if (!discrepancy) {
    return NextResponse.json({ error: 'Diskrepansi tidak ditemukan.' }, { status: 404 })
  }

  // Build update data
  const data: Record<string, unknown> = { status }

  if (resolutionNotes !== undefined) {
    data.resolutionNotes = resolutionNotes
  }

  if (status === 'resolved') {
    data.resolvedBy = authedSession.user.id
    data.resolvedAt = new Date()
  }

  // If re-opened, clear resolution fields
  if (status === 'open') {
    data.resolvedBy = null
    data.resolvedAt = null
    data.resolutionNotes = null
  }

  const updated = await prisma.discrepancy.update({
    where: { id: discrepancyId },
    data,
    include: {
      cashierEntry: {
        select: { bankName: true, terminalId: true, terminalCode: true, paymentType: true, amount: true, entityNameRaw: true },
      },
      bankMutation: {
        select: { bankName: true, accountNumber: true, grossAmount: true, description: true, referenceNo: true, direction: true },
      },
    },
  })

  return NextResponse.json(updated)
}, ['admin', 'finance'])
