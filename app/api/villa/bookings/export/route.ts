import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/guards'
import { prisma } from '@/lib/db'
import ExcelJS from 'exceljs'

const SERVICE_RATE = 0.03
const MGMT_FEE_RATE = 0.17
const TAX_DIVISOR = 1.21
const SC_RATE = 0.10
const PB1_RATE = 0.10

type BookingRow = {
  id: string
  status: string
  checkIn: Date
  checkOut: Date
  source: string
  accommodationFare: { toString(): string }
  totalPayout: { toString(): string }
  listing: string
  listingId: string
  guestName: string
  numberOfNights: number
  numberOfGuests: number
}

// Truncate sheet name to Excel's 31-char limit
function sheetName(prefix: string, listing: string): string {
  const full = `${prefix} ${listing}`
  return full.length > 31 ? full.slice(0, 31) : full
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
  })
}

function fmtDateRange(checkIn: Date, checkOut: Date): string {
  const inD = checkIn.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', timeZone: 'UTC' })
  const outD = checkOut.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: '2-digit', timeZone: 'UTC' })
  return `${inD} – ${outD}`
}

// ─── Header style helpers ──────────────────────────────────────────────────────

function headerFill(color: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: color } }
}

const headerFont: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 }
const dataFont: Partial<ExcelJS.Font> = { size: 9 }
const totalFont: Partial<ExcelJS.Font> = { bold: true, size: 9 }
const centerAlign: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle' }
const rightAlign: Partial<ExcelJS.Alignment> = { horizontal: 'right', vertical: 'middle' }

const idrFmt = '#,##0'
const pctFmt = '0.00%'

// ─── INCOME sheet ─────────────────────────────────────────────────────────────

