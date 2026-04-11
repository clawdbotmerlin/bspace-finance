import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/guards'
import { prisma } from '@/lib/db'
import ExcelJS from 'exceljs'
import { fixEncoding } from '@/lib/parsers/villaBooking'

// ─── Constants (matching CONTOH HITUNGAN) ────────────────────────────────────
const SERVICE_RATE = 0.03
const idrFmt  = '#,##0'
const pctFmt  = '0.00%'

// ─── Style helpers ────────────────────────────────────────────────────────────
const fill = (argb: string): ExcelJS.Fill =>
  ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })

const FILL_HEADER_GRAY  = 'FFD0CECE'   // gray  — key input column headers (CONTOH match)
const FILL_HEADER_DARK  = 'FF1E3A5F'   // dark  — secondary headers
const FILL_ROW_ALT      = 'FFF5F7FA'   // light — alternating rows
const FILL_TOTAL        = 'FF1E3A5F'   // dark  — total row
const FILL_YELLOW       = 'FFFFFACD'   // yellow — manual input cell (DISCOUNT)
const FILL_OWNER_GREEN  = 'FF92D050'   // green  — REVENUE OWNER total (CONTOH match)
const FILL_PB1_YELLOW   = 'FFFFFF00'   // yellow — PB1 total (CONTOH match)

const fnt = (opts: Partial<ExcelJS.Font>): Partial<ExcelJS.Font> =>
  ({ size: 9, name: 'Arial', ...opts })

const FONT_BASE    = fnt({})
const FONT_BOLD    = fnt({ bold: true })
const FONT_WHITE   = fnt({ bold: true, color: { argb: 'FFFFFFFF' } })
const FONT_RED     = fnt({ bold: true, color: { argb: 'FFFF0000' } })   // PB1 column
const FONT_BLUE    = fnt({ color: { argb: 'FF0070C0' } })               // manual-input hint
const FONT_HEADER_GRAY = fnt({ bold: true })                             // gray header text

const ALIGN_CENTER: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle' }
const ALIGN_RIGHT:  Partial<ExcelJS.Alignment> = { horizontal: 'right',  vertical: 'middle' }
const ALIGN_LEFT:   Partial<ExcelJS.Alignment> = { horizontal: 'left',   vertical: 'middle' }

