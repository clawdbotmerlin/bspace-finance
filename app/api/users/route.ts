import { NextRequest, NextResponse } from 'next/server'
import { hash } from 'bcryptjs'
import { prisma } from '@/lib/db'
import { withAuth } from '@/lib/guards'

export const GET = withAuth(async () => {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
      outlet: { select: { name: true } },
    },
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json(users)
}, ['admin'])

export const POST = withAuth(async (req: NextRequest) => {
  const body = await req.json()
  const { name, email, password, role } = body

  if (!name || !email || !password || !role) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    return NextResponse.json({ error: 'Email already in use' }, { status: 409 })
  }

  const passwordHash = await hash(password, 12)
  const user = await prisma.user.create({
    data: { name, email, passwordHash, role },
    select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
  })

  return NextResponse.json(user, { status: 201 })
}, ['admin'])