function buildIncomeSheet(
  wb: ExcelJS.Workbook,
  listing: string,
  rows: BookingRow[]
): { sheetRef: string; totalRow: number } {
  const sName = sheetName('INCOME', listing)
  const ws = wb.addWorksheet(sName)

  // Column widths
  const colWidths = [4, 22, 20, 22, 20, 8, 12, 14, 10, 10, 14, 8, 14, 14, 12, 10, 16]
  colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w })

  // Row 1: Title
  ws.mergeCells('A1:Q1')
  const titleCell = ws.getCell('A1')
  titleCell.value = `INCOME REPORT — ${listing}`
  titleCell.font = { bold: true, size: 12 }
  titleCell.alignment = centerAlign
  ws.getRow(1).height = 20

  // Row 2: blank
  ws.getRow(2).height = 6

  // Row 3: service rate label
  ws.getCell('I3').value = 'SERVICE RATE'
  ws.getCell('I3').font = { bold: true, size: 9 }
  ws.getCell('J3').value = SERVICE_RATE   // $J$3 used in formulas (not $J$4 to keep rows consistent)
  ws.getCell('J3').numFmt = pctFmt
  ws.getCell('J3').font = { size: 9, color: { argb: 'FF0000FF' } }

  // Row 4: blank
  ws.getRow(4).height = 6

  // Row 5: headers
  const HEADERS = [
    'NO', 'DATE BOOKING', 'NAME', 'LISTING', 'DATE STAY', 'NIGHT', 'OTA',
    'REVENUE\nGROSS', 'DISCOUNT', 'SERVICE', 'SELISIH &\nDISC', '%',
    'NETT', 'TAX', 'SC', 'PB 1', 'REVENUE\nOWNER',
  ]
  const headerRow = ws.getRow(5)
  headerRow.height = 30
  HEADERS.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1)
    cell.value = h
    cell.font = headerFont
    cell.fill = headerFill('FF1E3A5F')
    cell.alignment = { ...centerAlign, wrapText: true }
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFFFFFFF' } },
      bottom: { style: 'thin', color: { argb: 'FFFFFFFF' } },
      left: { style: 'thin', color: { argb: 'FFFFFFFF' } },
      right: { style: 'thin', color: { argb: 'FFFFFFFF' } },
    }
  })

  // Data rows start at row 6
  const DATA_START = 6

  rows.forEach((b, idx) => {
    const r = DATA_START + idx
    const gross = parseFloat(b.accommodationFare.toString())
    const nett = parseFloat(b.totalPayout.toString())
    const service = gross * SERVICE_RATE
    const selisih = gross - service - nett
    const taxBase = nett / TAX_DIVISOR
    const sc = taxBase * SC_RATE
    const pb1 = (taxBase + sc) * PB1_RATE
    const revOwner = nett - pb1

    const row = ws.getRow(r)
    row.height = 15

    // NO
    row.getCell(1).value = idx + 1

    // DATE BOOKING
    row.getCell(2).value = fmtDate(b.checkIn)

    // NAME
    row.getCell(3).value = b.guestName

    // LISTING
    row.getCell(4).value = b.listing

    // DATE STAY
    row.getCell(5).value = fmtDateRange(b.checkIn, b.checkOut)

    // NIGHT
    row.getCell(6).value = b.numberOfNights
    row.getCell(6).alignment = centerAlign

    // OTA
    row.getCell(7).value = b.source.toUpperCase().replace('2', '').replace('AIRBNB', 'AIRBNB')
    row.getCell(7).alignment = centerAlign

    // REVENUE GROSS
    row.getCell(8).value = gross
    row.getCell(8).numFmt = idrFmt

    // DISCOUNT (always 0 from Guesty — staff fills manually)
    row.getCell(9).value = 0
    row.getCell(9).numFmt = idrFmt

    // SERVICE = GROSS × $J$3
    row.getCell(10).value = { formula: `H${r}*$J$3`, result: service }
    row.getCell(10).numFmt = idrFmt

    // SELISIH & DISC = GROSS − SERVICE − NETT
    row.getCell(11).value = { formula: `H${r}-J${r}-M${r}`, result: selisih }
    row.getCell(11).numFmt = idrFmt

    // % = SELISIH / GROSS
    row.getCell(12).value = { formula: `K${r}/H${r}`, result: gross !== 0 ? selisih / gross : 0 }
    row.getCell(12).numFmt = pctFmt

    // NETT (from TOTAL PAYOUT)
    row.getCell(13).value = nett
    row.getCell(13).numFmt = idrFmt
    row.getCell(13).font = { ...dataFont, color: { argb: 'FF0000FF' } } // blue = input

    // TAX = NETT / 1.21
    row.getCell(14).value = { formula: `M${r}/1.21`, result: taxBase }
    row.getCell(14).numFmt = idrFmt

    // SC = TAX × 10%
    row.getCell(15).value = { formula: `N${r}*10%`, result: sc }
    row.getCell(15).numFmt = idrFmt

    // PB 1 = (TAX + SC) × 10%
    row.getCell(16).value = { formula: `(N${r}+O${r})*10%`, result: pb1 }
    row.getCell(16).numFmt = idrFmt

    // REVENUE OWNER = NETT − PB1
    row.getCell(17).value = { formula: `M${r}-P${r}`, result: revOwner }
    row.getCell(17).numFmt = idrFmt

    // Row styling
    const isEven = idx % 2 === 1
    for (let c = 1; c <= 17; c++) {
      const cell = row.getCell(c)
      if (!cell.font || !cell.font.bold) cell.font = dataFont
      if (isEven) cell.fill = headerFill('FFF5F7FA')
      cell.border = {
        top: { style: 'hair', color: { argb: 'FFD0D5DD' } },
        bottom: { style: 'hair', color: { argb: 'FFD0D5DD' } },
      }
    }
  })

  // Total row
  const totalRow = DATA_START + rows.length
  const tr = ws.getRow(totalRow)
  tr.height = 16

  tr.getCell(1).value = 'TOTAL'
  tr.getCell(1).font = totalFont
  tr.getCell(1).fill = headerFill('FF1E3A5F')
  tr.getCell(1).font = { ...totalFont, color: { argb: 'FFFFFFFF' } }
  ws.mergeCells(`A${totalRow}:G${totalRow}`)

  // Totals for numeric columns: H, J, K, M, P, Q (cols 8, 10, 11, 13, 16, 17)
  const sumCols = [
    { col: 8,  letter: 'H'  },
    { col: 10, letter: 'J'  },
    { col: 11, letter: 'K'  },
    { col: 13, letter: 'M'  },
    { col: 16, letter: 'P'  },
    { col: 17, letter: 'Q'  },
  ]

  for (const { col, letter } of sumCols) {
    const cell = tr.getCell(col)
    cell.value = { formula: `SUM(${letter}${DATA_START}:${letter}${totalRow - 1})`, result: 0 }
    cell.numFmt = idrFmt
    cell.font = { ...totalFont, color: { argb: 'FFFFFFFF' } }
    cell.fill = headerFill('FF1E3A5F')
  }

  // Style remaining total row cells
  for (let c = 1; c <= 17; c++) {
    const cell = tr.getCell(c)
    if (!cell.fill || (cell.fill as ExcelJS.FillPattern).fgColor?.argb !== 'FF1E3A5F') {
      cell.fill = headerFill('FF1E3A5F')
    }
  }

  return { sheetRef: sName, totalRow }
}

