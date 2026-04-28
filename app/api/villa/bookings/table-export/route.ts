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

// ─── Safe sheet name ─────────────────────────────────────────────────────────
function safeName(name: string): string {
  return name.replace(/[\\/?*[\]]/g, '').slice(0, 31)
}

// ─── Build one INCOME-format worksheet ───────────────────────────────────────
// Column layout (20 cols, A=spacer):
// B=DATE BOOKING | C=NAME | D=ROOM | E=DATE STAY | F=NIGHT | G=OTA
// H=REVENUE GROSS | I=DISC | J=FEE OTA | K=TAX(selisih) | L=ALL REDUCTION
// M=REVENUE NETT | N=REVENUE | O=/NIGHT | P=TAX | Q=SC | R=PB1 | S=NETT AFTER PB1 | T=/NIGHT
function buildIncomeSheet(
  wb: ExcelJS.Workbook,
  sheetName: string,
  bookings: {
    checkIn: Date; checkOut: Date; guestName: string | null; listing: string;
    numberOfNights: number | null; source: string; accommodationFare: { toString(): string }; totalPayout: { toString(): string }
  }[],
  from: string | null,
  to: string | null,
) {
  const ws = wb.addWorksheet(sheetName)

  // A   B    C    D    E    F   G    H    I    J    K    L    M    N    O    P    Q    R    S    T
  const widths = [3, 12, 20, 10, 20, 7, 10, 14, 10, 12, 12, 14, 14, 14, 10, 12, 10, 12, 16, 10]
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w })

  // Row 1: Title
  ws.mergeCells('A1:T1')
  const r1 = ws.getCell('A1')
  r1.value = sheetName === 'INCOME REPORT'
    ? 'BSpace Finance — Villa Income Report'
    : `BSpace Finance — ${sheetName}`
  r1.font  = fnt({ bold: true, size: 14, color: { argb: 'FF1E3A5F' } })
  r1.alignment = ALIGN_LEFT
  ws.getRow(1).height = 24

  // Row 2: Period
  ws.mergeCells('A2:T2')
  const r2 = ws.getCell('A2')
  r2.value = `Periode Check-in: ${fmtPeriod(from, to)}   |   ${bookings.length} booking`
  r2.font  = fnt({ color: { argb: 'FF555555' } })
  ws.getRow(2).height = 14

  // Row 3: Service rate assumption ($J$3 referenced in FEE OTA formula)
  ws.getCell('I3').value  = 'SERVICE RATE'
  ws.getCell('I3').font   = FONT_BOLD
  ws.getCell('J3').value  = SERVICE_RATE
  ws.getCell('J3').numFmt = pctFmt
  ws.getCell('J3').font   = fnt({ color: { argb: 'FF0070C0' }, bold: true })
  ws.getRow(3).height = 14

  // Row 4: blank
  ws.getRow(4).height = 6

  // Rows 5–6: Two-row header
  // Gray = key input cols; E and J have sub-labels in row 6; rest merged 5:6
  const grayInputCols = ['B', 'C', 'D', 'F', 'G', 'H']
  const mergedCols    = ['B', 'C', 'D', 'F', 'G', 'H', 'I', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T']
  for (const col of mergedCols) ws.mergeCells(`${col}5:${col}6`)

  const HEADERS: { col: string; label: string }[] = [
    { col: 'B', label: 'DATE\nBOOKING'    },
    { col: 'C', label: 'NAME'             },
    { col: 'D', label: 'ROOM'             },
    { col: 'E', label: 'DATE STAY'        },
    { col: 'F', label: 'NIGHT'            },
    { col: 'G', label: 'OTA'              },
    { col: 'H', label: 'REVENUE\nGROSS'  },
    { col: 'I', label: 'DISC'             },
    { col: 'J', label: 'FEE OTA'          },
    { col: 'K', label: 'TAX'              },
    { col: 'L', label: 'ALL\nREDUCTION'  },
    { col: 'M', label: 'REVENUE\nNETT'   },
    { col: 'N', label: 'REVENUE'          },
    { col: 'O', label: '/ NIGHT'          },
    { col: 'P', label: 'TAX'              },
    { col: 'Q', label: 'SC'               },
    { col: 'R', label: 'PB1'              },
    { col: 'S', label: 'NETT\nAFTER PB1' },
    { col: 'T', label: '/ NIGHT'          },
  ]

  ws.getRow(5).height = 28
  ws.getRow(6).height = 14

  for (const { col, label } of HEADERS) {
    const isGray = grayInputCols.includes(col)
    const cell = ws.getCell(`${col}5`)
    cell.value     = label
    cell.fill      = fill(isGray ? FILL_HEADER_GRAY : FILL_HEADER_DARK)
    cell.font      = isGray ? FONT_HEADER_GRAY
      : col === 'R' ? fnt({ bold: true, color: { argb: 'FFFF0000' } })
      : fnt({ bold: true, color: { argb: 'FFFFFFFF' } })
    cell.alignment = { ...ALIGN_CENTER, wrapText: true }
    cell.border    = whiteBorder
  }

  // Row 6 sub-labels (for E and J only)
  for (const { col, label } of [
    { col: 'E', label: 'Booking'                              },
    { col: 'J', label: `${(SERVICE_RATE * 100).toFixed(0)}%` },
  ]) {
    const cell = ws.getCell(`${col}6`)
    cell.value     = label
    cell.fill      = fill(FILL_HEADER_DARK)
    cell.font      = fnt({ bold: true, color: { argb: 'FFFFFFFF' } })
    cell.alignment = ALIGN_CENTER
    cell.border    = whiteBorder
  }

  // Data rows starting at row 7
  const DATA_START = 7
  let totGross = 0, totFeeOTA = 0, totTax = 0, totAllRed = 0
  let totRevNett = 0, totTax2 = 0, totSC = 0, totPB1 = 0, totNettPB1 = 0

  bookings.forEach((b, idx) => {
    const r     = DATA_START + idx
    const row   = ws.getRow(r)
    row.height  = 15

    const revNett   = parseFloat(b.totalPayout.toString())          // M: REVENUE NETT from Guesty
    const gross     = Math.max(parseFloat(b.accommodationFare.toString()), revNett) // H: GROSS always ≥ NETT
    const feeOTA   = gross * SERVICE_RATE                            // J: 3%
    const taxSel   = Math.max(0, gross - feeOTA - revNett)          // K: MAX(0, delta)
    const allRed   = feeOTA + taxSel                                 // L: (DISC handled via formula)
    const nights   = b.numberOfNights ?? 0
    const taxBase  = revNett / 1.21                                  // P
    const sc       = taxBase * 0.10                                  // Q
    const pb1      = (taxBase + sc) * 0.10                          // R
    const nettPB1  = revNett - pb1                                   // S
    const perNight1 = nights > 0 ? revNett / nights : 0             // O
    const perNight2 = nights > 0 ? nettPB1 / nights : 0             // T

    totGross    += gross
    totFeeOTA   += feeOTA
    totTax      += taxSel
    totAllRed   += allRed
    totRevNett  += revNett
    totTax2     += taxBase
    totSC       += sc
    totPB1      += pb1
    totNettPB1  += nettPB1

    const isEven  = idx % 2 === 1
    const rowFill = isEven ? fill(FILL_ROW_ALT) : undefined

    const setCell = (col: number, value: ExcelJS.CellValue, opts: {
      numFmt?: string; align?: Partial<ExcelJS.Alignment>; font?: Partial<ExcelJS.Font>; cellFill?: ExcelJS.Fill
    } = {}) => {
      const cell = row.getCell(col)
      cell.value     = value
      cell.font      = opts.font ?? FONT_BASE
      if (opts.numFmt)   cell.numFmt   = opts.numFmt
      if (opts.align)    cell.alignment = opts.align
      cell.fill      = opts.cellFill ?? rowFill ?? { type: 'pattern', pattern: 'none' } as ExcelJS.Fill
      cell.border    = hairBorder
    }

    row.getCell(1).fill   = rowFill ?? { type: 'pattern', pattern: 'none' } as ExcelJS.Fill
    row.getCell(1).border = hairBorder

    const roomCode = fixEncoding(b.listing).split(' / ')[0].trim()

    setCell(2,  fmtDate(b.checkIn), { align: ALIGN_CENTER })                             // B: DATE BOOKING
    setCell(3,  b.guestName || '—')                                                       // C: NAME
    setCell(4,  roomCode)                                                                  // D: ROOM
    setCell(5,  fmtStay(b.checkIn, b.checkOut), { align: ALIGN_CENTER })                 // E: DATE STAY
    setCell(6,  nights, { align: ALIGN_CENTER })                                          // F: NIGHT
    setCell(7,  b.source.toUpperCase(), { align: ALIGN_CENTER })                          // G: OTA
    setCell(8,  gross,    { numFmt: idrFmt, align: ALIGN_RIGHT })                         // H: REVENUE GROSS
    setCell(9,  0,        { numFmt: idrFmt, align: ALIGN_RIGHT, font: FONT_BLUE, cellFill: fill(FILL_YELLOW) }) // I: DISC
    setCell(10, { formula: `H${r}*$J$3`, result: feeOTA },             { numFmt: idrFmt, align: ALIGN_RIGHT }) // J: FEE OTA
    setCell(11, { formula: `MAX(0,H${r}-J${r}-M${r})`, result: taxSel }, { numFmt: idrFmt, align: ALIGN_RIGHT }) // K: TAX
    setCell(12, { formula: `I${r}+J${r}+K${r}`, result: allRed },      { numFmt: idrFmt, align: ALIGN_RIGHT }) // L: ALL REDUCTION
    setCell(13, revNett,  { numFmt: idrFmt, align: ALIGN_RIGHT, font: fnt({ bold: true }) }) // M: REVENUE NETT
    setCell(14, { formula: `M${r}`, result: revNett },                  { numFmt: idrFmt, align: ALIGN_RIGHT }) // N: REVENUE
    setCell(15, { formula: `IF(F${r}=0,0,N${r}/F${r})`, result: perNight1 }, { numFmt: idrFmt, align: ALIGN_RIGHT }) // O: /NIGHT
    setCell(16, { formula: `M${r}/1.21`, result: taxBase },             { numFmt: idrFmt, align: ALIGN_RIGHT }) // P: TAX
    setCell(17, { formula: `P${r}*10%`, result: sc },                   { numFmt: idrFmt, align: ALIGN_RIGHT }) // Q: SC
    setCell(18, { formula: `(P${r}+Q${r})*10%`, result: pb1 },         { numFmt: idrFmt, align: ALIGN_RIGHT, font: FONT_RED }) // R: PB1
    setCell(19, { formula: `M${r}-R${r}`, result: nettPB1 },           { numFmt: idrFmt, align: ALIGN_RIGHT, font: fnt({ bold: true }) }) // S: NETT AFTER PB1
    setCell(20, { formula: `IF(F${r}=0,0,S${r}/F${r})`, result: perNight2 }, { numFmt: idrFmt, align: ALIGN_RIGHT }) // T: /NIGHT
  })

  // Total row
  const totalRow = DATA_START + bookings.length
  const tr       = ws.getRow(totalRow)
  tr.height      = 18

  ws.mergeCells(`A${totalRow}:G${totalRow}`)
  tr.getCell(1).value     = `TOTAL — ${bookings.length} Booking`
  tr.getCell(1).font      = FONT_WHITE
  tr.getCell(1).fill      = fill(FILL_TOTAL)
  tr.getCell(1).alignment = ALIGN_LEFT

  const totalDefs: { col: number; letter: string; result: number; cellFill: string; font: Partial<ExcelJS.Font>; blank?: boolean }[] = [
    { col: 8,  letter: 'H', result: totGross,    cellFill: 'FFFFFF00',       font: FONT_BOLD  }, // GROSS yellow
    { col: 9,  letter: 'I', result: 0,            cellFill: FILL_TOTAL,       font: FONT_WHITE }, // DISC
    { col: 10, letter: 'J', result: totFeeOTA,    cellFill: FILL_TOTAL,       font: FONT_WHITE }, // FEE OTA
    { col: 11, letter: 'K', result: totTax,       cellFill: FILL_TOTAL,       font: FONT_WHITE }, // TAX
    { col: 12, letter: 'L', result: totAllRed,    cellFill: FILL_TOTAL,       font: FONT_WHITE }, // ALL REDUCTION
    { col: 13, letter: 'M', result: totRevNett,   cellFill: 'FFFFFF00',       font: FONT_BOLD  }, // REV NETT yellow
    { col: 14, letter: 'N', result: totRevNett,   cellFill: 'FFFFFF00',       font: FONT_BOLD  }, // REVENUE yellow
    { col: 15, letter: 'O', result: 0, blank: true, cellFill: FILL_TOTAL,     font: FONT_WHITE }, // /NIGHT blank
    { col: 16, letter: 'P', result: totTax2,      cellFill: FILL_TOTAL,       font: FONT_WHITE }, // TAX
    { col: 17, letter: 'Q', result: totSC,        cellFill: FILL_TOTAL,       font: FONT_WHITE }, // SC
    { col: 18, letter: 'R', result: totPB1,       cellFill: 'FFFFFF00',       font: FONT_RED   }, // PB1 yellow+red
    { col: 19, letter: 'S', result: totNettPB1,   cellFill: FILL_OWNER_GREEN, font: FONT_BOLD  }, // NETT AFTER PB1
    { col: 20, letter: 'T', result: 0, blank: true, cellFill: FILL_TOTAL,     font: FONT_WHITE }, // /NIGHT blank
  ]

  const allTotalCols = new Set(totalDefs.map(d => d.col))
  for (let c = 2; c <= 20; c++) {
    if (!allTotalCols.has(c)) { tr.getCell(c).fill = fill(FILL_TOTAL); tr.getCell(c).border = whiteBorder }
  }
  for (const { col, letter, result, cellFill, font, blank } of totalDefs) {
    const cell = tr.getCell(col)
    cell.value     = blank ? null : { formula: `SUM(${letter}${DATA_START}:${letter}${totalRow - 1})`, result }
    cell.numFmt    = idrFmt
    cell.font      = font
    cell.fill      = fill(cellFill)
    cell.alignment = ALIGN_RIGHT
    cell.border    = whiteBorder
  }

  ws.views = [{ state: 'frozen', ySplit: 6 }]
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

  // Sheet 1: All bookings combined
  buildIncomeSheet(wb, 'INCOME REPORT', bookings, from, to)

  // Sheets 2+: One tab per listing
  const byListing = new Map<string, typeof bookings>()
  for (const b of bookings) {
    const key = fixEncoding(b.listing)
    if (!byListing.has(key)) byListing.set(key, [])
    byListing.get(key)!.push(b)
  }
  for (const [listingName, listingBookings] of Array.from(byListing.entries())) {
    buildIncomeSheet(wb, safeName(listingName), listingBookings, from, to)
  }

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
