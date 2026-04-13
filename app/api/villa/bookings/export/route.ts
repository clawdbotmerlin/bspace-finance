import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/guards'
import { prisma } from '@/lib/db'
import ExcelJS from 'exceljs'
import { fixEncoding } from '@/lib/parsers/villaBooking'

// ─── Constants ────────────────────────────────────────────────────────────────
const SVC_RATE   = 0.03
const MGMT_RATE  = 0.17
const idrFmt     = '#,##0'
const pctFmt     = '0.00%'

// ─── Style helpers ────────────────────────────────────────────────────────────
const fill = (argb: string): ExcelJS.Fill =>
  ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })

const fnt = (opts: Partial<ExcelJS.Font>): Partial<ExcelJS.Font> =>
  ({ size: 9, name: 'Arial', ...opts })

const FONT_BASE  = fnt({})
const FONT_BOLD  = fnt({ bold: true })
const FONT_WHITE = fnt({ bold: true, color: { argb: 'FFFFFFFF' } })
const FONT_RED   = fnt({ bold: true, color: { argb: 'FFFF0000' } })
const FONT_BLUE  = fnt({ color: { argb: 'FF0070C0' } })

const ALIGN_C: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle' }
const ALIGN_L: Partial<ExcelJS.Alignment> = { horizontal: 'left',   vertical: 'middle' }
const ALIGN_R: Partial<ExcelJS.Alignment> = { horizontal: 'right',  vertical: 'middle' }

const DARK  = 'FF1E3A5F'
const GRAY  = 'FFD0CECE'
const ALT   = 'FFF5F7FA'
const GREEN = 'FF1E6B3A'

const hairBorder: Partial<ExcelJS.Borders> = {
  top:    { style: 'hair', color: { argb: 'FFD0D5DD' } },
  bottom: { style: 'hair', color: { argb: 'FFD0D5DD' } },
  left:   { style: 'hair', color: { argb: 'FFD0D5DD' } },
  right:  { style: 'hair', color: { argb: 'FFD0D5DD' } },
}
const whiteBorder: Partial<ExcelJS.Borders> = {
  top:    { style: 'thin', color: { argb: 'FFFFFFFF' } },
  bottom: { style: 'thin', color: { argb: 'FFFFFFFF' } },
  left:   { style: 'thin', color: { argb: 'FFFFFFFF' } },
  right:  { style: 'thin', color: { argb: 'FFFFFFFF' } },
}

function safeName(s: string): string {
  return s.replace(/[\\/?*[\]]/g, '').slice(0, 31)
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

function fmtStay(ci: Date, co: Date): string {
  const a = ci.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', timeZone: 'UTC' })
  const b = co.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: '2-digit', timeZone: 'UTC' })
  return `${a}–${b}`
}

function fmtPeriod(from: string | null, to: string | null): string {
  const opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }
  if (from && to) {
    const f = new Date(from).toLocaleDateString('id-ID', opts)
    const t = new Date(to).toLocaleDateString('id-ID', opts)
    return from === to ? f : `${f} — ${t}`
  }
  if (from) return `Ab ${new Date(from).toLocaleDateString('id-ID', opts)}`
  if (to)   return `s/d ${new Date(to).toLocaleDateString('id-ID', opts)}`
  return 'Semua Periode'
}

// ─── INCOME sheet ─────────────────────────────────────────────────────────────

