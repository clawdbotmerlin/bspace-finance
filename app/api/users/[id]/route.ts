import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth } from '@/lib/guards'

export const PUT = withAuth(async (req: NextRequest) => {
  const id = req.nextUrl.pathname.split('/').at(-1)!
  const body = await req.json()
  const { role, isActive } = body

  const data: Record<string, unknown> = {}
  if (role !== undefined) data.role = role
  if (isActive !== undefined) data.isActive = isActive

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const user = await prisma.user.update({
    where: { id },
    data,
    select: { id: true, name: true, email: true, role: true, isActive: true },
  })

  return NextResponse.json(user)
}, ['admin'])
