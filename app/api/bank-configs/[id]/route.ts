import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth } from '@/lib/guards'

export const PUT = withAuth(async (req: NextRequest) => {
  const id = req.nextUrl.pathname.split('/').at(-1)!
  const body = await req.json()
  // Remove read-only fields that shouldn't be changed via PUT
  const { id: _id, createdAt: _c, updatedAt: _u, ...data } = body
  const config = await prisma.bankColumnConfig.update({ where: { id }, data })
  return NextResponse.json(config)
}, ['admin', 'finance'])

export const DELETE = withAuth(async (req: NextRequest) => {
  const id = req.nextUrl.pathname.split('/').at(-1)!
  await prisma.bankColumnConfig.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}, ['admin'])