function buildIncomeSheet(
  wb: ExcelJS.Workbook,
  listingName: string,
  bookings: { checkIn: Date; checkOut: Date; guestName: string | null; listing: string; numberOfNights: number | null; source: string; accommodationFare: { toString(): string } }[],
  from: string | null,
  to: string | null,
): { name: string; totalRow: number; totGross: number; totNett: number; totPB1: number } {
  const wsName = safeName(`INCOME ${listingName}`)
  const ws = wb.addWorksheet(wsName)

  const widths = [4, 12, 20, 30, 20, 7, 10, 14, 11, 12, 14, 7, 14, 14, 13, 13, 15]
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w })

  // Row 1: Title
  ws.mergeCells('A1:Q1')
  ws.getCell('A1').value = `BSpace Finance — ${listingName}`
  ws.getCell('A1').font  = fnt({ bold: true, size: 13, color: { argb: DARK } })
  ws.getCell('A1').alignment = ALIGN_L
  ws.getRow(1).height = 22

  // Row 2: Period
  ws.mergeCells('A2:Q2')
  ws.getCell('A2').value = `Periode: ${fmtPeriod(from, to)}   |   ${bookings.length} booking`
  ws.getCell('A2').font  = fnt({ color: { argb: 'FF555555' } })
  ws.getRow(2).height = 13

  // Row 3: Service rate
  ws.getCell('I3').value  = 'SERVICE RATE'
  ws.getCell('I3').font   = FONT_BOLD
  ws.getCell('J3').value  = SVC_RATE
  ws.getCell('J3').numFmt = pctFmt
  ws.getCell('J3').font   = fnt({ color: { argb: 'FF0070C0' }, bold: true })
  ws.getRow(3).height = 13

  // Row 4: blank
  ws.getRow(4).height = 6

  // Rows 5–6: Two-row header (same as table-export)
  const grayInputCols = ['B', 'C', 'D', 'F', 'G', 'H']
  const mergedCols    = ['B', 'C', 'D', 'F', 'G', 'H', 'I', 'L', 'M', 'N', 'O', 'P', 'Q']
  for (const col of mergedCols) ws.mergeCells(`${col}5:${col}6`)

  const HEADERS: { col: string; label: string }[] = [
    { col: 'B', label: 'DATE\nBOOKING'    },
    { col: 'C', label: 'NAME'             },
    { col: 'D', label: 'LISTING'          },
    { col: 'E', label: 'DATE STAY'        },
    { col: 'F', label: 'NIGHT'            },
    { col: 'G', label: 'OTA'              },
    { col: 'H', label: 'REVENUE\nGROSS'  },
    { col: 'I', label: 'DISCOUNT'         },
    { col: 'J', label: 'SERVICE'          },
    { col: 'K', label: 'SELISIH\n& DISC'  },
    { col: 'L', label: '%'                },
    { col: 'M', label: 'NETT'             },
    { col: 'N', label: 'TAX'              },
    { col: 'O', label: 'SC'               },
    { col: 'P', label: 'PB 1'            },
    { col: 'Q', label: 'REVENUE\nOWNER'  },
  ]

  ws.getRow(5).height = 28
  ws.getRow(6).height = 14

  for (const { col, label } of HEADERS) {
    const isGray = grayInputCols.includes(col)
    const cell = ws.getCell(`${col}5`)
    cell.value     = label
    cell.fill      = fill(isGray ? GRAY : DARK)
    cell.font      = isGray ? FONT_BOLD : (col === 'P' ? fnt({ bold: true, color: { argb: 'FFFF0000' } }) : FONT_WHITE)
    cell.alignment = { ...ALIGN_C, wrapText: true }
    cell.border    = whiteBorder
  }

  // Sub-row 6 labels
  for (const { col, label } of [
    { col: 'E', label: 'Booking' },
    { col: 'J', label: `${(SVC_RATE * 100).toFixed(0)}%` },
    { col: 'K', label: 'system' },
  ]) {
    const isGray = grayInputCols.includes(col)
    const cell = ws.getCell(`${col}6`)
    cell.value     = label
    cell.fill      = fill(isGray ? GRAY : DARK)
    cell.font      = isGray ? FONT_BOLD : FONT_WHITE
    cell.alignment = ALIGN_C
    cell.border    = whiteBorder
  }

  // Data rows
  const DATA_START = 7
  let totGross = 0, totSvc = 0, totNett = 0, totPB1 = 0, totOwner = 0

  bookings.forEach((b, idx) => {
    const r   = DATA_START + idx
    const row = ws.getRow(r)
    row.height = 15

    const gross   = parseFloat(b.accommodationFare.toString())
    const service = gross * SVC_RATE
    const nett    = gross - service
    const taxBase = nett / 1.21
    const sc      = taxBase * 0.1
    const pb1     = (taxBase + sc) * 0.1
    const owner   = nett - pb1

    totGross  += gross
    totSvc    += service
    totNett   += nett
    totPB1    += pb1
    totOwner  += owner

    const isEven = idx % 2 === 1
    const rowFill = isEven ? fill(ALT) : undefined

    const setCell = (col: number, value: ExcelJS.CellValue, opts: {
      numFmt?: string; align?: Partial<ExcelJS.Alignment>; font?: Partial<ExcelJS.Font>; cellFill?: ExcelJS.Fill
    } = {}) => {
      const cell = row.getCell(col)
      cell.value     = value
      cell.font      = opts.font ?? FONT_BASE
      if (opts.numFmt) cell.numFmt = opts.numFmt
      if (opts.align)  cell.alignment = opts.align
      cell.fill      = opts.cellFill ?? rowFill ?? ({ type: 'pattern', pattern: 'none' } as ExcelJS.Fill)
      cell.border    = hairBorder
    }

    row.getCell(1).fill   = rowFill ?? ({ type: 'pattern', pattern: 'none' } as ExcelJS.Fill)
    row.getCell(1).border = hairBorder

    setCell(2,  fmtDate(b.checkIn), { align: ALIGN_C })
    setCell(3,  b.guestName || '—')
    setCell(4,  listingName)
    setCell(5,  fmtStay(b.checkIn, b.checkOut), { align: ALIGN_C })
    setCell(6,  b.numberOfNights, { align: ALIGN_C })
    setCell(7,  b.source.toUpperCase(), { align: ALIGN_C })
    setCell(8,  gross,  { numFmt: idrFmt, align: ALIGN_R })
    setCell(9,  0,      { numFmt: idrFmt, align: ALIGN_R, font: FONT_BLUE, cellFill: fill('FFFFFACD') })
    setCell(10, { formula: `H${r}*$J$3`, result: service },                  { numFmt: idrFmt, align: ALIGN_R })
    setCell(11, { formula: `H${r}-J${r}-M${r}`, result: 0 },                 { numFmt: idrFmt, align: ALIGN_R })
    setCell(12, { formula: `IF(H${r}=0,0,K${r}/H${r})`, result: 0 },         { numFmt: pctFmt, align: ALIGN_R })
    setCell(13, { formula: `H${r}-J${r}`, result: nett },                    { numFmt: idrFmt, align: ALIGN_R, font: FONT_BOLD })
    setCell(14, { formula: `M${r}/1.21`, result: taxBase },                  { numFmt: idrFmt, align: ALIGN_R })
    setCell(15, { formula: `N${r}*10%`, result: sc },                        { numFmt: idrFmt, align: ALIGN_R })
    setCell(16, { formula: `(N${r}+O${r})*10%`, result: pb1 },               { numFmt: idrFmt, align: ALIGN_R, font: FONT_RED })
    setCell(17, { formula: `M${r}-P${r}`, result: owner },                   { numFmt: idrFmt, align: ALIGN_R, font: FONT_BOLD })
  })

  // Total row
  const totalRow = DATA_START + bookings.length
  const tr = ws.getRow(totalRow)
  tr.height = 18

  ws.mergeCells(`A${totalRow}:G${totalRow}`)
  tr.getCell(1).value     = `TOTAL — ${bookings.length} Booking`
  tr.getCell(1).font      = FONT_WHITE
  tr.getCell(1).fill      = fill(DARK)
  tr.getCell(1).alignment = ALIGN_L

  const totDefs: { col: number; letter: string; result: number; fillArgb: string; font: Partial<ExcelJS.Font> }[] = [
    { col: 8,  letter: 'H', result: totGross,  fillArgb: 'FFFFFF00', font: FONT_BOLD  },
    { col: 10, letter: 'J', result: totSvc,    fillArgb: DARK,       font: FONT_WHITE },
    { col: 11, letter: 'K', result: 0,         fillArgb: DARK,       font: FONT_WHITE },
    { col: 13, letter: 'M', result: totNett,   fillArgb: 'FFFFFF00', font: FONT_BOLD  },
    { col: 16, letter: 'P', result: totPB1,    fillArgb: 'FFFFFF00', font: FONT_RED   },
    { col: 17, letter: 'Q', result: totOwner,  fillArgb: 'FF92D050', font: FONT_BOLD  },
  ]

  const totColSet = new Set(totDefs.map(d => d.col))
  for (let c = 2; c <= 17; c++) {
    if (!totColSet.has(c)) { tr.getCell(c).fill = fill(DARK); tr.getCell(c).border = whiteBorder }
  }
  for (const { col, letter, result, fillArgb, font } of totDefs) {
    const cell = tr.getCell(col)
    cell.value     = { formula: `SUM(${letter}${DATA_START}:${letter}${totalRow - 1})`, result }
    cell.numFmt    = idrFmt
    cell.font      = font
    cell.fill      = fill(fillArgb)
    cell.alignment = ALIGN_R
    cell.border    = whiteBorder
  }

  ws.views = [{ state: 'frozen', ySplit: 6 }]

  return { name: wsName, totalRow, totGross, totNett, totPB1 }
}

