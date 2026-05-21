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

// ─── OTA accommodation fare (reverse-engineered from Guesty reservation UI) ──
// Airbnb adds ~15% guest service fee on top of host base rate → divide by 1.15
// Booking.com adds ~30% markup on top of base rate   → divide by 1.30
// Manual / Owner / Trip.com / unknown                → use CSV value as-is
function otaAccomm(source: string, csvFare: number, totalPayout: number): number {
  const s = source.toLowerCase()
  if (s.startsWith('airbnb')) return csvFare / 1.15
  if (s === 'booking.com') return totalPayout
  return csvFare
}

// TODO: Booking.com REVENUE NETT should = accommodationFare - hostChannelFee (OTA commission).
// The "Host channel fee" field is not in the current Guesty CSV export (only 11 columns).
// Using accommodationFare as a stand-in until the CSV is re-exported with that column.
function otaNett(source: string, accommodationFare: number, totalPayout: number): number {
  if (source.toLowerCase().trim() === 'booking.com') return accommodationFare
  return totalPayout
}

// ─── REKAPITULASI sheet (per-villa OCC + Revenue NETT overview) ──────────────

function buildRekapSheet(
  wb: ExcelJS.Workbook,
  bookings: { source: string; totalPayout: { toString(): string }; accommodationFare: { toString(): string }; numberOfNights: number | null; listing: string }[],
  from: string | null,
  to: string | null,
) {
  const grouped = new Map<string, { nett: number; nights: number }>()
  for (const b of bookings) {
    const key = fixEncoding(b.listing)
    if (!grouped.has(key)) grouped.set(key, { nett: 0, nights: 0 })
    const g = grouped.get(key)!
    g.nett   += otaNett(b.source, parseFloat(b.accommodationFare.toString()), parseFloat(b.totalPayout.toString()))
    g.nights += b.numberOfNights ?? 0
  }

  let totalDays = 30
  if (from && to) {
    totalDays = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1
  }

  const ws = wb.addWorksheet('REKAPITULASI')
  ;[3, 36, 10, 18, 10, 18].forEach((w, i) => { ws.getColumn(i + 1).width = w })

  ws.mergeCells('B1:F1')
  ws.getCell('B1').value     = `REAL ${fmtPeriod(from, to).toUpperCase()}`
  ws.getCell('B1').font      = fnt({ bold: true, size: 13, color: { argb: FILL_HEADER_DARK } })
  ws.getCell('B1').alignment = ALIGN_LEFT
  ws.getRow(1).height = 22

  ws.mergeCells('B2:F2')
  ws.getCell('B2').value = `Total ${grouped.size} Villa · Periode: ${fmtPeriod(from, to)} · ${totalDays} hari`
  ws.getCell('B2').font  = fnt({ color: { argb: 'FF555555' } })
  ws.getRow(2).height = 14
  ws.getRow(3).height = 6

  for (const { col, label, argb } of [
    { col: 'B', label: 'VILLA',        argb: FILL_HEADER_DARK },
    { col: 'C', label: '% OCC',        argb: 'FF2E4F6F'       },
    { col: 'D', label: 'REVENUE NETT', argb: 'FF1E6B3A'       },
    { col: 'E', label: 'NIGHT',        argb: 'FF2E4F6F'       },
    { col: 'F', label: 'AVERAGE',      argb: 'FF2E4F6F'       },
  ]) {
    const cell = ws.getCell(`${col}4`)
    cell.value = label; cell.font = FONT_WHITE
    cell.fill  = fill(argb); cell.alignment = ALIGN_CENTER; cell.border = whiteBorder
  }
  ws.getRow(4).height = 16

  const R_START = 5
  const list = Array.from(grouped.entries()).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true, sensitivity: 'base' }))

  list.forEach(([listing, agg], idx) => {
    const r   = R_START + idx
    const row = ws.getRow(r)
    row.height  = 15
    const isEven  = idx % 2 === 1
    const rowFill = isEven ? fill(FILL_ROW_ALT) : undefined
    const occ = Math.min(1, totalDays > 0 ? agg.nights / totalDays : 0)
    const avg = agg.nights > 0 ? agg.nett / agg.nights : 0

    const setR = (col: number, value: ExcelJS.CellValue, opts: {
      numFmt?: string; align?: Partial<ExcelJS.Alignment>; font?: Partial<ExcelJS.Font>
    } = {}) => {
      const cell = row.getCell(col)
      cell.value = value; cell.font = opts.font ?? FONT_BASE
      if (opts.numFmt) cell.numFmt = opts.numFmt
      if (opts.align)  cell.alignment = opts.align
      cell.fill   = rowFill ?? ({ type: 'pattern', pattern: 'none' } as ExcelJS.Fill)
      cell.border = hairBorder
    }

    row.getCell(1).fill   = rowFill ?? ({ type: 'pattern', pattern: 'none' } as ExcelJS.Fill)
    row.getCell(1).border = hairBorder
    setR(2, listing.split(' / ')[0].trim())
    setR(3, occ,       { numFmt: '0.0%', align: ALIGN_CENTER })
    setR(4, agg.nett,  { numFmt: idrFmt, align: ALIGN_RIGHT, font: FONT_BOLD })
    setR(5, agg.nights,                  { align: ALIGN_CENTER })
    setR(6, avg,       { numFmt: idrFmt, align: ALIGN_RIGHT })
  })

  const totRow    = R_START + list.length
  const totNights = list.reduce((s, [, a]) => s + a.nights, 0)
  const totNett   = list.reduce((s, [, a]) => s + a.nett, 0)
  const totAvg    = totNights > 0 ? totNett / totNights : 0
  const thinBdr   = { top: { style: 'thin' as const, color: { argb: 'FFAAAAAA' } }, bottom: { style: 'thin' as const, color: { argb: 'FFAAAAAA' } } }

  const tr = ws.getRow(totRow)
  tr.height = 18
  ws.mergeCells(`B${totRow}:C${totRow}`)
  tr.getCell(2).value = `TOTAL (${list.length} Villa)`; tr.getCell(2).font = FONT_WHITE
  tr.getCell(2).fill  = fill(FILL_HEADER_DARK); tr.getCell(2).alignment = ALIGN_LEFT; tr.getCell(2).border = thinBdr
  tr.getCell(4).value = { formula: `SUM(D${R_START}:D${totRow - 1})`, result: totNett }
  tr.getCell(4).numFmt = idrFmt; tr.getCell(4).font = FONT_WHITE; tr.getCell(4).fill = fill('FF1E6B3A')
  tr.getCell(4).alignment = ALIGN_RIGHT; tr.getCell(4).border = thinBdr
  tr.getCell(5).value = { formula: `SUM(E${R_START}:E${totRow - 1})`, result: totNights }
  tr.getCell(5).font = FONT_WHITE; tr.getCell(5).fill = fill(FILL_HEADER_DARK)
  tr.getCell(5).alignment = ALIGN_CENTER; tr.getCell(5).border = thinBdr
  tr.getCell(6).value = { formula: `IF(E${totRow}=0,0,D${totRow}/E${totRow})`, result: totAvg }
  tr.getCell(6).numFmt = idrFmt; tr.getCell(6).font = FONT_WHITE; tr.getCell(6).fill = fill(FILL_HEADER_DARK)
  tr.getCell(6).alignment = ALIGN_RIGHT; tr.getCell(6).border = thinBdr
  for (const c of [1, 3]) { tr.getCell(c).fill = fill(FILL_HEADER_DARK); tr.getCell(c).border = thinBdr }

  ws.autoFilter = 'B4:F4'
  ws.views = [{ state: 'frozen', ySplit: 4 }]
}

