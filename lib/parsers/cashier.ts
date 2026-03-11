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
  blockType: 'REG' | 'EV',
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
  let inSection = false

  sheet.eachRow((row, rowNum) => {
    const rowValues = row.values as ExcelJS.CellValue[]
    // row.values is 1-indexed; shift to 0-indexed
    const cells = Array.from({ length: 20 }, (_, i) => rowValues[i + 1] ?? null)
    const rowText = cells.map(cellStr).join(' ').toUpperCase()

    // Detect section title rows
    const isREG = rowText.includes('(REG)')
    const isEV = rowText.includes('(EV)')

    if (isREG || isEV) {
      // Start target section or stop when hitting other section
      if ((blockType === 'REG' && isREG) || (blockType === 'EV' && isEV)) {
        inSection = true
      } else if (inSection) {
        inSection = false
      }
      return
    }

    if (!inSection) return

    const paymentType = cellStr(cells[2]).toUpperCase()
    if (!VALID_PAYMENT_TYPES.has(paymentType)) {
      skipped++
      return
    }

    // Parse bank+terminal from col 1 (NAMA BANK: e.g. "BCA C2AP2381")
    const bankRaw = cellStr(cells[1])
    const spaceIdx = bankRaw.indexOf(' ')
    const bankName = spaceIdx > 0 ? bankRaw.slice(0, spaceIdx).toUpperCase() : bankRaw.toUpperCase()
    const terminalId = spaceIdx > 0 ? bankRaw.slice(spaceIdx + 1).trim() || null : null

    const terminalCode = cellStr(cells[0]) || null
    const amount = cellNum(cells[8])
    const entityNameRaw = cellStr(cells[9]) || null
    const notaBill = cellStr(cells[10]) || null

    if (!bankName && !terminalCode) {
      errors.push(`Baris ${rowNum}: NAMA BANK dan kode terminal kosong, dilewati.`)
      skipped++
      return
    }

    entries.push({ terminalCode, bankName, terminalId, paymentType, amount, notaBill, entityNameRaw })
  })

  return { entries, skipped, errors, sheetFound: true }
}
