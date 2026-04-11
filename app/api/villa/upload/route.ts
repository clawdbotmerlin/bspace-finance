import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/guards'
import { prisma } from '@/lib/db'
import { parseVillaBookingCsv } from '@/lib/parsers/villaBooking'

export const POST = withAuth(async (req: NextRequest, session) => {
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'File wajib diisi.' }, { status: 400 })

  const buffer = await file.arrayBuffer()
  const result = parseVillaBookingCsv(buffer)

  if (result.bookings.length === 0) {
    return NextResponse.json(
      { error: 'Tidak ada data yang berhasil diparsing.', errors: result.errors },
      { status: 422 }
    )
  }

  // Pre-check which bookings already exist so we can report new vs updated
  const existingKeys = new Set(
    (await prisma.villaBooking.findMany({
      where: {
        OR: result.bookings.map((b) => ({
          listingId: b.listingId,
          checkIn: new Date(b.checkIn),
        })),
      },
      select: { listingId: true, checkIn: true },
    })).map((r) => `${r.listingId}::${r.checkIn.toISOString().slice(0, 10)}`)
  )

  const upload = await prisma.villaUpload.create({
    data: {
      fileName: file.name,
      uploadedById: (session.user as { id: string }).id,
    },
  })

  let created = 0
  let updated = 0

  for (const b of result.bookings) {
    const isExisting = existingKeys.has(`${b.listingId}::${b.checkIn}`)
    await prisma.villaBooking.upsert({
      where: {
        listingId_checkIn: {
          listingId: b.listingId,
          checkIn: new Date(b.checkIn),
        },
      },
      update: {
        uploadId: upload.id,
        status: b.status,
        checkOut: new Date(b.checkOut),
        source: b.source,
        accommodationFare: b.accommodationFare,
        totalPayout: b.totalPayout,
        listing: b.listing,
        guestName: b.guestName,
        numberOfNights: b.numberOfNights,
        numberOfGuests: b.numberOfGuests,
      },
      create: {
        uploadId: upload.id,
        status: b.status,
        checkIn: new Date(b.checkIn),
        checkOut: new Date(b.checkOut),
        source: b.source,
        accommodationFare: b.accommodationFare,
        totalPayout: b.totalPayout,
        listing: b.listing,
        listingId: b.listingId,
        guestName: b.guestName,
        numberOfNights: b.numberOfNights,
        numberOfGuests: b.numberOfGuests,
      },
    })
    if (isExisting) updated++; else created++
  }

  return NextResponse.json(
    {
      uploadId: upload.id,
      parsed: result.bookings.length,
      created,
      updated,
      upserted: created + updated,
      skipped: result.skipped,
      errors: result.errors,
    },
    { status: 201 }
  )
}, ['admin', 'finance'])