// ─── Build one INCOME-format worksheet ───────────────────────────────────────
// Column layout (21 cols, A=spacer):
// B=DATE BOOKING | C=NAME | D=ROOM | E=DATE STAY | F=NIGHT | G=OTA
// H=REVENUE GROSS | I=ACCOMM FARE | J=DISC | K=FEE OTA | L=TAX | M=ALL REDUCTION
// N=REVENUE NETT | O=REVENUE | P=/NIGHT | Q=TAX | R=SC | S=PB1 | T=NETT AFTER PB1 | U=/NIGHT
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

  // A   B    C    D    E    F   G    H    I    J    K    L    M    N    O    P    Q    R    S    T    U
  const widths = [3, 12, 20, 10, 20, 7, 10, 14, 14, 10, 12, 12, 14, 14, 14, 10, 12, 10, 12, 16, 10]
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w })

  // Row 1: Title
  ws.mergeCells('A1:U1')
  const r1 = ws.getCell('A1')
  r1.value = sheetName === 'INCOME REPORT'
    ? 'BSpace Finance — Villa Income Report'
    : `BSpace Finance — ${sheetName}`
  r1.font  = fnt({ bold: true, size: 14, color: { argb: 'FF1E3A5F' } })
  r1.alignment = ALIGN_LEFT
  ws.getRow(1).height = 24

  // Row 2: Period
  ws.mergeCells('A2:U2')
  const r2 = ws.getCell('A2')
  r2.value = `Periode Check-in: ${fmtPeriod(from, to)}   |   ${bookings.length} booking`
  r2.font  = fnt({ color: { argb: 'FF555555' } })
  ws.getRow(2).height = 14

  // Row 3: Service rate ($K$3 referenced in FEE OTA formula)
  ws.getCell('J3').value  = 'SERVICE RATE'
  ws.getCell('J3').font   = FONT_BOLD
  ws.getCell('K3').value  = SERVICE_RATE
  ws.getCell('K3').numFmt = pctFmt
  ws.getCell('K3').font   = fnt({ color: { argb: 'FF0070C0' }, bold: true })
  ws.getRow(3).height = 14

  // Row 4: blank
  ws.getRow(4).height = 6

  // Rows 5–6: Two-row header
  // Gray = key input cols; E and K have sub-labels in row 6; rest merged 5:6
  const grayInputCols = ['B', 'C', 'D', 'F', 'G', 'H', 'I']  // I = ACCOMM FARE (raw input)
  const mergedCols    = ['B', 'C', 'D', 'F', 'G', 'H', 'I', 'J', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U']
  for (const col of mergedCols) ws.mergeCells(`${col}5:${col}6`)

  const HEADERS: { col: string; label: string }[] = [
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

  ws.getRow(5).height = 28
  ws.getRow(6).height = 14

  for (const { col, label } of HEADERS) {
    const isGray = grayInputCols.includes(col)
    const cell = ws.getCell(`${col}5`)
    cell.value     = label
    cell.fill      = fill(isGray ? FILL_HEADER_GRAY : FILL_HEADER_DARK)
    cell.font      = isGray ? FONT_HEADER_GRAY
      : col === 'S' ? fnt({ bold: true, color: { argb: 'FFFF0000' } })
      : fnt({ bold: true, color: { argb: 'FFFFFFFF' } })
    cell.alignment = { ...ALIGN_CENTER, wrapText: true }
    cell.border    = whiteBorder
  }

  // Row 6 sub-labels (E = date sub-label, K = service rate %)
  for (const { col, label } of [
    { col: 'E', label: 'Booking'                              },
    { col: 'K', label: `${(SERVICE_RATE * 100).toFixed(0)}%` },
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
  let totGross = 0, totAccomm = 0, totFeeOTA = 0, totTax = 0, totAllRed = 0
  let totRevNett = 0, totTax2 = 0, totSC = 0, totPB1 = 0, totNettPB1 = 0

  bookings.forEach((b, idx) => {
    const r     = DATA_START + idx
    const row   = ws.getRow(r)
    row.height  = 15

    const csvFare   = parseFloat(b.accommodationFare.toString())
    const csvPayout = parseFloat(b.totalPayout.toString())
    const revNett   = otaNett(b.source, csvFare, csvPayout)               // N: REVENUE NETT
    const accomm    = otaAccomm(b.source, csvFare, csvPayout)             // I: ACCOMM FARE (Booking.com = totalPayout)
    const gross     = accomm                                              // H: GROSS = ACCOMM FARE
    const feeOTA    = gross * SERVICE_RATE                               // K: 3%
    const taxSel    = Math.max(0, gross - feeOTA - revNett)             // L: MAX(0, delta)
    const allRed    = feeOTA + taxSel                                    // M: (DISC via formula)
    const nights    = b.numberOfNights ?? 0
    const taxBase   = revNett / 1.21                                     // Q
    const sc        = taxBase * 0.10                                     // R
    const pb1       = (taxBase + sc) * 0.10                             // S
    const nettPB1   = revNett - pb1                                      // T
    const perNight1 = nights > 0 ? revNett / nights : 0                 // P
    const perNight2 = nights > 0 ? nettPB1 / nights : 0                 // U

    totGross    += gross
    totAccomm   += accomm
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

    setCell(2,  fmtDate(b.checkIn), { align: ALIGN_CENTER })                                                          // B: DATE BOOKING
    setCell(3,  b.guestName || '—')                                                                                    // C: NAME
    setCell(4,  roomCode)                                                                                               // D: ROOM
    setCell(5,  fmtStay(b.checkIn, b.checkOut), { align: ALIGN_CENTER })                                              // E: DATE STAY
    setCell(6,  nights, { align: ALIGN_CENTER })                                                                       // F: NIGHT
    setCell(7,  b.source.toUpperCase(), { align: ALIGN_CENTER })                                                       // G: OTA
    setCell(8,  gross,   { numFmt: idrFmt, align: ALIGN_RIGHT })                                                       // H: REVENUE GROSS
    setCell(9,  accomm,  { numFmt: idrFmt, align: ALIGN_RIGHT, font: FONT_HEADER_GRAY })                              // I: ACCOMM FARE
    setCell(10, 0,       { numFmt: idrFmt, align: ALIGN_RIGHT, font: FONT_BLUE, cellFill: fill(FILL_YELLOW) })        // J: DISC (manual)
    setCell(11, { formula: `H${r}*$K$3`, result: feeOTA },              { numFmt: idrFmt, align: ALIGN_RIGHT })      // K: FEE OTA
    setCell(12, { formula: `MAX(0,H${r}-K${r}-N${r})`, result: taxSel },{ numFmt: idrFmt, align: ALIGN_RIGHT })      // L: TAX
    setCell(13, { formula: `J${r}+K${r}+L${r}`, result: allRed },       { numFmt: idrFmt, align: ALIGN_RIGHT })      // M: ALL REDUCTION
    setCell(14, revNett,  { numFmt: idrFmt, align: ALIGN_RIGHT, font: fnt({ bold: true }) })                          // N: REVENUE NETT
    setCell(15, { formula: `N${r}`, result: revNett },                   { numFmt: idrFmt, align: ALIGN_RIGHT })      // O: REVENUE
    setCell(16, { formula: `IF(F${r}=0,0,O${r}/F${r})`, result: perNight1 }, { numFmt: idrFmt, align: ALIGN_RIGHT }) // P: /NIGHT
    setCell(17, { formula: `N${r}/1.21`, result: taxBase },              { numFmt: idrFmt, align: ALIGN_RIGHT })      // Q: TAX
    setCell(18, { formula: `Q${r}*10%`, result: sc },                    { numFmt: idrFmt, align: ALIGN_RIGHT })      // R: SC
    setCell(19, { formula: `(Q${r}+R${r})*10%`, result: pb1 },          { numFmt: idrFmt, align: ALIGN_RIGHT, font: FONT_RED }) // S: PB1
    setCell(20, { formula: `N${r}-S${r}`, result: nettPB1 },            { numFmt: idrFmt, align: ALIGN_RIGHT, font: fnt({ bold: true }) }) // T: NETT AFTER PB1
    setCell(21, { formula: `IF(F${r}=0,0,T${r}/F${r})`, result: perNight2 }, { numFmt: idrFmt, align: ALIGN_RIGHT }) // U: /NIGHT
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
    { col: 9,  letter: 'I', result: totAccomm,   cellFill: 'FFFFFF00',       font: FONT_BOLD  }, // ACCOMM FARE yellow
    { col: 10, letter: 'J', result: 0,            cellFill: FILL_TOTAL,       font: FONT_WHITE }, // DISC
    { col: 11, letter: 'K', result: totFeeOTA,    cellFill: FILL_TOTAL,       font: FONT_WHITE }, // FEE OTA
    { col: 12, letter: 'L', result: totTax,       cellFill: FILL_TOTAL,       font: FONT_WHITE }, // TAX
    { col: 13, letter: 'M', result: totAllRed,    cellFill: FILL_TOTAL,       font: FONT_WHITE }, // ALL REDUCTION
    { col: 14, letter: 'N', result: totRevNett,   cellFill: 'FFFFFF00',       font: FONT_BOLD  }, // REV NETT yellow
    { col: 15, letter: 'O', result: totRevNett,   cellFill: 'FFFFFF00',       font: FONT_BOLD  }, // REVENUE yellow
    { col: 16, letter: 'P', result: 0, blank: true, cellFill: FILL_TOTAL,     font: FONT_WHITE }, // /NIGHT blank
    { col: 17, letter: 'Q', result: totTax2,      cellFill: FILL_TOTAL,       font: FONT_WHITE }, // TAX
    { col: 18, letter: 'R', result: totSC,        cellFill: FILL_TOTAL,       font: FONT_WHITE }, // SC
    { col: 19, letter: 'S', result: totPB1,       cellFill: 'FFFFFF00',       font: FONT_RED   }, // PB1 yellow+red
    { col: 20, letter: 'T', result: totNettPB1,   cellFill: FILL_OWNER_GREEN, font: FONT_BOLD  }, // NETT AFTER PB1
    { col: 21, letter: 'U', result: 0, blank: true, cellFill: FILL_TOTAL,     font: FONT_WHITE }, // /NIGHT blank
  ]

  const allTotalCols = new Set(totalDefs.map(d => d.col))
  for (let c = 2; c <= 21; c++) {
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

  // Sheet 1: REKAPITULASI overview (first tab)
  buildRekapSheet(wb, bookings, from, to)

  // Sheet 2: All bookings combined
  buildIncomeSheet(wb, 'INCOME REPORT', bookings, from, to)

  // Sheets 2+: One tab per listing
  const byListing = new Map<string, typeof bookings>()
  for (const b of bookings) {
    const key = fixEncoding(b.listing)
    if (!byListing.has(key)) byListing.set(key, [])
    byListing.get(key)!.push(b)
  }
  for (const [listingName, listingBookings] of Array.from(byListing.entries())) {
    const shortName = listingName.split(' / ')[0].trim()
    buildIncomeSheet(wb, safeName(shortName), listingBookings, from, to)
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
