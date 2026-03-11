import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  const outlets = await prisma.outlet.findMany({
    where: { isActive: true },
    include: { entity: { select: { legalName: true } } },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json(
    outlets.map((o) => ({
      id: o.id,
      name: o.name,
      code: o.code,
      entityId: o.entityId,
      entityName: o.entity.legalName,
    }))
  )
}
