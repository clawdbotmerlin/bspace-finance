import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth } from '@/lib/guards'

export const PUT = withAuth(async (req: NextRequest) => {
  const id = req.nextUrl.pathname.split('/').at(-1)!
  const { name, code, address, isActive, entityId } = await req.json()
  const data: Record<string, unknown> = {}
  if (name !== undefined) data.name = name
  if (code !== undefined) data.code = code
  if (address !== undefined) data.address = address
  if (isActive !== undefined) data.isActive = isActive
  if (entityId !== undefined) data.entityId = entityId
  const outlet = await prisma.outlet.update({ where: { id }, data })
  return NextResponse.json(outlet)
}, ['admin'])

export const DELETE = withAuth(async (req: NextRequest) => {
  const id = req.nextUrl.pathname.split('/').at(-1)!
  await prisma.outlet.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}, ['admin'])
