import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/guards'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'

const PAGE_SIZE = 25

export const GET = withAuth(async (req: NextRequest) => {
  const { searchParams } = req.nextUrl

  const page      = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const limit     = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? String(PAGE_SIZE), 10)))
  const status    = searchParams.get('status')?.trim() || undefined
  const type      = searchParams.get('type')?.trim() || undefined
  const outletId  = searchParams.get('outletId')?.trim() || undefined
  const dateFrom  = searchParams.get('dateFrom')?.trim() || undefined
  const dateTo    = searchParams.get('dateTo')?.trim() || undefined

  // Build where clause
  const where: Prisma.DiscrepancyWhereInput = {}
  if (status) where.status = status as Prisma.EnumDiscrepancyStatusFilter
  if (type)   where.discrepancyType = type as Prisma.EnumDiscrepancyTypeFilter

  // Filter by outlet via session relation
  if (outletId || dateFrom || dateTo) {
    const sessionWhere: Prisma.ReconciliationSessionWhereInput = {}
    if (outletId) sessionWhere.outletId = outletId
    if (dateFrom || dateTo) {
      const sessionDate: Prisma.DateTimeFilter = {}
      if (dateFrom) sessionDate.gte = new Date(dateFrom)
      if (dateTo) {
        const end = new Date(dateTo)
        end.setHours(23, 59, 59, 999)
        sessionDate.lte = end
      }
      sessionWhere.sessionDate = sessionDate
    }
    where.session = sessionWhere
  }

  // Summary counts (always across all discrepancies matching type/outlet/date but not status)
  const summaryWhere: Prisma.DiscrepancyWhereInput = { ...where, status: undefined }

  const [total, discrepancies, openCount, investigatingCount, resolvedCount] = await Promise.all([
    prisma.discrepancy.count({ where }),
    prisma.discrepancy.findMany({
      where,
      include: {
        session: {
          select: {
            id: true,
            sessionDate: true,
            status: true,
            outlet: { select: { id: true, name: true, code: true } },
          },
        },
        cashierEntry: {
          select: {
            bankName: true, terminalCode: true, terminalId: true,
            paymentType: true, amount: true, entityNameRaw: true,
          },
        },
        bankMutation: {
          select: {
            bankName: true, accountNumber: true, grossAmount: true,
            description: true, referenceNo: true,
          },
        },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.discrepancy.count({ where: { ...summaryWhere, status: 'open' } }),
    prisma.discrepancy.count({ where: { ...summaryWhere, status: 'investigating' } }),
    prisma.discrepancy.count({ where: { ...summaryWhere, status: 'resolved' } }),
  ])

  return NextResponse.json({
    discrepancies,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    limit,
    summary: { open: openCount, investigating: investigatingCount, resolved: resolvedCount },
  })
}, ['admin', 'finance'])
