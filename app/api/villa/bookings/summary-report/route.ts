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

  // Aggregate by listing — NETT = GROSS × (1 − 3%) to keep NETT always < GROSS
  const grouped = new Map<string, { gross: number; nett: number; count: number }>()
  for (const b of bookings) {
    const listingKey = fixEncoding(b.listing)
    if (!grouped.has(listingKey)) grouped.set(listingKey, { gross: 0, nett: 0, count: 0 })
    const g = grouped.get(listingKey)!
    const gross = parseFloat(b.accommodationFare.toString())
    g.gross += gross
    g.nett  += parseFloat(b.totalPayout.toString())   // from Guesty
    g.count++
  }

  const wb = new ExcelJS.Workbook()
  wb.creator = 'BSpace Finance'
  wb.created = new Date()

  // ═══════════════════════════════════════════════════════════════
  // SHEET 1: LAPORAN MINGGUAN (summary — one row per listing)
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
    const sheetName = safeName(listingName)
    const ws2 = wb.addWorksheet(sheetName)

    // Column widths: A spacer | B date | C name | D listing | E stay | F night | G ota |
    //                H gross | I disc | J service | K selisih | L % | M nett | N tax | O sc | P pb1 | Q owner
    const cw = [3, 13, 22, 28, 22, 7, 14, 14, 12, 12, 12, 7, 14, 12, 10, 12, 14]
    cw.forEach((w, i) => { ws2.getColumn(i + 1).width = w })

    // ── Row 1: Brand + listing title
    ws2.mergeCells('B1:Q1')
    const t1 = ws2.getCell('B1')
    t1.value = `BSpace Finance — ${listingName}`
    t1.font = { bold: true, size: 13, name: 'Arial', color: { argb: 'FF1E3A5F' } }
    t1.alignment = { horizontal: 'left', vertical: 'middle' }
    ws2.getRow(1).height = 22

    // ── Row 2: Period
    ws2.mergeCells('B2:Q2')
    const t2 = ws2.getCell('B2')
    t2.value = `Periode: ${fmtPeriod(from, to)}`
    t2.font = { size: 10, name: 'Arial', color: { argb: 'FF555555' } }
    ws2.getRow(2).height = 14

    // ── Row 3: blank
    ws2.getRow(3).height = 6

    // ── Row 4: Service rate assumption
    ws2.getCell('B4').value = 'Service Rate (OTA)'
    ws2.getCell('B4').font = { size: 9, bold: true, name: 'Arial' }
    ws2.getCell('C4').value = SVC_RATE
    ws2.getCell('C4').numFmt = pctFmt
    ws2.getCell('C4').font = { size: 9, color: { argb: 'FF0000FF' }, name: 'Arial' }
    ws2.getRow(4).height = 13

    const SVC_REF = '$C$4'

    // ── Row 5: blank
    ws2.getRow(5).height = 6

    // ── Row 6–7: Two-row header
    // Revenue group header spanning H–M (cols 8–13)
    ws2.mergeCells('H6:M6')
    ws2.getCell('H6').value = 'Revenue'
    ws2.getCell('H6').font = headerFont
    ws2.getCell('H6').fill = headerFill('FF2E4F6F')
    ws2.getCell('H6').alignment = centerAlign

    // Fixed single-row headers (merged across both rows 6–7)
    const fixedH2: { cell: string; value: string; fillArgb: string }[] = [
      { cell: 'B6', value: 'DATE BOOKING', fillArgb: 'FF1E3A5F' },
      { cell: 'C6', value: 'NAME',         fillArgb: 'FF1E3A5F' },
      { cell: 'D6', value: 'LISTING',      fillArgb: 'FF1E3A5F' },
      { cell: 'E6', value: 'DATE STAY',    fillArgb: 'FF1E3A5F' },
      { cell: 'F6', value: 'NIGHT',        fillArgb: 'FF1E3A5F' },
      { cell: 'G6', value: 'OTA',          fillArgb: 'FF1E3A5F' },
      { cell: 'N6', value: 'TAX',          fillArgb: 'FF1E3A5F' },
      { cell: 'O6', value: 'SC',           fillArgb: 'FF1E3A5F' },
      { cell: 'P6', value: 'PB1',          fillArgb: 'FF1E3A5F' },
      { cell: 'Q6', value: 'REVENUE OWNER', fillArgb: 'FF1E6B3A' },
    ]
    const mergeCols = ['B', 'C', 'D', 'E', 'F', 'G', 'N', 'O', 'P', 'Q']
    for (const col of mergeCols) {
      ws2.mergeCells(`${col}6:${col}7`)
    }
    for (const { cell, value, fillArgb } of fixedH2) {
      ws2.getCell(cell).value = value
      ws2.getCell(cell).font = headerFont
      ws2.getCell(cell).fill = headerFill(fillArgb)
      ws2.getCell(cell).alignment = centerAlign
    }

    // Revenue sub-headers (row 7)
    const subH2: { cell: string; value: string; fillArgb: string }[] = [
      { cell: 'H7', value: 'GROSS',         fillArgb: 'FF2E4F6F' },
      { cell: 'I7', value: 'DISCOUNT',      fillArgb: 'FFB8860B' },  // amber = manual
      { cell: 'J7', value: 'SERVICE',       fillArgb: 'FF2E4F6F' },
      { cell: 'K7', value: 'SELISIH & DISC', fillArgb: 'FF2E4F6F' },
      { cell: 'L7', value: '%',             fillArgb: 'FF2E4F6F' },
      { cell: 'M7', value: 'NETT',          fillArgb: 'FF2E4F6F' },
    ]
    for (const { cell, value, fillArgb } of subH2) {
      ws2.getCell(cell).value = value
      ws2.getCell(cell).font = headerFont
      ws2.getCell(cell).fill = headerFill(fillArgb)
      ws2.getCell(cell).alignment = centerAlign
    }

    ws2.getRow(6).height = 16
    ws2.getRow(7).height = 14

    // ── Data rows starting at row 8
    const D2 = 8
    let totGross2 = 0
    let totNett2  = 0
    let totPB12   = 0

    listingBookings.forEach((b, idx) => {
      const r = D2 + idx
      const row = ws2.getRow(r)
      row.height = 14

      const isEven = idx % 2 === 1
      const bgFill = isEven ? 'FFF5F7FA' : 'FFFFFFFF'
      const gross = parseFloat(b.accommodationFare.toString())
      totGross2 += gross

      const svc      = gross * SVC_RATE
      const nett     = parseFloat(b.totalPayout.toString())   // from Guesty
      const selisih  = gross - svc - nett                      // actual delta
      const tax      = nett / 1.21
      const sc       = tax * 0.1
      const pb1      = (tax + sc) * 0.1
      const owner    = nett - pb1
      totNett2  += nett
      totPB12   += pb1

      const checkInStr  = fmtDate(new Date(b.checkIn))
      const checkOutStr = fmtDate(new Date(b.checkOut))

      // B: DATE BOOKING
      row.getCell(2).value = checkInStr
      row.getCell(2).font = dataFont
      row.getCell(2).alignment = centerAlign
      if (isEven) row.getCell(2).fill = headerFill(bgFill)

      // C: NAME
      row.getCell(3).value = b.guestName ?? ''
      row.getCell(3).font = dataFont
      if (isEven) row.getCell(3).fill = headerFill(bgFill)

      // D: LISTING
      row.getCell(4).value = listingName
      row.getCell(4).font = dataFont
      if (isEven) row.getCell(4).fill = headerFill(bgFill)

      // E: DATE STAY (checkIn – checkOut)
      row.getCell(5).value = `${checkInStr} — ${checkOutStr}`
      row.getCell(5).font = dataFont
      row.getCell(5).alignment = centerAlign
      if (isEven) row.getCell(5).fill = headerFill(bgFill)

      // F: NIGHT
      row.getCell(6).value = b.numberOfNights ?? 0
      row.getCell(6).font = dataFont
      row.getCell(6).alignment = centerAlign
      if (isEven) row.getCell(6).fill = headerFill(bgFill)

      // G: OTA (source)
      row.getCell(7).value = b.source ?? ''
      row.getCell(7).font = dataFont
      row.getCell(7).alignment = centerAlign
      if (isEven) row.getCell(7).fill = headerFill(bgFill)

      // H: GROSS
      row.getCell(8).value = gross
      row.getCell(8).numFmt = idrFmt
      row.getCell(8).font = dataFont
      if (isEven) row.getCell(8).fill = headerFill(bgFill)

      // I: DISCOUNT (blank/manual)
      row.getCell(9).value = null
      row.getCell(9).numFmt = idrFmt
      row.getCell(9).fill = headerFill('FFFFFACD')
      row.getCell(9).font = { size: 9, color: { argb: 'FF0000FF' }, name: 'Arial' }

      // J: SERVICE = GROSS × rate
      row.getCell(10).value = { formula: `H${r}*${SVC_REF}`, result: svc }
      row.getCell(10).numFmt = idrFmt
      row.getCell(10).font = dataFont
      if (isEven) row.getCell(10).fill = headerFill(bgFill)

      // K: SELISIH & DISC = GROSS − SERVICE − NETT (actual delta)
      row.getCell(11).value = { formula: `H${r}-J${r}-M${r}`, result: selisih }
      row.getCell(11).numFmt = idrFmt
      row.getCell(11).font = dataFont
      if (isEven) row.getCell(11).fill = headerFill(bgFill)

      // L: % = SELISIH / GROSS
      row.getCell(12).value = { formula: `IF(H${r}=0,0,K${r}/H${r})`, result: gross > 0 ? selisih / gross : 0 }
      row.getCell(12).numFmt = pctFmt
      row.getCell(12).font = dataFont
      row.getCell(12).alignment = centerAlign
      if (isEven) row.getCell(12).fill = headerFill(bgFill)

      // M: NETT = Total Payout from Guesty (raw value)
      row.getCell(13).value = nett
      row.getCell(13).numFmt = idrFmt
      row.getCell(13).font = dataFont
      if (isEven) row.getCell(13).fill = headerFill(bgFill)

      // N: TAX = NETT / 1.21
      row.getCell(14).value = { formula: `M${r}/1.21`, result: tax }
      row.getCell(14).numFmt = idrFmt
      row.getCell(14).font = dataFont
      if (isEven) row.getCell(14).fill = headerFill(bgFill)

      // O: SC = TAX × 10%
      row.getCell(15).value = { formula: `N${r}*0.1`, result: sc }
      row.getCell(15).numFmt = idrFmt
      row.getCell(15).font = dataFont
      if (isEven) row.getCell(15).fill = headerFill(bgFill)

      // P: PB1 = (TAX + SC) × 10%
      row.getCell(16).value = { formula: `(N${r}+O${r})*0.1`, result: pb1 }
      row.getCell(16).numFmt = idrFmt
      row.getCell(16).font = { ...dataFont, color: { argb: 'FFCC0000' } }
      if (isEven) row.getCell(16).fill = headerFill(bgFill)

      // Q: REVENUE OWNER = NETT − PB1
      row.getCell(17).value = { formula: `M${r}-P${r}`, result: owner }
      row.getCell(17).numFmt = idrFmt
      row.getCell(17).font = { ...dataFont, bold: true }
      row.getCell(17).fill = headerFill(isEven ? 'FFD4EDDA' : 'FFE8F5E9')

      // Borders
      for (let c = 2; c <= 17; c++) {
        row.getCell(c).border = {
          top: { style: 'hair', color: { argb: 'FFD0D5DD' } },
          bottom: { style: 'hair', color: { argb: 'FFD0D5DD' } },
          left: { style: 'hair', color: { argb: 'FFD0D5DD' } },
          right: { style: 'hair', color: { argb: 'FFD0D5DD' } },
        }
      }
    })

    // ── Total row
    const totRow2 = D2 + listingBookings.length
    const tr2 = ws2.getRow(totRow2)
    tr2.height = 17

    ws2.mergeCells(`B${totRow2}:G${totRow2}`)
    tr2.getCell(2).value = `TOTAL (${listingBookings.length} Booking)`
    tr2.getCell(2).font = { ...boldFont, color: { argb: 'FFFFFFFF' } }
    tr2.getCell(2).fill = headerFill('FF1E3A5F')
    tr2.getCell(2).alignment = { horizontal: 'left', vertical: 'middle' }

    const totSvc    = totGross2 * SVC_RATE
    const totOwner2 = totNett2 - totPB12

    const totDefs: { col: number; letter: string; result: number; fillArgb: string }[] = [
      { col: 8,  letter: 'H', result: totGross2,        fillArgb: 'FFFFCC00' },
      { col: 9,  letter: 'I', result: 0,                fillArgb: 'FF9B7D00' },
      { col: 10, letter: 'J', result: totSvc,           fillArgb: 'FF1E3A5F' },
      { col: 11, letter: 'K', result: totSvc,           fillArgb: 'FF1E3A5F' },
      { col: 12, letter: 'L', result: 0,                fillArgb: 'FF1E3A5F' }, // % — leave blank in total
      { col: 13, letter: 'M', result: totNett2,         fillArgb: 'FFFFCC00' },
      { col: 14, letter: 'N', result: totNett2 / 1.21,  fillArgb: 'FF1E3A5F' },
      { col: 15, letter: 'O', result: totNett2 / 1.21 * 0.1, fillArgb: 'FF1E3A5F' },
      { col: 16, letter: 'P', result: totPB12,          fillArgb: 'FF1E3A5F' },
      { col: 17, letter: 'Q', result: totOwner2,        fillArgb: 'FF1E6B3A' },
    ]

    for (const { col, letter, result, fillArgb } of totDefs) {
      const cell = tr2.getCell(col)
      if (letter === 'L') {
        // percentage total — blank
        cell.value = null
      } else if (letter === 'I') {
        cell.value = { formula: `SUM(${letter}${D2}:${letter}${totRow2 - 1})`, result: 0 }
      } else {
        cell.value = { formula: `SUM(${letter}${D2}:${letter}${totRow2 - 1})`, result }
      }
      cell.numFmt = letter === 'L' ? pctFmt : idrFmt
      cell.font = col === 8 || col === 13
        ? { ...boldFont }
        : { ...boldFont, color: { argb: 'FFFFFFFF' } }
      cell.fill = headerFill(fillArgb)
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFAAAAAA' } },
        bottom: { style: 'thin', color: { argb: 'FFAAAAAA' } },
      }
    }

    ws2.views = [{ state: 'frozen', ySplit: 7 }]
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