// ─── EXP sheet ────────────────────────────────────────────────────────────────

function buildExpSheet(
  wb: ExcelJS.Workbook,
  listingName: string,
): { name: string; totalCell: string } {
  const wsName = safeName(`EXP ${listingName}`)
  const ws = wb.addWorksheet(wsName)

  ws.getColumn(1).width = 4
  ws.getColumn(2).width = 32
  ws.getColumn(3).width = 18

  // Title
  ws.mergeCells('B1:C1')
  ws.getCell('B1').value = `Pengeluaran — ${listingName}`
  ws.getCell('B1').font  = fnt({ bold: true, size: 13, color: { argb: DARK } })
  ws.getRow(1).height = 20

  // Row 2: blank
  ws.getRow(2).height = 8

  // Headers
  ws.getRow(3).height = 14
  ws.getCell('B3').value     = 'PERINCIAN'
  ws.getCell('B3').font      = FONT_WHITE
  ws.getCell('B3').fill      = fill(DARK)
  ws.getCell('B3').alignment = ALIGN_C
  ws.getCell('C3').value     = 'JUMLAH (IDR)'
  ws.getCell('C3').font      = FONT_WHITE
  ws.getCell('C3').fill      = fill(DARK)
  ws.getCell('C3').alignment = ALIGN_C

  // Category rows (blank — staff fills manually)
  const categories = ['Room Amenities', 'Electricity', 'Maintenance', 'Laundry', 'Other']
  categories.forEach((cat, i) => {
    const r = 4 + i
    ws.getCell(`B${r}`).value  = cat
    ws.getCell(`B${r}`).font   = FONT_BASE
    ws.getCell(`C${r}`).value  = null
    ws.getCell(`C${r}`).numFmt = idrFmt
    ws.getCell(`C${r}`).fill   = fill('FFFFFACD')   // yellow = manual input
    ws.getCell(`C${r}`).font   = FONT_BLUE
    ws.getRow(r).height = 14
  })

  // Total row
  const totalRowNum = 4 + categories.length
  ws.getCell(`B${totalRowNum}`).value     = 'TOTAL'
  ws.getCell(`B${totalRowNum}`).font      = FONT_WHITE
  ws.getCell(`B${totalRowNum}`).fill      = fill(DARK)
  ws.getCell(`B${totalRowNum}`).alignment = ALIGN_L
  ws.getCell(`C${totalRowNum}`).value     = { formula: `SUM(C4:C${totalRowNum - 1})`, result: 0 }
  ws.getCell(`C${totalRowNum}`).numFmt    = idrFmt
  ws.getCell(`C${totalRowNum}`).font      = FONT_WHITE
  ws.getCell(`C${totalRowNum}`).fill      = fill(DARK)
  ws.getRow(totalRowNum).height = 16

  return { name: wsName, totalCell: `C${totalRowNum}` }
}

