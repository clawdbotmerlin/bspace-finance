import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/guards'
import { prisma } from '@/lib/db'

export const GET = withAuth(async (req: NextRequest) => {
  const { searchParams } = req.nextUrl
  const from = searchParams.get('from')      // YYYY-MM-DD
  const to = searchParams.get('to')          // YYYY-MM-DD
  const listing = searchParams.get('listing') // partial match

  const bookings = await prisma.villaBooking.findMany({
    where: {
      checkIn: {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      },
      ...(listing ? { listing: { contains: listing, mode: 'insensitive' } } : {}),
    },
    orderBy: { checkIn: 'desc' },
    take: 500,
  })

  return NextResponse.json(bookings)
}, ['admin', 'finance', 'manager'])
