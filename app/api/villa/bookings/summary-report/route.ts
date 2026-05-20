import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/guards'
import { prisma } from '@/lib/db'
import ExcelJS from 'exceljs'
import { fixEncoding } from '@/lib/parsers/villaBooking'

const MGMT_FEE_RATE = 0.17
const SVC_RATE = 0.03
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

function safeName(name: string): string {
  // Excel sheet name: max 31 chars, no special chars: \ / ? * [ ]
  return name.replace(/[\\/?*[\]]/g, '').slice(0, 31)
}

function otaAccomm(source: string, csvFare: number, totalPayout: number): number {
  const s = source.toLowerCase()
  if (s.startsWith('airbnb')) return csvFare / 1.15
  if (s === 'booking.com')    return totalPayout  // Booking.com: ACCOMM FARE = NETT
  return csvFare
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10)
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
    orderBy: { checkIn: 'asc' },
  })

  if (bookings.length === 0) {
    return NextResponse.json({ error: 'Tidak ada data untuk diekspor.' }, { status: 404 })
  }

  // Aggregate by listing
  const grouped = new Map<string, { gross: number; nett: number; count: number; nights: number }>()
  for (const b of bookings) {
    const listingKey = fixEncoding(b.listing)
    if (!grouped.has(listingKey)) grouped.set(listingKey, { gross: 0, nett: 0, count: 0, nights: 0 })
    const g = grouped.get(listingKey)!
    const nettRaw = parseFloat(b.totalPayout.toString())
    const gross   = Math.max(parseFloat(b.accommodationFare.toString()), nettRaw) // GROSS always ≥ NETT
    g.gross  += gross
    g.nett   += nettRaw
    g.count++
    g.nights += b.numberOfNights ?? 0
  }

  // Total days in period (for OCC% = nights / totalDays)
  let totalDays = 30
  if (from && to) {
    totalDays = Math.round(
      (new Date(to).getTime() - new Date(from).getTime()) / 86400000
    ) + 1
  }

  const wb = new ExcelJS.Workbook()
  wb.creator = 'BSpace Finance'
  wb.created = new Date()

  // Shared border styles
  const whiteBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FFFFFFFF' } },
    bottom: { style: 'thin', color: { argb: 'FFFFFFFF' } },
    left: { style: 'thin', color: { argb: 'FFFFFFFF' } },
    right: { style: 'thin', color: { argb: 'FFFFFFFF' } },
  }
  const hairBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'hair', color: { argb: 'FFD0D5DD' } },
    bottom: { style: 'hair', color: { argb: 'FFD0D5DD' } },
    left: { style: 'hair', color: { argb: 'FFD0D5DD' } },
    right: { style: 'hair', color: { argb: 'FFD0D5DD' } },
  }

  // ═══════════════════════════════════════════════════════════════
  // SHEET 1: REKAPITULASI (per-villa OCC + Revenue NETT overview)
  // ═══════════════════════════════════════════════════════════════
  const wsR = wb.addWorksheet('REKAPITULASI')

  // A spacer | B VILLA | C % OCC | D REVENUE NETT | E NIGHT | F AVERAGE
  const rColWidths = [3, 36, 10, 18, 10, 18]
  rColWidths.forEach((w, i) => { wsR.getColumn(i + 1).width = w })

  // Row 1: "REAL [PERIOD]" title
  wsR.mergeCells('B1:F1')
  const rTitle = wsR.getCell('B1')
  rTitle.value = `REAL ${fmtPeriod(from, to).toUpperCase()}`
  rTitle.font = { bold: true, size: 13, name: 'Arial', color: { argb: 'FF1E3A5F' } }
  rTitle.alignment = { horizontal: 'left', vertical: 'middle' }
  wsR.getRow(1).height = 22

  // Row 2: sub-info
  wsR.mergeCells('B2:F2')
  wsR.getCell('B2').value = `Total ${grouped.size} Villa · Periode: ${fmtPeriod(from, to)} · ${totalDays} hari`
  wsR.getCell('B2').font = { size: 10, name: 'Arial', color: { argb: 'FF555555' } }
  wsR.getRow(2).height = 14

  // Row 3: blank
  wsR.getRow(3).height = 6

  // Row 4: Header
  const rHdrDefs: { col: string; label: string; argb: string }[] = [
    { col: 'B', label: 'VILLA',        argb: 'FF1E3A5F' },
    { col: 'C', label: '% OCC',        argb: 'FF2E4F6F' },
    { col: 'D', label: 'REVENUE NETT', argb: 'FF1E6B3A' },
    { col: 'E', label: 'NIGHT',        argb: 'FF2E4F6F' },
    { col: 'F', label: 'AVERAGE',      argb: 'FF2E4F6F' },
  ]
  for (const { col, label, argb } of rHdrDefs) {
    const cell = wsR.getCell(`${col}4`)
    cell.value = label
    cell.font = headerFont
    cell.fill = headerFill(argb)
    cell.alignment = centerAlign
    cell.border = whiteBorder
  }
  wsR.getRow(4).height = 16

  // Data rows — sorted by listing name
  const R_START = 5
  const rekapList = Array.from(grouped.entries()).sort((a, b) => a[0].localeCompare(b[0]))

  rekapList.forEach(([listing, agg], idx) => {
    const r = R_START + idx
    const row = wsR.getRow(r)
    row.height = 15
    const isEven = idx % 2 === 1
    const occ = Math.min(1, totalDays > 0 ? agg.nights / totalDays : 0)
    const avg = agg.nights > 0 ? agg.nett / agg.nights : 0

    const fillStyle = isEven
      ? headerFill('FFF5F7FA')
      : ({ type: 'pattern', pattern: 'none' } as ExcelJS.Fill)

    const setR = (col: number, value: ExcelJS.CellValue, opts: {
      numFmt?: string; align?: Partial<ExcelJS.Alignment>; bold?: boolean
    } = {}) => {
      const cell = row.getCell(col)
      cell.value = value
      cell.font = opts.bold ? boldFont : dataFont
      if (opts.numFmt) cell.numFmt = opts.numFmt
      if (opts.align) cell.alignment = opts.align
      cell.fill = fillStyle
      cell.border = hairBorder
    }

    row.getCell(1).fill = fillStyle
    row.getCell(1).border = hairBorder

    setR(2, listing.split(' / ')[0].trim())
    setR(3, occ,      { numFmt: '0.0%',  align: centerAlign })
    setR(4, agg.nett, { numFmt: idrFmt,  align: rightAlign, bold: true })
    setR(5, agg.nights,                  { align: centerAlign })
    setR(6, avg,      { numFmt: idrFmt,  align: rightAlign })
  })

  // Total row
  const rTotalRow = R_START + rekapList.length
  const rTotNights = rekapList.reduce((s, [, a]) => s + a.nights, 0)
  const rTotNett   = rekapList.reduce((s, [, a]) => s + a.nett, 0)
  const rTotAvg    = rTotNights > 0 ? rTotNett / rTotNights : 0

  const rTr = wsR.getRow(rTotalRow)
  rTr.height = 18

  wsR.mergeCells(`B${rTotalRow}:C${rTotalRow}`)
  rTr.getCell(2).value = `TOTAL (${rekapList.length} Villa)`
  rTr.getCell(2).font = { ...boldFont, color: { argb: 'FFFFFFFF' } }
  rTr.getCell(2).fill = headerFill('FF1E3A5F')
  rTr.getCell(2).alignment = { horizontal: 'left', vertical: 'middle' }

  // D: Revenue NETT total
  rTr.getCell(4).value = { formula: `SUM(D${R_START}:D${rTotalRow - 1})`, result: rTotNett }
  rTr.getCell(4).numFmt = idrFmt
  rTr.getCell(4).font = { ...boldFont, color: { argb: 'FFFFFFFF' } }
  rTr.getCell(4).fill = headerFill('FF1E6B3A')
  rTr.getCell(4).alignment = rightAlign

  // E: Night total
  rTr.getCell(5).value = { formula: `SUM(E${R_START}:E${rTotalRow - 1})`, result: rTotNights }
  rTr.getCell(5).font = { ...boldFont, color: { argb: 'FFFFFFFF' } }
  rTr.getCell(5).fill = headerFill('FF1E3A5F')
  rTr.getCell(5).alignment = centerAlign

  // F: Overall average
  rTr.getCell(6).value = { formula: `IF(E${rTotalRow}=0,0,D${rTotalRow}/E${rTotalRow})`, result: rTotAvg }
  rTr.getCell(6).numFmt = idrFmt
  rTr.getCell(6).font = { ...boldFont, color: { argb: 'FFFFFFFF' } }
  rTr.getCell(6).fill = headerFill('FF1E3A5F')
  rTr.getCell(6).alignment = rightAlign

  for (let c = 1; c <= 6; c++) {
    const cell = rTr.getCell(c)
    if (!cell.fill || (cell.fill as ExcelJS.FillPattern).fgColor === undefined) {
      cell.fill = headerFill('FF1E3A5F')
    }
    cell.border = { top: { style: 'thin', color: { argb: 'FFAAAAAA' } }, bottom: { style: 'thin', color: { argb: 'FFAAAAAA' } } }
  }

  wsR.autoFilter = 'B4:F4'
  wsR.views = [{ state: 'frozen', ySplit: 4 }]

  // ═══════════════════════════════════════════════════════════════
  // SHEET 2: LAPORAN MINGGUAN (summary — one row per listing)
  // ═══════════════════════════════════════════════════════════════
  const ws = wb.addWorksheet('LAPORAN MINGGUAN')

  // Column widths: A(spacer) B(listing) C(count) D(gross) E(ota) F(nett) G(exp) H(pb1) I(mgmt) J(owner)
  const colWidths = [3, 36, 10, 16, 16, 16, 16, 14, 16, 16]
  colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w })

  // ── Row 1: Brand title
  ws.mergeCells('B1:J1')
  const brandCell = ws.getCell('B1')
  brandCell.value = 'BSpace Finance — Villa Report Analytics'
  brandCell.font = { bold: true, size: 14, name: 'Arial', color: { argb: 'FF1E3A5F' } }
  brandCell.alignment = { horizontal: 'left', vertical: 'middle' }
  ws.getRow(1).height = 24

  // ── Row 2: Period
  ws.mergeCells('B2:J2')
  const periodCell = ws.getCell('B2')
  periodCell.value = `Periode: ${fmtPeriod(from, to)}`
  periodCell.font = { size: 10, name: 'Arial', color: { argb: 'FF555555' } }
  ws.getRow(2).height = 16

  // ── Row 3: blank
  ws.getRow(3).height = 6

  // ── Row 4: Management fee rate assumption
  ws.getCell('B4').value = 'Management Fee Rate'
  ws.getCell('B4').font = { size: 9, bold: true, name: 'Arial' }
  ws.getCell('C4').value = MGMT_FEE_RATE
  ws.getCell('C4').numFmt = pctFmt
  ws.getCell('C4').font = { size: 9, color: { argb: 'FF0000FF' }, name: 'Arial' }
  ws.getRow(4).height = 14

  const RATE_CELL = '$C$4'

  // ── Row 5: blank
  ws.getRow(5).height = 6

  // ── Rows 6–7: Two-row merged header
  ws.mergeCells('B6:B7')
  ws.mergeCells('C6:C7')

  ws.mergeCells('D6:F6')
  ws.getCell('D6').value = 'Revenue'
  ws.getCell('D6').font = headerFont
  ws.getCell('D6').fill = headerFill('FF2E4F6F')
  ws.getCell('D6').alignment = centerAlign

  ws.mergeCells('G6:G7')
  ws.mergeCells('H6:H7')
  ws.mergeCells('I6:I7')
  ws.mergeCells('J6:J7')

  const fixedHeaders: { cell: string; value: string; fillArgb: string }[] = [
    { cell: 'B6', value: 'LISTING',         fillArgb: 'FF1E3A5F' },
    { cell: 'C6', value: 'BOOKING',         fillArgb: 'FF1E3A5F' },
    { cell: 'G6', value: 'EXPENSE',         fillArgb: 'FFB8860B' },
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

  // ── Data rows starting at row 8
  const DATA_START = 8
  const listings = Array.from(grouped.entries())

  listings.forEach(([listing, agg], idx) => {
    const r = DATA_START + idx
    const row = ws.getRow(r)
    row.height = 15

    const isEven = idx % 2 === 1

    row.getCell(2).value = listing
    row.getCell(2).font = dataFont
    if (isEven) row.getCell(2).fill = headerFill('FFF5F7FA')

    row.getCell(3).value = agg.count
    row.getCell(3).alignment = centerAlign
    row.getCell(3).font = dataFont
    if (isEven) row.getCell(3).fill = headerFill('FFF5F7FA')

    row.getCell(4).value = agg.gross
    row.getCell(4).numFmt = idrFmt
    row.getCell(4).font = dataFont
    if (isEven) row.getCell(4).fill = headerFill('FFF5F7FA')

    row.getCell(5).value = { formula: `D${r}-F${r}`, result: agg.gross - agg.nett }
    row.getCell(5).numFmt = idrFmt
    row.getCell(5).font = dataFont
    if (isEven) row.getCell(5).fill = headerFill('FFF5F7FA')

    row.getCell(6).value = agg.nett
    row.getCell(6).numFmt = idrFmt
    row.getCell(6).font = dataFont
    if (isEven) row.getCell(6).fill = headerFill('FFF5F7FA')

    row.getCell(7).value = null
    row.getCell(7).numFmt = idrFmt
    row.getCell(7).fill = headerFill('FFFFFACD')
    row.getCell(7).font = { size: 9, color: { argb: 'FF0000FF' }, name: 'Arial' }

    const pb1 = agg.nett / 1.21 * 1.1 * 0.1
    row.getCell(8).value = { formula: `F${r}/1.21*1.1*0.1`, result: pb1 }
    row.getCell(8).numFmt = idrFmt
    row.getCell(8).font = dataFont
    if (isEven) row.getCell(8).fill = headerFill('FFF5F7FA')

    const mgmt = agg.gross * MGMT_FEE_RATE
    row.getCell(9).value = { formula: `D${r}*${RATE_CELL}`, result: mgmt }
    row.getCell(9).numFmt = idrFmt
    row.getCell(9).font = dataFont
    if (isEven) row.getCell(9).fill = headerFill('FFF5F7FA')

    const owner = agg.gross - pb1 - mgmt
    row.getCell(10).value = { formula: `D${r}-G${r}-H${r}-I${r}`, result: owner }
    row.getCell(10).numFmt = idrFmt
    row.getCell(10).font = { ...dataFont, bold: true }
    row.getCell(10).fill = headerFill(isEven ? 'FFD4EDDA' : 'FFE8F5E9')

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

  // ── Pre-compute totals
  const totGross  = listings.reduce((s, [, a]) => s + a.gross, 0)
  const totNett   = listings.reduce((s, [, a]) => s + a.nett, 0)
  const totOTA    = totGross - totNett
  const totPB1    = listings.reduce((s, [, a]) => s + (a.nett / 1.21 * 1.1 * 0.1), 0)
  const totMgmt   = totGross * MGMT_FEE_RATE
  const totOwner  = totGross - totPB1 - totMgmt

  // ── Total row
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
    { col: 7,  letter: 'G', result: 0         },
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

  ws.views = [{ state: 'frozen', ySplit: 7 }]

  // ═══════════════════════════════════════════════════════════════
  // SHEETS 2+: Per-listing INCOME detail tabs
  // ═══════════════════════════════════════════════════════════════

  // Group individual bookings by listing
  const byListing = new Map<string, typeof bookings>()
  for (const b of bookings) {
    const key = fixEncoding(b.listing)
    if (!byListing.has(key)) byListing.set(key, [])
    byListing.get(key)!.push(b)
  }

  for (const [listingName, listingBookings] of Array.from(byListing.entries())) {
    const shortName = listingName.split(' / ')[0].trim()
    const sheetName = safeName(shortName)
    const ws2 = wb.addWorksheet(sheetName)

    // 21-column layout: A spacer | B DATE BOOKING | C NAME | D ROOM | E DATE STAY | F NIGHT | G OTA
    //   H REVENUE GROSS | I ACCOMM FARE | J DISC | K FEE OTA | L TAX | M ALL REDUCTION
    //   N REVENUE NETT | O REVENUE | P /NIGHT | Q TAX | R SC | S PB1 | T NETT AFTER PB1 | U /NIGHT
    const cw = [3, 12, 20, 10, 20, 7, 10, 14, 14, 10, 12, 12, 14, 14, 14, 10, 12, 10, 12, 16, 10]
    cw.forEach((w, i) => { ws2.getColumn(i + 1).width = w })

    // ── Row 1: Brand + listing title
    ws2.mergeCells('A1:U1')
    const t1 = ws2.getCell('A1')
    t1.value = `BSpace Finance — ${shortName}`
    t1.font = { bold: true, size: 13, name: 'Arial', color: { argb: 'FF1E3A5F' } }
    t1.alignment = { horizontal: 'left', vertical: 'middle' }
    ws2.getRow(1).height = 22

    // ── Row 2: Period
    ws2.mergeCells('A2:U2')
    const t2 = ws2.getCell('A2')
    t2.value = `Periode: ${fmtPeriod(from, to)}   |   ${listingBookings.length} booking`
    t2.font = { size: 10, name: 'Arial', color: { argb: 'FF555555' } }
    ws2.getRow(2).height = 14

    // ── Row 3: Service rate ($K$3 referenced in FEE OTA formula)
    ws2.getCell('J3').value = 'SERVICE RATE'
    ws2.getCell('J3').font = { size: 9, bold: true, name: 'Arial' }
    ws2.getCell('K3').value = SVC_RATE
    ws2.getCell('K3').numFmt = pctFmt
    ws2.getCell('K3').font = { size: 9, color: { argb: 'FF0000FF' }, name: 'Arial' }
    ws2.getRow(3).height = 13
    const SVC_REF = '$K$3'

    // ── Row 4: blank
    ws2.getRow(4).height = 6

    // ── Rows 5–6: Two-row header; E and K have sub-labels in row 6
    const grayInputCols2 = ['B', 'C', 'D', 'F', 'G', 'H', 'I']  // I = ACCOMM FARE (raw input)
    const mergedCols2 = ['B', 'C', 'D', 'F', 'G', 'H', 'I', 'J', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U']
    for (const col of mergedCols2) ws2.mergeCells(`${col}5:${col}6`)

    const HEADERS2: { col: string; label: string }[] = [
      { col: 'B', label: 'DATE\nBOOKING'    },
      { col: 'C', label: 'NAME'             },
      { col: 'D', label: 'ROOM'             },
      { col: 'E', label: 'DATE STAY'        },
      { col: 'F', label: 'NIGHT'            },
      { col: 'G', label: 'OTA'              },
      { col: 'H', label: 'REVENUE\nGROSS'  },
      { col: 'I', label: 'ACCOMM\nFARE'    },
      { col: 'J', label: 'DISC'             },
      { col: 'K', label: 'FEE OTA'          },
      { col: 'L', label: 'TAX'              },
      { col: 'M', label: 'ALL\nREDUCTION'  },
      { col: 'N', label: 'REVENUE\nNETT'   },
      { col: 'O', label: 'REVENUE'          },
      { col: 'P', label: '/ NIGHT'          },
      { col: 'Q', label: 'TAX'              },
      { col: 'R', label: 'SC'               },
      { col: 'S', label: 'PB1'              },
      { col: 'T', label: 'NETT\nAFTER PB1' },
      { col: 'U', label: '/ NIGHT'          },
    ]

    ws2.getRow(5).height = 28
    ws2.getRow(6).height = 14

    for (const { col, label } of HEADERS2) {
      const isGray = grayInputCols2.includes(col)
      const cell = ws2.getCell(`${col}5`)
      cell.value = label
      cell.fill = headerFill(isGray ? 'FFD0CECE' : 'FF1E3A5F')
      cell.font = isGray
        ? { bold: true, size: 9, name: 'Arial' }
        : col === 'S'
          ? { bold: true, size: 9, name: 'Arial', color: { argb: 'FFFF0000' } }
          : headerFont
      cell.alignment = { ...centerAlign, wrapText: true }
      cell.border = whiteBorder
    }

    // Row 6 sub-labels (E = date sub, K = service rate %)
    for (const { col, label } of [
      { col: 'E', label: 'Booking'                           },
      { col: 'K', label: `${(SVC_RATE * 100).toFixed(0)}%`  },
    ]) {
      const cell = ws2.getCell(`${col}6`)
      cell.value = label
      cell.fill = headerFill('FF1E3A5F')
      cell.font = headerFont
      cell.alignment = centerAlign
      cell.border = whiteBorder
    }

    // ── Data rows starting at row 7
    const D2 = 7
    let totGross2 = 0, totAccomm2 = 0, totFeeOTA2 = 0, totTax2 = 0, totAllRed2 = 0
    let totNett2 = 0, totTaxBase2 = 0, totSC2 = 0, totPB12 = 0, totNettPB12 = 0

    listingBookings.forEach((b, idx) => {
      const r = D2 + idx
      const row = ws2.getRow(r)
      row.height = 14

      const isEven = idx % 2 === 1
      const bgArgb = isEven ? 'FFF5F7FA' : 'FFFFFFFF'

      const revNett   = parseFloat(b.totalPayout.toString())               // N: REVENUE NETT
      const accomm    = otaAccomm(b.source, parseFloat(b.accommodationFare.toString()), revNett) // I: OTA base fare (Booking.com = NETT)
      const gross     = Math.max(accomm, revNett)                          // H: GROSS always ≥ NETT
      const feeOTA    = gross * SVC_RATE                                    // K: 3%
      const taxSel    = Math.max(0, gross - feeOTA - revNett)              // L: MAX(0, delta)
      const allRed    = feeOTA + taxSel                                     // M
      const nights    = b.numberOfNights ?? 0
      const taxBase   = revNett / 1.21                                      // Q
      const sc        = taxBase * 0.10                                      // R
      const pb1       = (taxBase + sc) * 0.10                              // S
      const nettPB1   = revNett - pb1                                       // T
      const perNight1 = nights > 0 ? revNett / nights : 0                  // P
      const perNight2 = nights > 0 ? nettPB1 / nights : 0                  // U

      totGross2   += gross
      totAccomm2  += accomm
      totFeeOTA2  += feeOTA
      totTax2     += taxSel
      totAllRed2  += allRed
      totNett2    += revNett
      totTaxBase2 += taxBase
      totSC2      += sc
      totPB12     += pb1
      totNettPB12 += nettPB1

      const checkInStr  = fmtDate(new Date(b.checkIn))
      const checkOutStr = fmtDate(new Date(b.checkOut))
      const roomCode    = fixEncoding(b.listing).split(' / ')[0].trim()

      const setCell2 = (col: number, value: ExcelJS.CellValue, opts: {
        numFmt?: string; align?: Partial<ExcelJS.Alignment>; font?: Partial<ExcelJS.Font>; forceArgb?: string
      } = {}) => {
        const cell = row.getCell(col)
        cell.value = value
        cell.font = opts.font ?? dataFont
        if (opts.numFmt) cell.numFmt = opts.numFmt
        if (opts.align) cell.alignment = opts.align
        cell.fill = opts.forceArgb
          ? headerFill(opts.forceArgb)
          : isEven ? headerFill(bgArgb) : { type: 'pattern', pattern: 'none' } as ExcelJS.Fill
        cell.border = hairBorder
      }

      row.getCell(1).fill = isEven ? headerFill(bgArgb) : { type: 'pattern', pattern: 'none' } as ExcelJS.Fill
      row.getCell(1).border = hairBorder

      setCell2(2,  checkInStr, { align: centerAlign })                                                                 // B: DATE BOOKING
      setCell2(3,  b.guestName ?? '')                                                                                  // C: NAME
      setCell2(4,  roomCode)                                                                                           // D: ROOM
      setCell2(5,  `${checkInStr} — ${checkOutStr}`, { align: centerAlign })                                          // E: DATE STAY
      setCell2(6,  nights, { align: centerAlign })                                                                     // F: NIGHT
      setCell2(7,  b.source ?? '', { align: centerAlign })                                                             // G: OTA
      setCell2(8,  gross,  { numFmt: idrFmt, align: rightAlign })                                                      // H: REVENUE GROSS
      setCell2(9,  accomm, { numFmt: idrFmt, align: rightAlign, font: { size: 9, color: { argb: 'FF555555' }, name: 'Arial' } }) // I: ACCOMM FARE
      setCell2(10, 0, { numFmt: idrFmt, align: rightAlign, font: { size: 9, color: { argb: 'FF0000FF' }, name: 'Arial' }, forceArgb: 'FFFFFACD' }) // J: DISC (manual)
      setCell2(11, { formula: `H${r}*${SVC_REF}`, result: feeOTA },              { numFmt: idrFmt, align: rightAlign }) // K: FEE OTA
      setCell2(12, { formula: `MAX(0,H${r}-K${r}-N${r})`, result: taxSel },      { numFmt: idrFmt, align: rightAlign }) // L: TAX
      setCell2(13, { formula: `J${r}+K${r}+L${r}`, result: allRed },             { numFmt: idrFmt, align: rightAlign }) // M: ALL REDUCTION
      setCell2(14, revNett, { numFmt: idrFmt, align: rightAlign, font: boldFont })                                      // N: REVENUE NETT
      setCell2(15, { formula: `N${r}`, result: revNett },                         { numFmt: idrFmt, align: rightAlign }) // O: REVENUE
      setCell2(16, { formula: `IF(F${r}=0,0,O${r}/F${r})`, result: perNight1 },  { numFmt: idrFmt, align: rightAlign }) // P: /NIGHT
      setCell2(17, { formula: `N${r}/1.21`, result: taxBase },                    { numFmt: idrFmt, align: rightAlign }) // Q: TAX
      setCell2(18, { formula: `Q${r}*10%`, result: sc },                          { numFmt: idrFmt, align: rightAlign }) // R: SC
      setCell2(19, { formula: `(Q${r}+R${r})*10%`, result: pb1 },                { numFmt: idrFmt, align: rightAlign, font: { bold: true, size: 9, name: 'Arial', color: { argb: 'FFFF0000' } } }) // S: PB1
      setCell2(20, { formula: `N${r}-S${r}`, result: nettPB1 },                  { numFmt: idrFmt, align: rightAlign, font: boldFont }) // T: NETT AFTER PB1
      setCell2(21, { formula: `IF(F${r}=0,0,T${r}/F${r})`, result: perNight2 },  { numFmt: idrFmt, align: rightAlign }) // U: /NIGHT
    })

    // ── Total row
    const totRow2 = D2 + listingBookings.length
    const tr2 = ws2.getRow(totRow2)
    tr2.height = 17

    ws2.mergeCells(`A${totRow2}:G${totRow2}`)
    tr2.getCell(1).value = `TOTAL (${listingBookings.length} Booking)`
    tr2.getCell(1).font = { ...boldFont, color: { argb: 'FFFFFFFF' } }
    tr2.getCell(1).fill = headerFill('FF1E3A5F')
    tr2.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' }

    const totDefs2: { col: number; letter: string; result: number; fillArgb: string; blank?: boolean }[] = [
      { col: 8,  letter: 'H', result: totGross2,    fillArgb: 'FFFFCC00' },
      { col: 9,  letter: 'I', result: totAccomm2,   fillArgb: 'FFFFCC00' },
      { col: 10, letter: 'J', result: 0,            fillArgb: 'FF1E3A5F' },
      { col: 11, letter: 'K', result: totFeeOTA2,   fillArgb: 'FF1E3A5F' },
      { col: 12, letter: 'L', result: totTax2,      fillArgb: 'FF1E3A5F' },
      { col: 13, letter: 'M', result: totAllRed2,   fillArgb: 'FF1E3A5F' },
      { col: 14, letter: 'N', result: totNett2,     fillArgb: 'FFFFCC00' },
      { col: 15, letter: 'O', result: totNett2,     fillArgb: 'FFFFCC00' },
      { col: 16, letter: 'P', result: 0, blank: true, fillArgb: 'FF1E3A5F' },
      { col: 17, letter: 'Q', result: totTaxBase2,  fillArgb: 'FF1E3A5F' },
      { col: 18, letter: 'R', result: totSC2,       fillArgb: 'FF1E3A5F' },
      { col: 19, letter: 'S', result: totPB12,      fillArgb: 'FF1E3A5F' },
      { col: 20, letter: 'T', result: totNettPB12,  fillArgb: 'FF1E6B3A' },
      { col: 21, letter: 'U', result: 0, blank: true, fillArgb: 'FF1E3A5F' },
    ]

    const allTotCols2 = new Set(totDefs2.map(d => d.col))
    for (let c = 2; c <= 21; c++) {
      if (!allTotCols2.has(c)) {
        tr2.getCell(c).fill = headerFill('FF1E3A5F')
        tr2.getCell(c).border = { top: { style: 'thin', color: { argb: 'FFAAAAAA' } }, bottom: { style: 'thin', color: { argb: 'FFAAAAAA' } } }
      }
    }
    for (const { col, letter, result, fillArgb, blank } of totDefs2) {
      const cell = tr2.getCell(col)
      cell.value = blank ? null : { formula: `SUM(${letter}${D2}:${letter}${totRow2 - 1})`, result }
      cell.numFmt = idrFmt
      cell.font = (col === 8 || col === 9 || col === 14 || col === 15 || col === 20)
        ? boldFont
        : { ...boldFont, color: { argb: 'FFFFFFFF' } }
      cell.fill = headerFill(fillArgb)
      cell.alignment = rightAlign
      cell.border = { top: { style: 'thin', color: { argb: 'FFAAAAAA' } }, bottom: { style: 'thin', color: { argb: 'FFAAAAAA' } } }
    }

    ws2.views = [{ state: 'frozen', ySplit: 6 }]
  }

  // Force Excel to recalculate all formulas on open
  wb.calcProperties = { fullCalcOnLoad: true }

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
