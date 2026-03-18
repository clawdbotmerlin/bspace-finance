import ExcelJS from 'exceljs'

const VALID_PAYMENT_TYPES = new Set(['QR', 'DEBIT', 'KK', 'CASH', 'VOUCHER'])

export interface ParsedCashierEntry {
  terminalCode: string | null
  bankName: string
  terminalId: string | null
  paymentType: string
  amount: number
  notaBill: string | null
  entityNameRaw: string | null
  blockType: 'REG' | 'EV'   // auto-detected from "BLOK REG"/"BLOK EV" title row (v3 template)
  sourceRow: number          // 1-based row number in the Excel sheet
}

export interface CashierParseResult {
  entries: ParsedCashierEntry[]
  skipped: number
  errors: string[]
  sheetFound: boolean
}

function cellStr(value: ExcelJS.CellValue): string {
  if (value == null) return ''
  if (typeof value === 'object' && 'text' in (value as object)) {
    return String((value as { text: string }).text).trim()
  }
  return String(value).trim()
}

function cellNum(value: ExcelJS.CellValue): number {
  if (value == null) return 0
  const n = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^0-9.-]/g, ''))
  return isNaN(n) ? 0 : n
}

export async function parseCashierFile(
  buffer: ArrayBuffer,
  sessionDate: Date,
): Promise<CashierParseResult> {
  const workbook = new ExcelJS.Workbook()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await workbook.xlsx.load(buffer as any)

  const dayKey = String(sessionDate.getUTCDate()).padStart(2, '0')
  const sheet = workbook.getWorksheet(dayKey)
  if (!sheet) {
    return { entries: [], skipped: 0, errors: [`Sheet "${dayKey}" tidak ditemukan dalam file.`], sheetFound: false }
  }

  const entries: ParsedCashierEntry[] = []
  const errors: string[] = []
  let skipped = 0
  // Track whichever section we're currently inside (null = before first header)
  let currentBlock: 'REG' | 'EV' | null = null

  sheet.eachRow((row, rowNum) => {
    const rowValues = row.values as ExcelJS.CellValue[]
    // row.values is 1-indexed; shift to 0-indexed
    const cells = Array.from({ length: 20 }, (_, i) => rowValues[i + 1] ?? null)
    const rowText = cells.map(cellStr).join(' ').toUpperCase()

    // Detect section title rows (v3 format: "BLOK REG" / "BLOK EV" in col A title row)
    // switch active block and skip the title/header rows themselves
    if (rowText.includes('BLOK REG')) { currentBlock = 'REG'; return }
    if (rowText.includes('BLOK EV'))  { currentBlock = 'EV';  return }

    // Skip rows that precede any section header
    if (!currentBlock) return

    // Col C (index 2) = JENIS — payment type filter also skips header/summary rows naturally
    const paymentType = cellStr(cells[2]).toUpperCase()
    if (!VALID_PAYMENT_TYPES.has(paymentType)) {
      skipped++
      return
    }

    // Col A (0): KODE EDC   Col B (1): NAMA BANK / TERMINAL  Col C (2): JENIS
    // Col D (3): ENTITAS    Col K (10): TOTAL (=SUM of POS cols) Col L (11): NOTA BILL
    const bankRaw = cellStr(cells[1])
    const spaceIdx = bankRaw.indexOf(' ')
    const bankName = spaceIdx > 0 ? bankRaw.slice(0, spaceIdx).toUpperCase() : bankRaw.toUpperCase()
    const terminalId = spaceIdx > 0 ? bankRaw.slice(spaceIdx + 1).trim() || null : null

    const terminalCode  = cellStr(cells[0])  || null
    const amount        = cellNum(cells[10])           // col K — TOTAL (sum of all POS columns)
    const entityNameRaw = cellStr(cells[3])  || null   // col D — ENTITAS
    const notaBill      = cellStr(cells[11]) || null   // col L — NOTA BILL

    if (!bankName && !terminalCode) {
      errors.push(`Baris ${rowNum}: NAMA BANK dan kode terminal kosong, dilewati.`)
      skipped++
      return
    }

    entries.push({ terminalCode, bankName, terminalId, paymentType, amount, notaBill, entityNameRaw, blockType: currentBlock, sourceRow: rowNum })
  })

  return { entries, skipped, errors, sheetFound: true }
}