// ─── GLOBAL sheet (GLOBAL 7C1 format) ─────────────────────────────────────────

function buildGlobalSheet(
  wb: ExcelJS.Workbook,
  listingName: string,
  income: { name: string; totalRow: number; totGross: number; totNett: number; totPB1: number },
  exp: { name: string; totalCell: string },
  from: string | null,
  to: string | null,
) {
  const wsName = safeName(`GLOBAL ${listingName}`)
  const ws = wb.addWorksheet(wsName)

  // Column widths: A spacer | B unit | C gross | D OTA&Tax | E NETT | F Expense | G PB1 | H Mgmt | I Owner
  const widths = [3, 32, 16, 14, 16, 14, 14, 16, 16]
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w })

  // Row 1: Brand title
  ws.mergeCells('B1:I1')
  ws.getCell('B1').value = `BSpace Finance — ${listingName}`
  ws.getCell('B1').font  = fnt({ bold: true, size: 13, color: { argb: DARK } })
  ws.getCell('B1').alignment = ALIGN_L
  ws.getRow(1).height = 22

  // Row 2: Period
  ws.mergeCells('B2:I2')
  ws.getCell('B2').value = `Periode: ${fmtPeriod(from, to)}`
  ws.getCell('B2').font  = fnt({ color: { argb: 'FF555555' } })
  ws.getRow(2).height = 14

  // Row 3: blank
  ws.getRow(3).height = 6

  // Row 4: Mgmt fee rate
  ws.getCell('B4').value  = 'Management Fee Rate'
  ws.getCell('B4').font   = FONT_BOLD
  ws.getCell('C4').value  = MGMT_RATE
  ws.getCell('C4').numFmt = pctFmt
  ws.getCell('C4').font   = fnt({ color: { argb: 'FF0070C0' }, bold: true })
  ws.getRow(4).height = 13

  // Row 5: blank
  ws.getRow(5).height = 6

  // Rows 6–7: Two-row headers (Revenue group spans C–E)
  ws.mergeCells('C6:E6')
  ws.getCell('C6').value     = 'Revenue'
  ws.getCell('C6').font      = FONT_WHITE
  ws.getCell('C6').fill      = fill('FF2E4F6F')
  ws.getCell('C6').alignment = ALIGN_C

  const fixedHeaders: { cell: string; value: string; fillArgb: string }[] = [
    { cell: 'B6', value: 'UNIT',               fillArgb: DARK  },
    { cell: 'F6', value: 'EXPENSE',            fillArgb: 'FFB8860B' },
    { cell: 'G6', value: 'PB1',                fillArgb: DARK  },
    { cell: 'H6', value: `MGMT (${(MGMT_RATE * 100).toFixed(0)}%)`, fillArgb: DARK },
    { cell: 'I6', value: 'OWNER PAYOUT',       fillArgb: GREEN },
  ]
  for (const { cell, value, fillArgb } of fixedHeaders) {
    ws.mergeCells(`${cell}:${cell[0]}7`)
    ws.getCell(cell).value     = value
    ws.getCell(cell).font      = FONT_WHITE
    ws.getCell(cell).fill      = fill(fillArgb)
    ws.getCell(cell).alignment = ALIGN_C
  }

  const subHeaders: { cell: string; value: string }[] = [
    { cell: 'C7', value: 'GROSS'    },
    { cell: 'D7', value: 'OTA & TAX' },
    { cell: 'E7', value: 'NETT'     },
  ]
  for (const { cell, value } of subHeaders) {
    ws.getCell(cell).value     = value
    ws.getCell(cell).font      = FONT_WHITE
    ws.getCell(cell).fill      = fill('FF2E4F6F')
    ws.getCell(cell).alignment = ALIGN_C
  }

  ws.getRow(6).height = 16
  ws.getRow(7).height = 14

  // Data row 8: one row = this listing
  const r = 8
  ws.getRow(r).height = 16

  // Short name = first token before " / "
  const shortName = listingName.split(' / ')[0].trim()

  const iRef = `'${income.name}'`
  const eRef = `'${exp.name}'`
  const tRow = income.totalRow
  const expCell = exp.totalCell

  const gross  = income.totGross
  const nett   = income.totNett
  const ota    = gross - nett
  const pb1    = income.totPB1
  const mgmt   = gross * MGMT_RATE
  const owner  = gross - pb1 - mgmt  // expense deducted client-side via formula

  ws.getCell(`B${r}`).value     = shortName
  ws.getCell(`B${r}`).font      = FONT_BOLD
  ws.getCell(`B${r}`).alignment = ALIGN_L

  ws.getCell(`C${r}`).value     = { formula: `${iRef}!H${tRow}`, result: gross }
  ws.getCell(`C${r}`).numFmt    = idrFmt
  ws.getCell(`C${r}`).font      = FONT_BASE

  ws.getCell(`D${r}`).value     = { formula: `C${r}-E${r}`, result: ota }
  ws.getCell(`D${r}`).numFmt    = idrFmt
  ws.getCell(`D${r}`).font      = FONT_BASE

  ws.getCell(`E${r}`).value     = { formula: `${iRef}!M${tRow}`, result: nett }
  ws.getCell(`E${r}`).numFmt    = idrFmt
  ws.getCell(`E${r}`).font      = FONT_BASE

  // F: Expense (linked to EXP sheet total — yellow so staff can override)
  ws.getCell(`F${r}`).value     = { formula: `${eRef}!${expCell}`, result: 0 }
  ws.getCell(`F${r}`).numFmt    = idrFmt
  ws.getCell(`F${r}`).fill      = fill('FFFFFACD')
  ws.getCell(`F${r}`).font      = FONT_BLUE

  ws.getCell(`G${r}`).value     = { formula: `${iRef}!P${tRow}`, result: pb1 }
  ws.getCell(`G${r}`).numFmt    = idrFmt
  ws.getCell(`G${r}`).font      = FONT_BASE

  ws.getCell(`H${r}`).value     = { formula: `C${r}*$C$4`, result: mgmt }
  ws.getCell(`H${r}`).numFmt    = idrFmt
  ws.getCell(`H${r}`).font      = FONT_BASE

  ws.getCell(`I${r}`).value     = { formula: `C${r}-F${r}-G${r}-H${r}`, result: owner }
  ws.getCell(`I${r}`).numFmt    = idrFmt
  ws.getCell(`I${r}`).font      = fnt({ bold: true })
  ws.getCell(`I${r}`).fill      = fill('FFE8F5E9')

  // Borders on data row
  for (let c = 2; c <= 9; c++) {
    ws.getRow(r).getCell(c).border = hairBorder
  }

  // Total row (row 9) — single listing so same as data row, but styled
  const totR = r + 1
  ws.getRow(totR).height = 17
  ws.mergeCells(`B${totR}:B${totR}`)

  ws.getCell(`B${totR}`).value     = 'TOTAL'
  ws.getCell(`B${totR}`).font      = FONT_WHITE
  ws.getCell(`B${totR}`).fill      = fill(DARK)
  ws.getCell(`B${totR}`).alignment = ALIGN_L

  const totCols: { col: string; src: string; result: number; fillArgb: string }[] = [
    { col: 'C', src: `C${r}`, result: gross,  fillArgb: 'FFFFFF00' },
    { col: 'D', src: `D${r}`, result: ota,    fillArgb: DARK       },
    { col: 'E', src: `E${r}`, result: nett,   fillArgb: 'FFFFFF00' },
    { col: 'F', src: `F${r}`, result: 0,      fillArgb: 'FF9B7D00' },
    { col: 'G', src: `G${r}`, result: pb1,    fillArgb: DARK       },
    { col: 'H', src: `H${r}`, result: mgmt,   fillArgb: DARK       },
    { col: 'I', src: `I${r}`, result: owner,  fillArgb: GREEN      },
  ]

  for (const { col, src, result, fillArgb } of totCols) {
    const cell = ws.getCell(`${col}${totR}`)
    cell.value     = { formula: src, result }
    cell.numFmt    = idrFmt
    cell.font      = col === 'C' || col === 'E' ? FONT_BOLD : FONT_WHITE
    cell.fill      = fill(fillArgb)
    cell.alignment = ALIGN_R
    cell.border    = whiteBorder
  }
}

