import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth } from '@/lib/guards'

export const GET = withAuth(async () => {
  const outlets = await prisma.outlet.findMany({
    include: {
      entity: { select: { legalName: true } },
      _count: { select: { edcTerminals: true } },
    },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json(
    outlets.map((o: typeof outlets[number]) => ({
      id: o.id,
      name: o.name,
      code: o.code,
      address: o.address,
      isActive: o.isActive,
      entityId: o.entityId,
      entityName: o.entity.legalName,
      terminalCount: o._count.edcTerminals,
    }))
  )
}, ['admin', 'finance', 'manager'])

export const POST = withAuth(async (req: NextRequest) => {
  const { name, code, address, entityId } = await req.json()
  if (!name || !code || !entityId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  const outlet = await prisma.outlet.create({ data: { name, code, address, entityId } })
  return NextResponse.json(outlet, { status: 201 })
}, ['admin'])
