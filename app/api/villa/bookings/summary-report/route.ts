import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/guards'
import { prisma } from '@/lib/db'
import ExcelJS from 'exceljs'
import { fixEncoding } from '@/lib/parsers/villaBooking'

const MGMT_FEE_RATE = 0.17
const idrFmt = '#,##0'
const pctFmt = '0.00%'

const headerFill = (argb: string): ExcelJS.Fill => ({
  type: 'pattern', pattern: 'solid', fgColor: { argb },
})

const headerFont: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9, name: 'Arial' }
const dataFont: Partial<ExcelJS.Font> = { size: 9, name: 'Arial' }
const boldFont: Partial<ExcelJS.Font> = { bold: true, size: 9, name: 'Arial' }
const centerAlign: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle' }
const rightAlign: Partial<ExcelJS.Alignment> = { horizontal: 'right', vertical: 'middle' }

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
    orderBy: { listing: 'asc' },
  })

  if (bookings.length === 0) {
    return NextResponse.json({ error: 'Tidak ada data untuk diekspor.' }, { status: 404 })
  }

  // Aggregate by listing — NETT = GROSS × (1 − 3%) to keep NETT always < GROSS
  const grouped = new Map<string, { gross: number; nett: number; count: number }>()
  for (const b of bookings) {
    const listingKey = fixEncoding(b.listing)
    if (!grouped.has(listingKey)) grouped.set(listingKey, { gross: 0, nett: 0, count: 0 })
    const g = grouped.get(listingKey)!
    const gross = parseFloat(b.accommodationFare.toString())
    g.gross += gross
    g.nett  += gross * (1 - 0.03)   // NETT = GROSS − 3% SERVICE
    g.count++
  }

  const wb = new ExcelJS.Workbook()
  wb.creator = 'BSpace Finance'
  wb.created = new Date()

  const ws = wb.addWorksheet('LAPORAN MINGGUAN')

  // Column widths: A(spacer) B(listing) C(count) D(gross) E(ota) F(nett) G(exp) H(pb1) I(mgmt) J(owner)
  const colWidths = [3, 36, 10, 16, 16, 16, 16, 14, 16, 16]
  colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w })

  // ── Row 1: Brand title ──────────────────────────────────────────────────────
  ws.mergeCells('B1:J1')
  const brandCell = ws.getCell('B1')
  brandCell.value = 'BSpace Finance — Villa Report Analytics'
  brandCell.font = { bold: true, size: 14, name: 'Arial', color: { argb: 'FF1E3A5F' } }
  brandCell.alignment = { horizontal: 'left', vertical: 'middle' }
  ws.getRow(1).height = 24

  // ── Row 2: Period ───────────────────────────────────────────────────────────
  ws.mergeCells('B2:J2')
  const periodCell = ws.getCell('B2')
  periodCell.value = `Periode: ${fmtPeriod(from, to)}`
  periodCell.font = { size: 10, name: 'Arial', color: { argb: 'FF555555' } }
  ws.getRow(2).height = 16

  // ── Row 3: blank ────────────────────────────────────────────────────────────
  ws.getRow(3).height = 6

  // ── Row 4: Management fee rate assumption ───────────────────────────────────
  ws.getCell('B4').value = 'Management Fee Rate'
  ws.getCell('B4').font = { size: 9, bold: true, name: 'Arial' }
  ws.getCell('C4').value = MGMT_FEE_RATE
  ws.getCell('C4').numFmt = pctFmt
  ws.getCell('C4').font = { size: 9, color: { argb: 'FF0000FF' }, name: 'Arial' }  // blue = input
  ws.getRow(4).height = 14

  // Rate cell reference (C4) used in Management formulas
  const RATE_CELL = '$C$4'

  // ── Row 5: blank ────────────────────────────────────────────────────────────
  ws.getRow(5).height = 6

  // ── Rows 6–7: Two-row merged header (like CONTOH HITUNGAN GLOBAL) ───────────
  // Row 6: group labels
  ws.mergeCells('B6:B7')
  ws.mergeCells('C6:C7')

  // Financial group header spanning D–F (Revenue group)
  ws.mergeCells('D6:F6')
  ws.getCell('D6').value = 'Revenue'
  ws.getCell('D6').font = headerFont
  ws.getCell('D6').fill = headerFill('FF2E4F6F')
  ws.getCell('D6').alignment = centerAlign

  ws.mergeCells('G6:G7')
  ws.mergeCells('H6:H7')
  ws.mergeCells('I6:I7')
  ws.mergeCells('J6:J7')

  // Row 6 fixed labels
  const fixedHeaders: { cell: string; value: string; fillArgb: string }[] = [
    { cell: 'B6', value: 'LISTING',         fillArgb: 'FF1E3A5F' },
    { cell: 'C6', value: 'BOOKING',         fillArgb: 'FF1E3A5F' },
    { cell: 'G6', value: 'EXPENSE',         fillArgb: 'FFB8860B' },  // amber — manual input
    { cell: 'H6', value: 'PB1',             fillArgb: 'FF1E3A5F' },
    { cell: 'I6', value: `MGMT (${(MGMT_FEE_RATE * 100).toFixed(0)}%)`, fillArgb: 'FF1E3A5F' },
    { cell: 'J6', value: 'OWNER PAYOUT',    fillArgb: 'FF1E6B3A' },
  ]
  for (const { cell, value, fillArgb } of fixedHeaders) {
    ws.getCell(cell).value = value
    ws.getCell(cell).font = headerFont
    ws.getCell(cell).fill = headerFill(fillArgb)
    ws.getCell(cell).alignment = centerAlign
  }

  // Row 7: Revenue sub-headers
  const subHeaders: { cell: string; value: string }[] = [
    { cell: 'D7', value: 'GROSS' },
    { cell: 'E7', value: 'OTA & TAX' },
    { cell: 'F7', value: 'NETT' },
  ]
  for (const { cell, value } of subHeaders) {
    ws.getCell(cell).value = value
    ws.getCell(cell).font = headerFont
    ws.getCell(cell).fill = headerFill('FF2E4F6F')
    ws.getCell(cell).alignment = centerAlign
  }

  ws.getRow(6).height = 16
  ws.getRow(7).height = 14

  // ── Data rows starting at row 8 ─────────────────────────────────────────────
  const DATA_START = 8
  const listings = Array.from(grouped.entries())

  listings.forEach(([listing, agg], idx) => {
    // listing key is already fixEncoded from the grouping step
    const r = DATA_START + idx
    const row = ws.getRow(r)
    row.height = 15

    const isEven = idx % 2 === 1

    // Listing name
    row.getCell(2).value = listing
    row.getCell(2).font = dataFont
    if (isEven) row.getCell(2).fill = headerFill('FFF5F7FA')

    // Booking count
    row.getCell(3).value = agg.count
    row.getCell(3).alignment = centerAlign
    row.getCell(3).font = dataFont
    if (isEven) row.getCell(3).fill = headerFill('FFF5F7FA')

    // Gross (col D = col 4)
    row.getCell(4).value = agg.gross
    row.getCell(4).numFmt = idrFmt
    row.getCell(4).font = dataFont
    if (isEven) row.getCell(4).fill = headerFill('FFF5F7FA')

    // OTA & Tax = Gross - NETT (formula)
    row.getCell(5).value = { formula: `D${r}-F${r}`, result: agg.gross - agg.nett }
    row.getCell(5).numFmt = idrFmt
    row.getCell(5).font = dataFont
    if (isEven) row.getCell(5).fill = headerFill('FFF5F7FA')

    // NETT (col F = col 6)
    row.getCell(6).value = agg.nett
    row.getCell(6).numFmt = idrFmt
    row.getCell(6).font = dataFont
    if (isEven) row.getCell(6).fill = headerFill('FFF5F7FA')

    // Expense — blank, yellow (manual input)
    row.getCell(7).value = null
    row.getCell(7).numFmt = idrFmt
    row.getCell(7).fill = headerFill('FFFFFACD')
    row.getCell(7).font = { size: 9, color: { argb: 'FF0000FF' }, name: 'Arial' }

    // PB1 = NETT/1.21 * 1.1 * 0.1
    const pb1 = agg.nett / 1.21 * 1.1 * 0.1
    row.getCell(8).value = { formula: `F${r}/1.21*1.1*0.1`, result: pb1 }
    row.getCell(8).numFmt = idrFmt
    row.getCell(8).font = dataFont
    if (isEven) row.getCell(8).fill = headerFill('FFF5F7FA')

    // Management Fee = Gross × rate
    const mgmt = agg.gross * MGMT_FEE_RATE
    row.getCell(9).value = { formula: `D${r}*${RATE_CELL}`, result: mgmt }
    row.getCell(9).numFmt = idrFmt
    row.getCell(9).font = dataFont
    if (isEven) row.getCell(9).fill = headerFill('FFF5F7FA')

    // Owner Payout = Gross - Expense - PB1 - Mgmt
    const owner = agg.gross - 0 - pb1 - mgmt  // expense = 0 until staff fills in
    row.getCell(10).value = { formula: `D${r}-G${r}-H${r}-I${r}`, result: owner }
    row.getCell(10).numFmt = idrFmt
    row.getCell(10).font = { ...dataFont, bold: true }
    row.getCell(10).fill = headerFill(isEven ? 'FFD4EDDA' : 'FFE8F5E9')

    // Border
    for (let c = 2; c <= 10; c++) {
      const cell = row.getCell(c)
      cell.border = {
        top: { style: 'hair', color: { argb: 'FFD0D5DD' } },
        bottom: { style: 'hair', color: { argb: 'FFD0D5DD' } },
        left: { style: 'hair', color: { argb: 'FFD0D5DD' } },
        right: { style: 'hair', color: { argb: 'FFD0D5DD' } },
      }
    }
  })

  // ── Pre-compute totals for accurate result values ────────────────────────────
  const totGross  = listings.reduce((s, [, a]) => s + a.gross, 0)
  const totNett   = listings.reduce((s, [, a]) => s + a.nett, 0)
  const totOTA    = totGross - totNett
  const totPB1    = listings.reduce((s, [, a]) => s + (a.nett / 1.21 * 1.1 * 0.1), 0)
  const totMgmt   = totGross * MGMT_FEE_RATE
  const totOwner  = totGross - totPB1 - totMgmt  // expense = 0 until staff fills in

  // ── Total row ────────────────────────────────────────────────────────────────
  const totalRow = DATA_START + listings.length
  const tr = ws.getRow(totalRow)
  tr.height = 18

  ws.mergeCells(`B${totalRow}:C${totalRow}`)
  tr.getCell(2).value = `TOTAL (${listings.length} Listing)`
  tr.getCell(2).font = { ...boldFont, color: { argb: 'FFFFFFFF' } }
  tr.getCell(2).fill = headerFill('FF1E3A5F')
  tr.getCell(2).alignment = { horizontal: 'left', vertical: 'middle' }

  const totalCols: { col: number; letter: string; result: number }[] = [
    { col: 4,  letter: 'D', result: totGross  },
    { col: 5,  letter: 'E', result: totOTA    },
    { col: 6,  letter: 'F', result: totNett   },
    { col: 7,  letter: 'G', result: 0         },  // Expense: manual, 0 placeholder
    { col: 8,  letter: 'H', result: totPB1    },
    { col: 9,  letter: 'I', result: totMgmt   },
    { col: 10, letter: 'J', result: totOwner  },
  ]

  for (const { col, letter, result } of totalCols) {
    const cell = tr.getCell(col)
    const formula = letter === 'E'
      ? `D${totalRow}-F${totalRow}`
      : `SUM(${letter}${DATA_START}:${letter}${totalRow - 1})`
    cell.value = { formula, result }
    cell.numFmt = idrFmt
    cell.font = { ...boldFont, color: { argb: 'FFFFFFFF' } }
    cell.fill = headerFill(col === 10 ? 'FF1E6B3A' : col === 7 ? 'FF9B7D00' : 'FF1E3A5F')
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFFFFFFF' } },
      bottom: { style: 'thin', color: { argb: 'FFFFFFFF' } },
    }
  }

  // Force Excel to recalculate all formulas on open
  wb.calcProperties = { fullCalcOnLoad: true }

  // Freeze header rows
  ws.views = [{ state: 'frozen', ySplit: 7 }]

  const buffer = await wb.xlsx.writeBuffer()

  const dateStr = new Date().toISOString().slice(0, 10)
  const periodSlug = from && to ? `${from}_${to}` : from || to || 'all'
  const filename = `laporan-mingguan-${periodSlug}-${dateStr}.xlsx`

  return new NextResponse(Buffer.from(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}, ['admin', 'finance', 'manager'])
