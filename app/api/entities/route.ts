import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth } from '@/lib/guards'

export const GET = withAuth(async () => {
  const entities = await prisma.entity.findMany({
    include: { _count: { select: { outlets: true } } },
    orderBy: { legalName: 'asc' },
  })
  return NextResponse.json(entities)
}, ['admin', 'finance', 'manager'])

export const POST = withAuth(async (req: NextRequest) => {
  const { legalName, shortName } = await req.json()
  if (!legalName || !shortName) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  const entity = await prisma.entity.create({
    data: { legalName, shortName },
  })
  return NextResponse.json(entity, { status: 201 })
}, ['admin'])
