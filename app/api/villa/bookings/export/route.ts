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

// ACCOMM FARE = accommodation-only component
// Airbnb: csvFare includes 15% guest service fee → divide by 1.15 to get base rate
// Booking.com: csvFare = accommodation fare; totalPayout = csvFare × 1.10 (10% VAT remittance on top)
// Others: use csvFare as-is
function otaAccomm(source: string, csvFare: number, _totalPayout: number): number {
  const src = source.toLowerCase()
  if (src.startsWith('airbnb')) return csvFare / 1.15
  return csvFare
}

// REVENUE GROSS = total amount received from the OTA (may include taxes)
// For Booking.com, totalPayout = csvFare × 1.10 (Booking.com remits accommodation + VAT together)
// For Airbnb, gross = same as accomm (Airbnb pays net accommodation only)
function otaGross(source: string, csvFare: number, totalPayout: number): number {
  const src = source.toLowerCase()
  if (src.startsWith('airbnb')) return csvFare / 1.15
  if (src === 'booking.com') return totalPayout
  return csvFare
}

// TODO: Booking.com REVENUE NETT should = accommodationFare - hostChannelFee (OTA commission).
// The "Host channel fee" field is not in the current Guesty CSV export (only 11 columns).
// Using accommodationFare (csvFare) as a stand-in until commission data is available.
function otaNett(source: string, accommodationFare: number, totalPayout: number): number {
  if (source.toLowerCase().trim() === 'booking.com') return accommodationFare
  return totalPayout
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

// ─── REKAPITULASI sheet (per-villa OCC + Revenue NETT overview) ──────────────

function buildRekapSheet(
  wb: ExcelJS.Workbook,
  bookings: { source: string; totalPayout: { toString(): string }; accommodationFare: { toString(): string }; numberOfNights: number | null; listing: string }[],
  from: string | null,
  to: string | null,
) {
  // Aggregate per listing
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
  ws.getCell('B1').font      = fnt({ bold: true, size: 13, color: { argb: DARK } })
  ws.getCell('B1').alignment = ALIGN_L
  ws.getRow(1).height = 22

  ws.mergeCells('B2:F2')
  ws.getCell('B2').value = `Total ${grouped.size} Villa · Periode: ${fmtPeriod(from, to)} · ${totalDays} hari`
  ws.getCell('B2').font  = fnt({ color: { argb: 'FF555555' } })
  ws.getRow(2).height = 14
  ws.getRow(3).height = 6

  for (const { col, label, argb } of [
    { col: 'B', label: 'VILLA',        argb: DARK         },
    { col: 'C', label: '% OCC',        argb: 'FF2E4F6F'  },
    { col: 'D', label: 'REVENUE NETT', argb: GREEN        },
    { col: 'E', label: 'NIGHT',        argb: 'FF2E4F6F'  },
    { col: 'F', label: 'AVERAGE',      argb: 'FF2E4F6F'  },
  ]) {
    const cell = ws.getCell(`${col}4`)
    cell.value = label; cell.font = FONT_WHITE
    cell.fill  = fill(argb); cell.alignment = ALIGN_C; cell.border = whiteBorder
  }
  ws.getRow(4).height = 16

  const R_START = 5
  const list = Array.from(grouped.entries()).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true, sensitivity: 'base' }))

  list.forEach(([listing, agg], idx) => {
    const r   = R_START + idx
    const row = ws.getRow(r)
    row.height  = 15
    const isEven  = idx % 2 === 1
    const rowFill = isEven ? fill(ALT) : undefined
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

    row.getCell(1).fill = rowFill ?? ({ type: 'pattern', pattern: 'none' } as ExcelJS.Fill)
    row.getCell(1).border = hairBorder
    setR(2, listing.split(' / ')[0].trim())
    setR(3, occ,       { numFmt: '0.0%', align: ALIGN_C })
    setR(4, agg.nett,  { numFmt: idrFmt, align: ALIGN_R, font: FONT_BOLD })
    setR(5, agg.nights,                  { align: ALIGN_C })
    setR(6, avg,       { numFmt: idrFmt, align: ALIGN_R })
  })

  const totRow     = R_START + list.length
  const totNights  = list.reduce((s, [, a]) => s + a.nights, 0)
  const totNett    = list.reduce((s, [, a]) => s + a.nett, 0)
  const totAvg     = totNights > 0 ? totNett / totNights : 0
  const thinBorder = { top: { style: 'thin' as const, color: { argb: 'FFAAAAAA' } }, bottom: { style: 'thin' as const, color: { argb: 'FFAAAAAA' } } }

  const tr = ws.getRow(totRow)
  tr.height = 18
  ws.mergeCells(`B${totRow}:C${totRow}`)
  tr.getCell(2).value = `TOTAL (${list.length} Villa)`; tr.getCell(2).font = FONT_WHITE
  tr.getCell(2).fill  = fill(DARK); tr.getCell(2).alignment = ALIGN_L; tr.getCell(2).border = thinBorder
  tr.getCell(4).value = { formula: `SUM(D${R_START}:D${totRow - 1})`, result: totNett }
  tr.getCell(4).numFmt = idrFmt; tr.getCell(4).font = FONT_WHITE; tr.getCell(4).fill = fill(GREEN)
  tr.getCell(4).alignment = ALIGN_R; tr.getCell(4).border = thinBorder
  tr.getCell(5).value = { formula: `SUM(E${R_START}:E${totRow - 1})`, result: totNights }
  tr.getCell(5).font = FONT_WHITE; tr.getCell(5).fill = fill(DARK)
  tr.getCell(5).alignment = ALIGN_C; tr.getCell(5).border = thinBorder
  tr.getCell(6).value = { formula: `IF(E${totRow}=0,0,D${totRow}/E${totRow})`, result: totAvg }
  tr.getCell(6).numFmt = idrFmt; tr.getCell(6).font = FONT_WHITE; tr.getCell(6).fill = fill(DARK)
  tr.getCell(6).alignment = ALIGN_R; tr.getCell(6).border = thinBorder
  for (const c of [1, 3]) { tr.getCell(c).fill = fill(DARK); tr.getCell(c).border = thinBorder }

  ws.autoFilter = 'B4:F4'
  ws.views = [{ state: 'frozen', ySplit: 4 }]
}