// ─── Date helpers ─────────────────────────────────────────────────────────────
function fmtDate(d: Date): string {
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

function fmtStay(ci: Date, co: Date): string {
  const ciD  = ci.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', timeZone: 'UTC' })
  const coD  = co.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', timeZone: 'UTC' })
  const year = ci.toLocaleDateString('id-ID', { year: '2-digit', timeZone: 'UTC' })
  return `${ciD}–${coD} '${year}`
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

// ─── Thin border helper ───────────────────────────────────────────────────────
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

// ─── Main route ───────────────────────────────────────────────────────────────
export const GET = withAuth(async (req: NextRequest) => {
  const { searchParams } = req.nextUrl
  const from          = searchParams.get('from')
  const to            = searchParams.get('to')
  const listingFilter = searchParams.get('listing')

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

  // ── Workbook setup ──────────────────────────────────────────────────────────
  const wb = new ExcelJS.Workbook()
  wb.creator = 'BSpace Finance'
  wb.created = new Date()
  wb.calcProperties = { fullCalcOnLoad: true }

  const ws = wb.addWorksheet('INCOME REPORT')

  // Column widths  A   B     C     D     E     F    G    H     I     J     K     L    M     N     O     P     Q
  const widths = [4, 12, 20, 36, 20, 7, 10, 14, 11, 12, 14, 7, 14, 14, 13, 13, 15]
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w })

  // ── Row 1: Title ────────────────────────────────────────────────────────────
  ws.mergeCells('A1:Q1')
  const r1 = ws.getCell('A1')
  r1.value = 'BSpace Finance — Villa Income Report'
  r1.font  = fnt({ bold: true, size: 14, color: { argb: 'FF1E3A5F' } })
  r1.alignment = ALIGN_LEFT
  ws.getRow(1).height = 24

  // ── Row 2: Period ───────────────────────────────────────────────────────────
  ws.mergeCells('A2:Q2')
  const r2 = ws.getCell('A2')
  r2.value = `Periode Check-in: ${fmtPeriod(from, to)}   |   ${bookings.length} booking`
  r2.font  = fnt({ color: { argb: 'FF555555' } })
  ws.getRow(2).height = 14

  // ── Row 3: Service rate assumption (matches CONTOH J4) ──────────────────────
  ws.getCell('I3').value     = 'SERVICE RATE'
  ws.getCell('I3').font      = FONT_BOLD
  ws.getCell('J3').value     = SERVICE_RATE   // → $J$3 in formulas
  ws.getCell('J3').numFmt    = pctFmt
  ws.getCell('J3').font      = fnt({ color: { argb: 'FF0070C0' }, bold: true })
  ws.getRow(3).height = 14

  // ── Row 4: blank ────────────────────────────────────────────────────────────
  ws.getRow(4).height = 6

  // ── Rows 5–6: Two-row merged header (matching CONTOH structure) ─────────────
  // Gray-filled "key input" columns: B DATE BOOKING, C NAME, D LISTING, F NIGHT, G OTA, H GROSS, M NETT
  // White headers for calculated columns
  // E (DATE STAY) — not merged; E6 has sub-label "Booking"
  // J (SERVICE)   — not merged; J6 has rate display
  // K (SELISIH)   — not merged; K6 has "system"

  const grayInputCols = ['B', 'C', 'D', 'F', 'G', 'H']  // key input cols → gray fill (M is now calculated)
  const mergedCols    = ['B', 'C', 'D', 'F', 'G', 'H', 'I', 'L', 'M', 'N', 'O', 'P', 'Q']
  for (const col of mergedCols) ws.mergeCells(`${col}5:${col}6`)

  const HEADER_ROW5: { col: string; label: string }[] = [
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

  for (const { col, label } of HEADER_ROW5) {
    const isGray = grayInputCols.includes(col)
    const cell = ws.getCell(`${col}5`)
    cell.value     = label
    cell.font      = FONT_HEADER_GRAY
    cell.fill      = fill(isGray ? FILL_HEADER_GRAY : FILL_HEADER_DARK)
    cell.alignment = { ...ALIGN_CENTER, wrapText: true }
    cell.border    = whiteBorder
    if (['P'].includes(col)) cell.font = fnt({ bold: true, color: { argb: 'FFFF0000' } })
    if (!isGray && col !== 'P') cell.font = fnt({ bold: true, color: { argb: 'FFFFFFFF' } })
  }

  // Row 6 sub-labels
  const subLabels: { col: string; label: string }[] = [
    { col: 'E', label: 'Booking'      },
    { col: 'J', label: `${(SERVICE_RATE * 100).toFixed(0)}%` },
    { col: 'K', label: 'system'       },
  ]
  for (const { col, label } of subLabels) {
    const isGray = grayInputCols.includes(col)
    const cell = ws.getCell(`${col}6`)
    cell.value     = label
    cell.font      = isGray ? FONT_HEADER_GRAY : fnt({ bold: true, color: { argb: 'FFFFFFFF' } })
    cell.fill      = fill(isGray ? FILL_HEADER_GRAY : FILL_HEADER_DARK)
    cell.alignment = ALIGN_CENTER
    cell.border    = whiteBorder
  }

  // ── Data rows starting at row 7 ─────────────────────────────────────────────
  const DATA_START = 7

  // Running totals for accurate total-row result values
  let totGross = 0, totService = 0, totSelisih = 0, totNett = 0, totPB1 = 0, totOwner = 0

  bookings.forEach((b, idx) => {
    const r     = DATA_START + idx
    const row   = ws.getRow(r)
    row.height  = 15

    const gross   = parseFloat(b.accommodationFare.toString())
    const service = gross * SERVICE_RATE
    const nett    = gross - service          // NETT = GROSS − SERVICE (always < GROSS)
    const selisih = 0                        // SELISIH = GROSS − SERVICE − NETT = 0 by definition
    const taxBase = nett / 1.21
    const sc      = taxBase * 0.10
    const pb1     = (taxBase + sc) * 0.10
    const owner   = nett - pb1

    totGross   += gross
    totService += service
    totSelisih += selisih
    totNett    += nett
    totPB1     += pb1
    totOwner   += owner

    const isEven  = idx % 2 === 1
    const rowFill = isEven ? fill(FILL_ROW_ALT) : undefined

    function setCell(col: number, value: ExcelJS.CellValue, opts: {
      numFmt?: string; align?: Partial<ExcelJS.Alignment>; font?: Partial<ExcelJS.Font>; cellFill?: ExcelJS.Fill
    } = {}) {
      const cell = row.getCell(col)
      cell.value     = value
      cell.font      = opts.font ?? FONT_BASE
      if (opts.numFmt)   cell.numFmt   = opts.numFmt
      if (opts.align)    cell.alignment = opts.align
      cell.fill      = opts.cellFill ?? rowFill ?? { type: 'pattern', pattern: 'none' } as ExcelJS.Fill
      cell.border    = hairBorder
    }

    // A: (spacer)
    row.getCell(1).fill   = rowFill ?? { type: 'pattern', pattern: 'none' } as ExcelJS.Fill
    row.getCell(1).border = hairBorder

    // B: DATE BOOKING
    setCell(2, fmtDate(b.checkIn), { align: ALIGN_CENTER })
    // C: NAME
    setCell(3, b.guestName || '—')
    // D: LISTING (fixEncoding cleans garbled UTF-8 already stored in DB)
    setCell(4, fixEncoding(b.listing))
    // E: DATE STAY
    setCell(5, fmtStay(b.checkIn, b.checkOut), { align: ALIGN_CENTER })
    // F: NIGHT
    setCell(6, b.numberOfNights, { align: ALIGN_CENTER })
    // G: OTA
    setCell(7, b.source.toUpperCase(), { align: ALIGN_CENTER })
    // H: REVENUE GROSS ← gray key-input col
    setCell(8, gross, { numFmt: idrFmt, align: ALIGN_RIGHT })
    // I: DISCOUNT ← yellow, manual input, blue font hint
    setCell(9, 0, { numFmt: idrFmt, align: ALIGN_RIGHT, font: FONT_BLUE, cellFill: fill(FILL_YELLOW) })
    // J: SERVICE = H × $J$3
    setCell(10, { formula: `H${r}*$J$3`, result: service }, { numFmt: idrFmt, align: ALIGN_RIGHT })
    // K: SELISIH & DISC = H − J − M
    setCell(11, { formula: `H${r}-J${r}-M${r}`, result: selisih }, { numFmt: idrFmt, align: ALIGN_RIGHT })
    // L: % = K / H
    setCell(12, { formula: `K${r}/H${r}`, result: gross !== 0 ? selisih / gross : 0 }, { numFmt: pctFmt, align: ALIGN_RIGHT })
    // M: NETT = GROSS − SERVICE (formula, always < GROSS)
    setCell(13, { formula: `H${r}-J${r}`, result: nett }, { numFmt: idrFmt, align: ALIGN_RIGHT, font: fnt({ bold: true }) })
    // N: TAX = M / 1.21
    setCell(14, { formula: `M${r}/1.21`, result: taxBase }, { numFmt: idrFmt, align: ALIGN_RIGHT })
    // O: SC = N × 10%
    setCell(15, { formula: `N${r}*10%`, result: sc }, { numFmt: idrFmt, align: ALIGN_RIGHT })
    // P: PB 1 = (N + O) × 10% ← red font
    setCell(16, { formula: `(N${r}+O${r})*10%`, result: pb1 }, { numFmt: idrFmt, align: ALIGN_RIGHT, font: FONT_RED })
    // Q: REVENUE OWNER = M − P
    setCell(17, { formula: `M${r}-P${r}`, result: owner }, { numFmt: idrFmt, align: ALIGN_RIGHT, font: fnt({ bold: true }) })
  })

  // ── Total row (matching CONTOH yellow/green highlights) ─────────────────────
  const totalRow = DATA_START + bookings.length
  const tr       = ws.getRow(totalRow)
  tr.height      = 18

  ws.mergeCells(`A${totalRow}:G${totalRow}`)
  const labelCell = tr.getCell(1)
  labelCell.value     = `TOTAL — ${bookings.length} Booking`
  labelCell.font      = FONT_WHITE
  labelCell.fill      = fill(FILL_TOTAL)
  labelCell.alignment = ALIGN_LEFT

  // Totals: H (Gross), J (Service), K (Selisih), M (Nett), P (PB1), Q (Owner)
  const totalDefs: { col: number; letter: string; result: number; cellFill: string; font: Partial<ExcelJS.Font> }[] = [
    { col: 8,  letter: 'H', result: totGross,   cellFill: 'FFFFFF00', font: FONT_BOLD },   // yellow (CONTOH match)
    { col: 10, letter: 'J', result: totService,  cellFill: FILL_TOTAL, font: FONT_WHITE },
    { col: 11, letter: 'K', result: totSelisih,  cellFill: FILL_TOTAL, font: FONT_WHITE },
    { col: 13, letter: 'M', result: totNett,     cellFill: 'FFFFFF00', font: FONT_BOLD },   // yellow (CONTOH match)
    { col: 16, letter: 'P', result: totPB1,      cellFill: 'FFFFFF00', font: FONT_RED  },   // yellow + red (CONTOH match)
    { col: 17, letter: 'Q', result: totOwner,    cellFill: FILL_OWNER_GREEN, font: FONT_BOLD }, // green (CONTOH match)
  ]

  // Fill non-total numeric cols with dark background
  const allTotalCols = new Set(totalDefs.map(d => d.col))
  for (let c = 2; c <= 17; c++) {
    if (!allTotalCols.has(c)) {
      const cell   = tr.getCell(c)
      cell.fill    = fill(FILL_TOTAL)
      cell.border  = whiteBorder
    }
  }

  for (const { col, letter, result, cellFill, font } of totalDefs) {
    const cell = tr.getCell(col)
    cell.value     = { formula: `SUM(${letter}${DATA_START}:${letter}${totalRow - 1})`, result }
    cell.numFmt    = idrFmt
    cell.font      = font
    cell.fill      = fill(cellFill)
    cell.alignment = ALIGN_RIGHT
    cell.border    = whiteBorder
  }

  // Freeze panes after header rows
  ws.views = [{ state: 'frozen', ySplit: 6 }]

  // ── Output ──────────────────────────────────────────────────────────────────
  const buffer    = await wb.xlsx.writeBuffer()
  const dateStr   = new Date().toISOString().slice(0, 10)
  const periodSlug = from && to ? `${from}_${to}` : from || to || 'all'
  const filename  = `income-report-${periodSlug}-${dateStr}.xlsx`

  return new NextResponse(Buffer.from(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}, ['admin', 'finance', 'manager'])
