import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth } from '@/lib/guards'

export const GET = withAuth(async () => {
  const configs = await prisma.bankColumnConfig.findMany({
    orderBy: { bankName: 'asc' },
  })
  return NextResponse.json(configs)
}, ['admin', 'finance', 'manager'])

export const POST = withAuth(async (req: NextRequest) => {
  const body = await req.json()
  const { bankName, fileFormat } = body
  if (!bankName || !fileFormat) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  const config = await prisma.bankColumnConfig.create({ data: body })
  return NextResponse.json(config, { status: 201 })
}, ['admin'])
