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
  blockType: 'REG' | 'EV'   // auto-detected from section header
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

// Column map resolved from the header row of each block section
interface ColMap {
  totalCol: number
  entityCol: number
  notaBillCol: number
}

function detectColMap(cells: (ExcelJS.CellValue | null)[]): ColMap | null {
  let hasNamaBank = false
  let totalCol = -1
  let entityCol = -1
  let notaBillCol = -1

  for (let i = 0; i < cells.length; i++) {
    const s = cellStr(cells[i]).toUpperCase()
    // "NAMA BANK" or "NAMA BANK / TERMINAL" — startsWith covers both
    if (s.startsWith('NAMA BANK')) hasNamaBank = true
    if (s === 'TOTAL') totalCol = i
    if (s === 'NOTA BILL') notaBillCol = i
    if (['REMAKS', 'REMAKES', 'ENTITAS', 'ENTITY', 'KETERANGAN'].includes(s)) entityCol = i
  }

  if (!hasNamaBank || totalCol === -1) return null
  return { totalCol, entityCol, notaBillCol }
}

// Known bank labels — first token of col B must be one of these
const KNOWN_BANKS = new Set([
  'BCA', 'BNI', 'BRI', 'MANDIRI', 'PERMATA', 'CIMB', 'DANAMON',
  'BTN', 'OCBC', 'MAYBANK', 'PANIN', 'MEGA', 'BUKOPIN', 'BSI',
])

// Indonesian month names for date-header detection (v3 template format)
const IDN_DATE_RE = /\d{1,2}\s+(JANUARI|FEBRUARI|MARET|APRIL|MEI|JUNI|JULI|AGUSTUS|SEPTEMBER|OKTOBER|NOVEMBER|DESEMBER)\s+20\d{2}/i

// Detect if col B contains a valid "BANK TERMINALID" string.
// Returns null for continuation rows or non-bank rows (CASH, VOUCHER KLOOK, etc.).
function parseBankCol(colB: string, colA: string): { bankName: string; terminalId: string | null } | null {
  if (!colB) return null

  const spaceIdx = colB.indexOf(' ')
  const firstToken = (spaceIdx > 0 ? colB.slice(0, spaceIdx) : colB).toUpperCase().trim()

  if (!KNOWN_BANKS.has(firstToken)) return null

  const terminalId = spaceIdx > 0 ? colB.slice(spaceIdx + 1).trim() || null : null
  return { bankName: firstToken, terminalId }
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

  // State machine
  let currentBlock: 'REG' | 'EV' | null = null
  let dateHeaderCount = 0   // counts date-only headers (v3 template: 1st=REG, 2nd=EV)
  let colMap: ColMap | null = null
  let lastBankName = ''
  let lastTerminalId: string | null = null
  let lastTerminalCode = ''  // track col A of last valid EDC row

  sheet.eachRow((row, rowNum) => {
    const rowValues = row.values as ExcelJS.CellValue[]
    // row.values is 1-indexed; shift to 0-indexed
    const cells = Array.from({ length: 25 }, (_, i) => rowValues[i + 1] ?? null)
    const rowText = cells.map(cellStr).join(' ').toUpperCase()

    // ── Block title detection ────────────────────────────────────────────────
    // Priority 1: explicit REG/EV markers (old format & original v3 spec)
    const isRegTitle = rowText.includes('BLOK REG') || /\(\s*REG\s*\)/.test(rowText)
    const isEvTitle  = rowText.includes('BLOK EV')  || /\(\s*EV\s*\)/.test(rowText)

    if (isRegTitle && !isEvTitle) {
      currentBlock = 'REG'; colMap = null; lastBankName = ''; lastTerminalId = null; lastTerminalCode = ''; return
    }
    if (isEvTitle) {
      currentBlock = 'EV'; colMap = null; lastBankName = ''; lastTerminalId = null; lastTerminalCode = ''; return
    }

    // Priority 2: date-only header (v3 template — "01 MARET 2026")
    // First occurrence = REG, second occurrence = EV
    if (IDN_DATE_RE.test(rowText) && !isRegTitle && !isEvTitle) {
      dateHeaderCount++
      currentBlock = dateHeaderCount === 1 ? 'REG' : 'EV'
      colMap = null; lastBankName = ''; lastTerminalId = null; lastTerminalCode = ''
      return
    }

    // Skip rows before any block header
    if (!currentBlock) return

    // ── Column header row detection ──────────────────────────────────────────
    if (!colMap) {
      const detected = detectColMap(cells)
      if (detected) colMap = detected
      // Header / kasir-names rows are never data rows
      skipped++
      return
    }

    // ── Payment type filter ──────────────────────────────────────────────────
    const paymentType = cellStr(cells[2]).toUpperCase()
    if (!VALID_PAYMENT_TYPES.has(paymentType)) {
      skipped++
      return
    }

    // ── Bank name resolution ─────────────────────────────────────────────────
    const colAStr = cellStr(cells[0])
    const colBStr = cellStr(cells[1])

    const parsed = parseBankCol(colBStr, colAStr)
    if (parsed) {
      // New bank terminal explicitly named in col B
      lastBankName     = parsed.bankName
      lastTerminalId   = parsed.terminalId
      lastTerminalCode = colAStr
    } else if (colAStr === lastTerminalCode && lastBankName) {
      // Same terminal code in col A → continuation row (old file format)
      // Keep lastBankName / lastTerminalId unchanged
    } else {
      // Non-EDC row (CASH, VOUCHER KLOOK, summary lines, etc.) — skip
      skipped++
      return
    }

    const terminalCode = colAStr || null

    if (!lastBankName) {
      errors.push(`Baris ${rowNum}: NAMA BANK kosong, dilewati.`)
      skipped++
      return
    }

    // ── Amount & meta fields ─────────────────────────────────────────────────
    const amount        = cellNum(cells[colMap.totalCol])
    const entityNameRaw = colMap.entityCol >= 0 ? (cellStr(cells[colMap.entityCol]) || null) : null
    const notaBill      = colMap.notaBillCol >= 0 ? (cellStr(cells[colMap.notaBillCol]) || null) : null

    entries.push({
      terminalCode,
      bankName: lastBankName,
      terminalId: lastTerminalId,
      paymentType,
      amount,
      notaBill,
      entityNameRaw,
      blockType: currentBlock!,
      sourceRow: rowNum,
    })
  })

  return { entries, skipped, errors, sheetFound: true }
}
