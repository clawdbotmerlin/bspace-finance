import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/guards'
import { prisma } from '@/lib/db'
import ExcelJS from 'exceljs'

const idrFmt = '#,##0'

const headerFill = (argb: string): ExcelJS.Fill => ({
  type: 'pattern', pattern: 'solid', fgColor: { argb },
})

function fmtDate(d: Date): string {
  return d.toLocaleDateString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
  })
}

function fmtPeriod(from: string | null, to: string | null): string {
  const opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }
  if (from && to) {
    const f = new Date(from).toLocaleDateString('id-ID', opts)
    const t = new Date(to).toLocaleDateString('id-ID', opts)
    return from === to ? f : `${f} — ${t}`
  }
  if (from) return `Ab ${new Date(from).toLocaleDateString('id-ID', opts)}`
  if (to) return `s/d ${new Date(to).toLocaleDateString('id-ID', opts)}`
  return 'Semua Periode'
}

export const GET = withAuth(async (req: NextRequest) => {
  const { searchParams } = req.nextUrl
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const listingFilter = searchParams.get('listing')

  const bookings = await prisma.villaBooking.findMany({
    where: {
      checkIn: {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      },
      ...(listingFilter ? { listing: { contains: listingFilter, mode: 'insensitive' } } : {}),
    },
    orderBy: { checkIn: 'desc' },
  })

  if (bookings.length === 0) {
    return NextResponse.json({ error: 'Tidak ada data untuk diekspor.' }, { status: 404 })
  }

  const wb = new ExcelJS.Workbook()
  wb.creator = 'BSpace Finance'
  wb.created = new Date()
  wb.calcProperties = { fullCalcOnLoad: true }

  const ws = wb.addWorksheet('Data Booking')

  // Column widths
  const colWidths = [5, 14, 14, 28, 40, 8, 14, 16, 16, 14]
  colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w })

  // ── Row 1: Title ─────────────────────────────────────────────────────────────
  ws.mergeCells('A1:J1')
  ws.getCell('A1').value = 'BSpace Finance — Data Booking Villa'
  ws.getCell('A1').font = { bold: true, size: 13, name: 'Arial', color: { argb: 'FF1E3A5F' } }
  ws.getCell('A1').alignment = { horizontal: 'left', vertical: 'middle' }
  ws.getRow(1).height = 22

  // ── Row 2: Period ─────────────────────────────────────────────────────────────
  ws.mergeCells('A2:J2')
  ws.getCell('A2').value = `Periode Check-in: ${fmtPeriod(from, to)}`
  ws.getCell('A2').font = { size: 9, name: 'Arial', color: { argb: 'FF666666' } }
  ws.getRow(2).height = 14

  // ── Row 3: blank ─────────────────────────────────────────────────────────────
  ws.getRow(3).height = 6

  // ── Row 4: Headers ───────────────────────────────────────────────────────────
  const HEADERS = ['NO', 'CHECK-IN', 'CHECK-OUT', 'TAMU', 'LISTING', 'MALAM', 'OTA', 'GROSS (IDR)', 'PAYOUT (IDR)', 'STATUS']
  const headerRow = ws.getRow(4)
  headerRow.height = 16
  HEADERS.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1)
    cell.value = h
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9, name: 'Arial' }
    cell.fill = headerFill('FF1E3A5F')
    cell.alignment = { horizontal: i >= 7 ? 'right' : i === 5 ? 'center' : 'left', vertical: 'middle' }
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFFFFFFF' } },
      bottom: { style: 'thin', color: { argb: 'FFFFFFFF' } },
      left: { style: 'thin', color: { argb: 'FFFFFFFF' } },
      right: { style: 'thin', color: { argb: 'FFFFFFFF' } },
    }
  })

  // ── Data rows ─────────────────────────────────────────────────────────────────
  const DATA_START = 5
  let totalGross = 0
  let totalPayout = 0

  bookings.forEach((b, idx) => {
    const r = DATA_START + idx
    const gross = parseFloat(b.accommodationFare.toString())
    const payout = parseFloat(b.totalPayout.toString())
    totalGross += gross
    totalPayout += payout

    const row = ws.getRow(r)
    row.height = 14
    const isEven = idx % 2 === 1
    const rowFill = isEven ? headerFill('FFF5F7FA') : undefined

    const cells: { val: string | number; align?: 'left' | 'center' | 'right'; numFmt?: string; bold?: boolean }[] = [
      { val: idx + 1, align: 'center' },
      { val: fmtDate(b.checkIn) },
      { val: fmtDate(b.checkOut) },
      { val: b.guestName || '—' },
      { val: b.listing },
      { val: b.numberOfNights, align: 'center' },
      { val: b.source.toUpperCase(), align: 'center' },
      { val: gross, align: 'right', numFmt: idrFmt },
      { val: payout, align: 'right', numFmt: idrFmt },
      { val: b.status, align: 'center' },
    ]

    cells.forEach(({ val, align, numFmt }, i) => {
      const cell = row.getCell(i + 1)
      cell.value = val
      cell.font = { size: 9, name: 'Arial' }
      if (align) cell.alignment = { horizontal: align, vertical: 'middle' }
      if (numFmt) cell.numFmt = numFmt
      if (rowFill) cell.fill = rowFill
      cell.border = {
        bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } },
      }
    })
  })

  // ── Total row ─────────────────────────────────────────────────────────────────
  const totalRow = DATA_START + bookings.length
  const tr = ws.getRow(totalRow)
  tr.height = 16

  ws.mergeCells(`A${totalRow}:G${totalRow}`)
  tr.getCell(1).value = `TOTAL — ${bookings.length} Booking`
  tr.getCell(1).font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' }, name: 'Arial' }
  tr.getCell(1).fill = headerFill('FF1E3A5F')
  tr.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' }

  // Gross total
  const grossCell = tr.getCell(8)
  grossCell.value = { formula: `SUM(H${DATA_START}:H${totalRow - 1})`, result: totalGross }
  grossCell.numFmt = idrFmt
  grossCell.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' }, name: 'Arial' }
  grossCell.fill = headerFill('FF1E3A5F')
  grossCell.alignment = { horizontal: 'right', vertical: 'middle' }

  // Payout total
  const payoutCell = tr.getCell(9)
  payoutCell.value = { formula: `SUM(I${DATA_START}:I${totalRow - 1})`, result: totalPayout }
  payoutCell.numFmt = idrFmt
  payoutCell.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' }, name: 'Arial' }
  payoutCell.fill = headerFill('FF1E3A5F')
  payoutCell.alignment = { horizontal: 'right', vertical: 'middle' }

  // Status col — fill
  tr.getCell(10).fill = headerFill('FF1E3A5F')

  // Freeze header
  ws.views = [{ state: 'frozen', ySplit: 4 }]

  const buffer = await wb.xlsx.writeBuffer()

  const dateStr = new Date().toISOString().slice(0, 10)
  const periodSlug = from && to ? `${from}_${to}` : from || to || 'all'
  const filename = `data-booking-${periodSlug}-${dateStr}.xlsx`

  return new NextResponse(Buffer.from(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}, ['admin', 'finance', 'manager'])