// ─── INCOME sheet (21-column Anjuna B2 format + ACCOMM FARE) ─────────────────
// A spacer | B DATE BOOKING | C NAME | D ROOM | E DATE STAY | F NIGHT | G OTA
// H REVENUE GROSS | I ACCOMM FARE | J DISC | K FEE OTA | L TAX | M ALL REDUCTION
// N REVENUE NETT | O REVENUE | P /NIGHT | Q TAX | R SC | S PB1 | T NETT AFTER PB1 | U /NIGHT

function buildIncomeSheet(
  wb: ExcelJS.Workbook,
  listingName: string,
  bookings: { checkIn: Date; checkOut: Date; guestName: string | null; listing: string; numberOfNights: number | null; source: string; accommodationFare: { toString(): string }; totalPayout: { toString(): string } }[],
  from: string | null,
  to: string | null,
): { name: string; totalRow: number; totGross: number; totNett: number; totPB1: number } {
  const wsName = safeName(`INCOME ${listingName}`)
  const ws = wb.addWorksheet(wsName)

  // A   B    C    D    E    F   G    H    I    J    K    L    M    N    O    P    Q    R    S    T    U
  const widths = [3, 12, 20, 10, 20, 7, 10, 14, 14, 10, 12, 12, 14, 14, 14, 10, 12, 10, 12, 16, 10]
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w })

  // Row 1: Title
  ws.mergeCells('A1:U1')
  ws.getCell('A1').value = `BSpace Finance — ${listingName}`
  ws.getCell('A1').font  = fnt({ bold: true, size: 13, color: { argb: DARK } })
  ws.getCell('A1').alignment = ALIGN_L
  ws.getRow(1).height = 22

  // Row 2: Period
  ws.mergeCells('A2:U2')
  ws.getCell('A2').value = `Periode: ${fmtPeriod(from, to)}   |   ${bookings.length} booking`
  ws.getCell('A2').font  = fnt({ color: { argb: 'FF555555' } })
  ws.getRow(2).height = 13

  // Row 3: Service rate ($K$3 referenced in FEE OTA formula)
  ws.getCell('J3').value  = 'SERVICE RATE'
  ws.getCell('J3').font   = FONT_BOLD
  ws.getCell('K3').value  = SVC_RATE
  ws.getCell('K3').numFmt = pctFmt
  ws.getCell('K3').font   = fnt({ color: { argb: 'FF0070C0' }, bold: true })
  ws.getRow(3).height = 13

  // Row 4: blank
  ws.getRow(4).height = 6

  // Rows 5–6: Two-row header; E and K have sub-labels in row 6
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
    cell.fill      = fill(isGray ? GRAY : DARK)
    cell.font      = isGray ? FONT_BOLD
      : col === 'S' ? fnt({ bold: true, color: { argb: 'FFFF0000' } })
      : FONT_WHITE
    cell.alignment = { ...ALIGN_C, wrapText: true }
    cell.border    = whiteBorder
  }

  // Row 6 sub-labels (E and K only)
  for (const { col, label } of [
    { col: 'E', label: 'Booking'                           },
    { col: 'K', label: `${(SVC_RATE * 100).toFixed(0)}%`  },
  ]) {
    const cell = ws.getCell(`${col}6`)
    cell.value     = label
    cell.fill      = fill(DARK)
    cell.font      = FONT_WHITE
    cell.alignment = ALIGN_C
    cell.border    = whiteBorder
  }

  // Data rows
  const DATA_START = 7
  let totGross = 0, totAccomm = 0, totFeeOTA = 0, totTax = 0, totAllRed = 0
  let totNett = 0, totTaxBase = 0, totSC = 0, totPB1 = 0, totNettPB1 = 0

  bookings.forEach((b, idx) => {
    const r   = DATA_START + idx
    const row = ws.getRow(r)
    row.height = 15

    const csvFare   = parseFloat(b.accommodationFare.toString())
    const csvPayout = parseFloat(b.totalPayout.toString())
    const revNett   = otaNett(b.source, csvFare, csvPayout)               // N: REVENUE NETT
    const accomm    = otaAccomm(b.source, csvFare, csvPayout)             // I: ACCOMM FARE
    const gross     = otaGross(b.source, csvFare, csvPayout)              // H: REVENUE GROSS (Booking.com = totalPayout)
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

    totGross    += gross
    totAccomm   += accomm
    totFeeOTA   += feeOTA
    totTax      += taxSel
    totAllRed   += allRed
    totNett     += revNett
    totTaxBase  += taxBase
    totSC       += sc
    totPB1      += pb1
    totNettPB1  += nettPB1

    const isEven  = idx % 2 === 1
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

    const roomCode = fixEncoding(b.listing).split(' / ')[0].trim()

    setCell(2,  fmtDate(b.checkIn), { align: ALIGN_C })                                                           // B: DATE BOOKING
    setCell(3,  b.guestName || '—')                                                                                // C: NAME
    setCell(4,  roomCode)                                                                                           // D: ROOM
    setCell(5,  fmtStay(b.checkIn, b.checkOut), { align: ALIGN_C })                                               // E: DATE STAY
    setCell(6,  nights, { align: ALIGN_C })                                                                        // F: NIGHT
    setCell(7,  b.source.toUpperCase(), { align: ALIGN_C })                                                        // G: OTA
    setCell(8,  gross,   { numFmt: idrFmt, align: ALIGN_R })                                                       // H: REVENUE GROSS
    setCell(9,  accomm,  { numFmt: idrFmt, align: ALIGN_R, font: fnt({ color: { argb: 'FF555555' } }) })          // I: ACCOMM FARE
    setCell(10, 0,       { numFmt: idrFmt, align: ALIGN_R, font: FONT_BLUE, cellFill: fill('FFFFFACD') })          // J: DISC (manual)
    setCell(11, { formula: `H${r}*$K$3`, result: feeOTA },               { numFmt: idrFmt, align: ALIGN_R })     // K: FEE OTA
    setCell(12, { formula: `MAX(0,H${r}-K${r}-N${r})`, result: taxSel }, { numFmt: idrFmt, align: ALIGN_R })     // L: TAX
    setCell(13, { formula: `J${r}+K${r}+L${r}`, result: allRed },        { numFmt: idrFmt, align: ALIGN_R })     // M: ALL REDUCTION
    setCell(14, revNett,  { numFmt: idrFmt, align: ALIGN_R, font: FONT_BOLD })                                    // N: REVENUE NETT
    setCell(15, { formula: `N${r}`, result: revNett },                    { numFmt: idrFmt, align: ALIGN_R })     // O: REVENUE
    setCell(16, { formula: `IF(F${r}=0,0,O${r}/F${r})`, result: perNight1 }, { numFmt: idrFmt, align: ALIGN_R }) // P: /NIGHT
    setCell(17, { formula: `N${r}/1.21`, result: taxBase },               { numFmt: idrFmt, align: ALIGN_R })     // Q: TAX
    setCell(18, { formula: `Q${r}*10%`, result: sc },                     { numFmt: idrFmt, align: ALIGN_R })     // R: SC
    setCell(19, { formula: `(Q${r}+R${r})*10%`, result: pb1 },           { numFmt: idrFmt, align: ALIGN_R, font: FONT_RED }) // S: PB1
    setCell(20, { formula: `N${r}-S${r}`, result: nettPB1 },             { numFmt: idrFmt, align: ALIGN_R, font: FONT_BOLD }) // T: NETT AFTER PB1
    setCell(21, { formula: `IF(F${r}=0,0,T${r}/F${r})`, result: perNight2 }, { numFmt: idrFmt, align: ALIGN_R }) // U: /NIGHT
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

  const totDefs: { col: number; letter: string; result: number; fillArgb: string; font: Partial<ExcelJS.Font>; blank?: boolean }[] = [
    { col: 8,  letter: 'H', result: totGross,    fillArgb: 'FFFFFF00', font: FONT_BOLD  },
    { col: 9,  letter: 'I', result: totAccomm,   fillArgb: 'FFFFFF00', font: FONT_BOLD  },
    { col: 10, letter: 'J', result: 0,            fillArgb: DARK,       font: FONT_WHITE },
    { col: 11, letter: 'K', result: totFeeOTA,    fillArgb: DARK,       font: FONT_WHITE },
    { col: 12, letter: 'L', result: totTax,       fillArgb: DARK,       font: FONT_WHITE },
    { col: 13, letter: 'M', result: totAllRed,    fillArgb: DARK,       font: FONT_WHITE },
    { col: 14, letter: 'N', result: totNett,      fillArgb: 'FFFFFF00', font: FONT_BOLD  },
    { col: 15, letter: 'O', result: totNett,      fillArgb: 'FFFFFF00', font: FONT_BOLD  },
    { col: 16, letter: 'P', result: 0, blank: true, fillArgb: DARK,     font: FONT_WHITE },
    { col: 17, letter: 'Q', result: totTaxBase,   fillArgb: DARK,       font: FONT_WHITE },
    { col: 18, letter: 'R', result: totSC,        fillArgb: DARK,       font: FONT_WHITE },
    { col: 19, letter: 'S', result: totPB1,       fillArgb: 'FFFFFF00', font: FONT_RED   },
    { col: 20, letter: 'T', result: totNettPB1,   fillArgb: GREEN,      font: FONT_BOLD  },
    { col: 21, letter: 'U', result: 0, blank: true, fillArgb: DARK,     font: FONT_WHITE },
  ]

  const totColSet = new Set(totDefs.map(d => d.col))
  for (let c = 2; c <= 21; c++) {
    if (!totColSet.has(c)) { tr.getCell(c).fill = fill(DARK); tr.getCell(c).border = whiteBorder }
  }
  for (const { col, letter, result, fillArgb, font, blank } of totDefs) {
    const cell = tr.getCell(col)
    cell.value     = blank ? null : { formula: `SUM(${letter}${DATA_START}:${letter}${totalRow - 1})`, result }
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

  ws.getCell(`E${r}`).value     = { formula: `${iRef}!N${tRow}`, result: nett }
  ws.getCell(`E${r}`).numFmt    = idrFmt
  ws.getCell(`E${r}`).font      = FONT_BASE

  // F: Expense (linked to EXP sheet total — yellow so staff can override)
  ws.getCell(`F${r}`).value     = { formula: `${eRef}!${expCell}`, result: 0 }
  ws.getCell(`F${r}`).numFmt    = idrFmt
  ws.getCell(`F${r}`).fill      = fill('FFFFFACD')
  ws.getCell(`F${r}`).font      = FONT_BLUE

  ws.getCell(`G${r}`).value     = { formula: `${iRef}!S${tRow}`, result: pb1 }
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

  // Sheet 1: REKAPITULASI overview (first tab)
  buildRekapSheet(wb, bookings, from, to)

  for (const [listingName, rows] of Array.from(byListing.entries())) {
    const shortName = listingName.split(' / ')[0].trim()
    const income = buildIncomeSheet(wb, shortName, rows, from, to)
    const exp    = buildExpSheet(wb, shortName)
    buildGlobalSheet(wb, shortName, income, exp, from, to)
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