// ─── Main route ───────────────────────────────────────────────────────────────

export const GET = withAuth(async (req: NextRequest) => {
  const { searchParams } = req.nextUrl
  const listingFilter = searchParams.get('listing')
  const from = searchParams.get('from')
  const to   = searchParams.get('to')

  const bookings = await prisma.villaBooking.findMany({
    where: {
      checkIn: {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to   ? { lte: new Date(to)   } : {}),
      },
      ...(listingFilter ? { listing: { contains: listingFilter, mode: 'insensitive' } } : {}),
    },
    orderBy: { checkIn: 'asc' },
  })

  if (bookings.length === 0)
    return NextResponse.json({ error: 'Tidak ada data untuk diekspor.' }, { status: 404 })

  // Group by listing
  const byListing = new Map<string, typeof bookings>()
  for (const b of bookings) {
    const key = fixEncoding(b.listing)
    if (!byListing.has(key)) byListing.set(key, [])
    byListing.get(key)!.push(b)
  }

  const wb = new ExcelJS.Workbook()
  wb.creator = 'BSpace Finance'
  wb.created = new Date()
  wb.calcProperties = { fullCalcOnLoad: true }

  for (const [listingName, rows] of Array.from(byListing.entries())) {
    const income = buildIncomeSheet(wb, listingName, rows, from, to)
    const exp    = buildExpSheet(wb, listingName)
    buildGlobalSheet(wb, listingName, income, exp, from, to)
  }

  const buffer = await wb.xlsx.writeBuffer()

  const slug = listingFilter
    ? listingFilter.replace(/[^a-zA-Z0-9\s]/g, '').trim().replace(/\s+/g, '-').slice(0, 40)
    : 'all-villas'
  const dateStr  = new Date().toISOString().slice(0, 10)
  const filename = `villa-report-${slug}-${dateStr}.xlsx`

  return new NextResponse(Buffer.from(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}, ['admin', 'finance', 'manager'])
