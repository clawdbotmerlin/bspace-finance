import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth } from '@/lib/guards'

export const PUT = withAuth(async (req: NextRequest) => {
  const id = req.nextUrl.pathname.split('/').at(-1)!
  const { legalName, shortName, isActive } = await req.json()
  const data: Record<string, unknown> = {}
  if (legalName !== undefined) data.legalName = legalName
  if (shortName !== undefined) data.shortName = shortName
  if (isActive !== undefined) data.isActive = isActive
  const entity = await prisma.entity.update({ where: { id }, data })
  return NextResponse.json(entity)
}, ['admin'])

export const DELETE = withAuth(async (req: NextRequest) => {
  const id = req.nextUrl.pathname.split('/').at(-1)!
  await prisma.entity.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}, ['admin'])