// ─── EXP sheet ────────────────────────────────────────────────────────────────

function buildExpSheet(wb: ExcelJS.Workbook, listing: string): { sheetRef: string; totalCell: string } {
  const sName = sheetName('EXP', listing)
  const ws = wb.addWorksheet(sName)

  ws.getColumn(1).width = 4
  ws.getColumn(2).width = 30
  ws.getColumn(3).width = 18

  // Title
  ws.mergeCells('B1:C1')
  ws.getCell('B1').value = `EXPENSES — ${listing}`
  ws.getCell('B1').font = { bold: true, size: 12 }

  // Header
  ws.getRow(3).height = 14
  const h1 = ws.getCell('B3')
  h1.value = 'PERINCIAN'
  h1.font = headerFont
  h1.fill = headerFill('FF1E3A5F')
  h1.alignment = centerAlign

  const h2 = ws.getCell('C3')
  h2.value = 'PRICE (IDR)'
  h2.font = headerFont
  h2.fill = headerFill('FF1E3A5F')
  h2.alignment = centerAlign

  // Category rows (blank amounts — staff fills manually)
  const categories = [
    'Room Amenities',
    'Electricity',
    'Maintenance',
    'Laundry',
    'Other',
  ]

  categories.forEach((cat, i) => {
    const r = 4 + i
    ws.getCell(`B${r}`).value = cat
    ws.getCell(`B${r}`).font = dataFont
    ws.getCell(`C${r}`).value = null  // blank — manual input
    ws.getCell(`C${r}`).numFmt = idrFmt
    ws.getCell(`C${r}`).fill = headerFill('FFFFFACD')  // yellow = input cell
    ws.getCell(`C${r}`).font = { size: 9, color: { argb: 'FF0000FF' } }
  })

  // Total row
  const totalRowNum = 4 + categories.length
  ws.getCell(`B${totalRowNum}`).value = 'TOTAL'
  ws.getCell(`B${totalRowNum}`).font = totalFont
  ws.getCell(`B${totalRowNum}`).fill = headerFill('FF1E3A5F')
  ws.getCell(`B${totalRowNum}`).font = { ...totalFont, color: { argb: 'FFFFFFFF' } }

  const totalCell = `C${totalRowNum}`
  ws.getCell(totalCell).value = { formula: `SUM(C4:C${totalRowNum - 1})`, result: 0 }
  ws.getCell(totalCell).numFmt = idrFmt
  ws.getCell(totalCell).font = { ...totalFont, color: { argb: 'FFFFFFFF' } }
  ws.getCell(totalCell).fill = headerFill('FF1E3A5F')

  return { sheetRef: sName, totalCell }
}

// ─── GLOBAL sheet ─────────────────────────────────────────────────────────────

