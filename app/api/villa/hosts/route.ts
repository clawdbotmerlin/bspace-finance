import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/guards'
import { prisma } from '@/lib/db'

export const GET = withAuth(async () => {
  const hosts = await prisma.villaHost.findMany({
    orderBy: { createdAt: 'asc' },
    include: { _count: { select: { bookings: true } } },
  })
  return NextResponse.json(hosts)
}, ['admin', 'finance', 'manager'])

export const POST = withAuth(async (req: NextRequest) => {
  const { name } = await req.json()
  if (!name?.trim()) {
    return NextResponse.json({ error: 'Nama host wajib diisi.' }, { status: 400 })
  }
  const existing = await prisma.villaHost.findUnique({ where: { name: name.trim() } })
  if (existing) {
    return NextResponse.json({ error: 'Nama host sudah ada.' }, { status: 409 })
  }
  const host = await prisma.villaHost.create({ data: { name: name.trim() } })
  return NextResponse.json(host, { status: 201 })
}, ['admin'])
