import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/guards'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'

const PAGE_SIZE = 25

export const GET = withAuth(async (req: NextRequest) => {
  const { searchParams } = req.nextUrl

  const page    = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const limit   = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? String(PAGE_SIZE), 10)))
  const action  = searchParams.get('action')?.trim() || undefined
  const entityType = searchParams.get('entityType')?.trim() || undefined
  const dateFrom = searchParams.get('dateFrom')?.trim() || undefined
  const dateTo   = searchParams.get('dateTo')?.trim() || undefined

  // Build where clause
  const where: Prisma.AuditLogWhereInput = {}
  if (action) where.action = action
  if (entityType) where.entityType = entityType
  if (dateFrom || dateTo) {
    const createdAt: Prisma.DateTimeFilter = {}
    if (dateFrom) createdAt.gte = new Date(dateFrom)
    if (dateTo) {
      // Include the full dateTo day
      const end = new Date(dateTo)
      end.setHours(23, 59, 59, 999)
      createdAt.lte = end
    }
    where.createdAt = createdAt
  }

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      include: {
        user: { select: { name: true, email: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ])

  return NextResponse.json({
    logs,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    limit,
  })
}, ['admin'])
