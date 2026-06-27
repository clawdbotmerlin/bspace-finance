import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/guards'
import { prisma } from '@/lib/db'

export const PUT = withAuth(async (req: NextRequest, _session, { params }: { params: { id: string } }) => {
  const { name, isActive } = await req.json()
  const host = await prisma.villaHost.findUnique({ where: { id: params.id } })
  if (!host) return NextResponse.json({ error: 'Host tidak ditemukan.' }, { status: 404 })

  if (name !== undefined && name.trim() !== host.name) {
    const existing = await prisma.villaHost.findUnique({ where: { name: name.trim() } })
    if (existing) return NextResponse.json({ error: 'Nama host sudah ada.' }, { status: 409 })
  }

  const updated = await prisma.villaHost.update({
    where: { id: params.id },
    data: {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
    },
  })
  return NextResponse.json(updated)
}, ['admin'])

export const DELETE = withAuth(async (_req: NextRequest, _session, { params }: { params: { id: string } }) => {
  const count = await prisma.villaBooking.count({ where: { hostId: params.id } })
  if (count > 0) {
    return NextResponse.json(
      { error: `Tidak dapat dihapus — masih ada ${count} booking terkait host ini.` },
      { status: 409 }
    )
  }
  await prisma.villaHost.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}, ['admin'])