function buildGlobalSheet(
  wb: ExcelJS.Workbook,
  listing: string,
  incomeSheet: { sheetRef: string; totalRow: number },
  expSheet: { sheetRef: string; totalCell: string }
) {
  const sName = sheetName('GLOBAL', listing)
  const ws = wb.addWorksheet(sName)

  ws.getColumn(1).width = 4
  ws.getColumn(2).width = 26
  ws.getColumn(3).width = 18

  // Title
  ws.mergeCells('B1:C1')
  ws.getCell('B1').value = `SUMMARY — ${listing}`
  ws.getCell('B1').font = { bold: true, size: 12 }

  // Management fee rate cell
  ws.getCell('B3').value = 'MANAGEMENT FEE RATE'
  ws.getCell('B3').font = { size: 9, bold: true }
  ws.getCell('C3').value = MGMT_FEE_RATE
  ws.getCell('C3').numFmt = pctFmt
  ws.getCell('C3').font = { size: 9, color: { argb: 'FF0000FF' } }

  const iRef = `'${incomeSheet.sheetRef}'`
  const eRef = `'${expSheet.sheetRef}'`
  const tRow = incomeSheet.totalRow

  const summaryRows = [
    { label: 'Gross Revenue',    formula: `${iRef}!H${tRow}`,                       note: 'Total gross booking revenue' },
    { label: 'OTA & Deductions', formula: `${iRef}!J${tRow}+${iRef}!K${tRow}`,      note: 'Service fee + Selisih' },
    { label: 'NETT',             formula: `C6-C7`,                                   note: 'Gross − OTA deductions' },
    { label: 'Operating Expenses',formula: `${eRef}!${expSheet.totalCell}`,          note: 'From EXP sheet total' },
    { label: 'PB1 Tax',          formula: `${iRef}!P${tRow}`,                        note: 'Total PB1 tax' },
    { label: 'Management Fee',   formula: `C6*C3`,                                   note: `${(MGMT_FEE_RATE * 100).toFixed(0)}% of gross` },
    { label: 'OWNER PAYOUT',     formula: `C6-C9-C10-C11`,                           note: 'Gross − Exp − PB1 − Mgmt' },
  ]

  // Headers
  ws.getRow(5).height = 14
  ws.getCell('B5').value = 'DESCRIPTION'
  ws.getCell('B5').font = headerFont
  ws.getCell('B5').fill = headerFill('FF1E3A5F')
  ws.getCell('B5').alignment = centerAlign
  ws.getCell('C5').value = 'AMOUNT (IDR)'
  ws.getCell('C5').font = headerFont
  ws.getCell('C5').fill = headerFill('FF1E3A5F')
  ws.getCell('C5').alignment = centerAlign
  ws.getCell('D5').value = 'NOTES'
  ws.getCell('D5').font = headerFont
  ws.getCell('D5').fill = headerFill('FF1E3A5F')
  ws.getCell('D5').alignment = centerAlign
  ws.getColumn(4).width = 28

  summaryRows.forEach(({ label, formula, note }, i) => {
    const r = 6 + i
    const isOwner = label === 'OWNER PAYOUT'
    const isDivider = ['NETT', 'OWNER PAYOUT'].includes(label)

    ws.getCell(`B${r}`).value = label
    ws.getCell(`B${r}`).font = isOwner
      ? { bold: true, size: 10, color: { argb: 'FFFFFFFF' } }
      : { bold: isDivider, size: 9 }
    ws.getCell(`B${r}`).fill = isOwner ? headerFill('FF1E6B3A') : (isDivider ? headerFill('FFE8F5E9') : undefined as unknown as ExcelJS.Fill)

    ws.getCell(`C${r}`).value = { formula, result: 0 }
    ws.getCell(`C${r}`).numFmt = idrFmt
    ws.getCell(`C${r}`).font = isOwner
      ? { bold: true, size: 10, color: { argb: 'FFFFFFFF' } }
      : { bold: isDivider, size: 9 }
    ws.getCell(`C${r}`).fill = isOwner ? headerFill('FF1E6B3A') : (isDivider ? headerFill('FFE8F5E9') : undefined as unknown as ExcelJS.Fill)

    ws.getCell(`D${r}`).value = note
    ws.getCell(`D${r}`).font = { size: 8, color: { argb: 'FF888888' }, italic: true }

    ws.getRow(r).height = isOwner ? 18 : 14
  })
}

// ─── Main export route ────────────────────────────────────────────────────────

export const GET = withAuth(async (req: NextRequest) => {
  const { searchParams } = req.nextUrl
  const listingFilter = searchParams.get('listing')
  const from = searchParams.get('from')
  const to = searchParams.get('to')

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

  // Group by exact listing name
  const byListing = new Map<string, typeof bookings>()
  for (const b of bookings) {
    if (!byListing.has(b.listing)) byListing.set(b.listing, [])
    byListing.get(b.listing)!.push(b)
  }

  const wb = new ExcelJS.Workbook()
  wb.creator = 'BSpace Finance'
  wb.created = new Date()

  byListing.forEach((rows, listingName) => {
    const incomeSheet = buildIncomeSheet(wb, listingName, rows)
    const expSheet = buildExpSheet(wb, listingName)
    buildGlobalSheet(wb, listingName, incomeSheet, expSheet)
  })

  const buffer = await wb.xlsx.writeBuffer()

  const safeName = listingFilter
    ? listingFilter.replace(/[^a-zA-Z0-9\s]/g, '').trim().replace(/\s+/g, '-').slice(0, 40)
    : 'all-villas'
  const dateStr = new Date().toISOString().slice(0, 10)
  const filename = `villa-report-${safeName}-${dateStr}.xlsx`

  return new NextResponse(Buffer.from(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}, ['admin', 'finance', 'manager'])
