import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth } from '@/lib/guards'

export const GET = withAuth(async () => {
  const outlets = await prisma.outlet.findMany({
    include: {
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
      terminalCount: o._count.edcTerminals,
    }))
  )
}, ['admin', 'finance', 'manager'])

export const POST = withAuth(async (req: NextRequest) => {
  const { name, code, address } = await req.json()
  if (!name || !code) {
    return NextResponse.json({ error: 'Nama dan kode outlet wajib diisi.' }, { status: 400 })
  }
  const outlet = await prisma.outlet.create({ data: { name, code, address: address || null } })
  return NextResponse.json(outlet, { status: 201 })
}, ['admin'])
