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
  blockType: 'REG' | 'EV'   // auto-detected from title row containing "(REG)"/"(EV)" or "BLOK REG"/"BLOK EV"
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
  totalCol: number      // column index of "TOTAL"
  entityCol: number     // column index of entity/remaks name
  notaBillCol: number   // column index of "NOTA BILL"
}

function detectColMap(cells: (ExcelJS.CellValue | null)[]): ColMap | null {
  // Look for the header row that contains "NAMA BANK" — scan all cells for known labels
  let hasNamaBank = false
  let totalCol = -1
  let entityCol = -1
  let notaBillCol = -1

  for (let i = 0; i < cells.length; i++) {
    const s = cellStr(cells[i]).toUpperCase()
    if (s === 'NAMA BANK') hasNamaBank = true
    if (s === 'TOTAL') totalCol = i
    if (s === 'NOTA BILL') notaBillCol = i
    // Entity/Remarks column may be labeled REMAKS, REMAKES, ENTITAS, ENTITY
    if (['REMAKS', 'REMAKES', 'ENTITAS', 'ENTITY', 'KETERANGAN'].includes(s)) entityCol = i
  }

  if (!hasNamaBank || totalCol === -1) return null

  return {
    totalCol,
    entityCol,
    notaBillCol,
  }
}

// Known bank labels — first token of col B must be one of these to be treated as a bank entry
const KNOWN_BANKS = new Set([
  'BCA', 'BNI', 'BRI', 'MANDIRI', 'PERMATA', 'CIMB', 'DANAMON',
  'BTN', 'OCBC', 'MAYBANK', 'PANIN', 'MEGA', 'BUKOPIN', 'BSI',
])

// Check if the value in col B is the bank string ("BCA C2AP2381") vs a continuation
// row where the terminal code is repeated (e.g. "2995", "7-8774", "22 87").
// Returns null for continuation rows — caller keeps the last bankName/terminalId.
function parseBankCol(colB: string, colA: string): { bankName: string; terminalId: string | null } | null {
  if (!colB) return null

  // Continuation: col B is the same value as col A (terminal code repeated)
  if (colB.trim() === colA.trim()) return null

  const spaceIdx = colB.indexOf(' ')
  const firstToken = (spaceIdx > 0 ? colB.slice(0, spaceIdx) : colB).toUpperCase().trim()

  // First token must be a recognised bank label
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
  let colMap: ColMap | null = null
  let lastBankName = ''
  let lastTerminalId: string | null = null

  sheet.eachRow((row, rowNum) => {
    const rowValues = row.values as ExcelJS.CellValue[]
    // row.values is 1-indexed; shift to 0-indexed
    const cells = Array.from({ length: 25 }, (_, i) => rowValues[i + 1] ?? null)
    const rowText = cells.map(cellStr).join(' ').toUpperCase()

    // ── Block title detection ────────────────────────────────────────────────
    // Handles both v3 template "BLOK REG"/"BLOK EV" and actual file "(REG)"/"(EV)"
    const isRegTitle = rowText.includes('BLOK REG') || /\(\s*REG\s*\)/.test(rowText)
    const isEvTitle  = rowText.includes('BLOK EV')  || /\(\s*EV\s*\)/.test(rowText)

    if (isRegTitle && !isEvTitle) {
      currentBlock = 'REG'
      colMap = null                // reset; next header row will set it
      lastBankName = ''
      lastTerminalId = null
      return
    }
    if (isEvTitle) {
      currentBlock = 'EV'
      colMap = null
      lastBankName = ''
      lastTerminalId = null
      return
    }

    // Skip rows before any block header
    if (!currentBlock) return

    // ── Column header row detection ──────────────────────────────────────────
    if (!colMap) {
      const detected = detectColMap(cells)
      if (detected) {
        colMap = detected
      }
      // Header row itself is not a data row — skip regardless
      skipped++
      return
    }

    // ── Data row filter ──────────────────────────────────────────────────────
    const paymentType = cellStr(cells[2]).toUpperCase()
    if (!VALID_PAYMENT_TYPES.has(paymentType)) {
      skipped++
      return
    }

    // ── Bank name resolution ─────────────────────────────────────────────────
    // Col A (0): KODE EDC   Col B (1): NAMA BANK / TERMINAL (may be repeated code on continuation rows)
    const colAStr = cellStr(cells[0])
    const colBStr = cellStr(cells[1])

    const parsed = parseBankCol(colBStr, colAStr)
    if (parsed) {
      lastBankName   = parsed.bankName
      lastTerminalId = parsed.terminalId
    }
    // else: continuation row — keep lastBankName / lastTerminalId

    const terminalCode = colAStr || null

    if (!lastBankName && !terminalCode) {
      errors.push(`Baris ${rowNum}: NAMA BANK dan kode terminal kosong, dilewati.`)
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
