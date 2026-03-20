import * as XLSX from 'xlsx'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ColumnMappingCombined {
  type: 'combined_amount_direction'
  dateCol: number
  dateFormat?: string
  descriptionCol?: number
  amountAndDirectionCol: number
  creditIndicator: string
  debitIndicator: string
  refCol?: number
}

export interface ColumnMappingSeparated {
  type: 'separated_direction'
  dateCol: number
  dateFormat?: string
  descriptionCol?: number
  amountCol: number
  directionCol: number
  creditIndicator: string
  refCol?: number
}

export interface ColumnMappingDual {
  type: 'dual_column'
  dateCol: number
  dateFormat?: string
  descriptionCol?: number
  debitCol: number
  creditCol: number
  refCol?: number
}

export type ColumnMapping = ColumnMappingCombined | ColumnMappingSeparated | ColumnMappingDual

export interface BankConfigForParser {
  bankName: string
  fileFormat: string
  skipRowsTop: number
  skipRowsBottom: number
  columnMapping: ColumnMapping
}

export interface ParsedBankMutation {
  bankName: string
  accountNumber: string | null
  transactionDate: string // YYYY-MM-DD
  description: string | null
  grossAmount: number
  direction: 'CR' | 'DR'
  referenceNo: string | null
  rawData: Record<string, unknown>
}

export interface BankMutationParseResult {
  mutations: ParsedBankMutation[]
  skipped: number
  errors: string[]
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function excelSerialToISO(serial: number): string {
  // Excel epoch: 1899-12-30; subtract 25569 days to get Unix epoch days
  const date = new Date((serial - 25569) * 86400 * 1000)
  return date.toISOString().split('T')[0]
}

function parseDate(raw: unknown, format: string | undefined): string | null {
  if (raw == null) return null
  const s = String(raw).trim()
  if (!s || s === '0') return null

  // Excel serial number
  if (format === 'EXCEL_SERIAL' || (typeof raw === 'number' && raw > 40000)) {
    return excelSerialToISO(typeof raw === 'number' ? raw : parseFloat(s))
  }

  if (format === 'DD/MM/YYYY') {
    const parts = s.split('/')
    if (parts.length === 3) return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
  }

  if (format === 'DD/MM/YY') {
    const parts = s.split('/')
    if (parts.length === 3) return `20${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
  }

  // YYYY-MM-DD HH:mm:ss
  if (s.length >= 10 && s[4] === '-') return s.slice(0, 10)

  return null
}

function toNum(raw: unknown): number {
  if (raw == null) return 0
  if (typeof raw === 'number') return raw
  const s = String(raw).replace(/[^0-9.,-]/g, '').trim()
  if (!s) return 0
  // Indonesian format: dots as thousands, comma as decimal
  if (s.includes(',') && s.includes('.') && s.lastIndexOf('.') < s.lastIndexOf(',')) {
    return parseFloat(s.replace(/\./g, '').replace(',', '.'))
  }
  return parseFloat(s.replace(/,/g, '')) || 0
}

function str(raw: unknown): string | null {
  if (raw == null) return null
  const s = String(raw).trim()
  return s || null
}

// ─── Account number extraction from header rows ───────────────────────────────

function extractAccountNumber(headerRows: unknown[][]): string | null {
  for (const row of headerRows) {
    for (const cell of row) {
      const s = str(cell)
      if (!s) continue
      // BCA: "No. rekening : 7700920555"
      const rekMatch = s.match(/rekening\s*:\s*([0-9]+)/i)
      if (rekMatch) return rekMatch[1]
      // BNI/MANDIRI: "Account: 1234..." pattern
      const accMatch = s.match(/^Account\s*[:/]\s*([0-9]+)/i)
      if (accMatch) return accMatch[1]
    }
  }
  return null
}

// ─── Main parser ──────────────────────────────────────────────────────────────

export function parseBankMutationFile(
  buffer: ArrayBuffer,
  config: BankConfigForParser,
  sessionDate: Date | null,
): BankMutationParseResult {
  const wb = XLSX.read(new Uint8Array(buffer), { type: 'array', cellDates: false, raw: true })
  const sheetName = wb.SheetNames[0]
  const sheet = wb.Sheets[sheetName]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allRows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: null, raw: true })

  const { skipRowsTop, skipRowsBottom, columnMapping: cm } = config
  // When sessionDate is null, keep ALL rows regardless of date (handles T+1 / T+2 settlements)
  const sessionDateISO = sessionDate ? sessionDate.toISOString().split('T')[0] : null

  const headerRows = allRows.slice(0, skipRowsTop) as unknown[][]
  const accountNumber = extractAccountNumber(headerRows)

  const dataRows: unknown[][] = skipRowsBottom > 0
    ? (allRows.slice(skipRowsTop, -skipRowsBottom) as unknown[][])
    : (allRows.slice(skipRowsTop) as unknown[][])

  const mutations: ParsedBankMutation[] = []
  let skipped = 0
  const errors: string[] = []

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i]

    // Parse date
    const rawDate = row[cm.dateCol]
    const dateISO = parseDate(rawDate, cm.dateFormat)

    if (!dateISO) {
      skipped++
      continue
    }

    // Filter to session date only when sessionDate is provided
    if (sessionDateISO && dateISO !== sessionDateISO) {
      skipped++
      continue
    }

    let grossAmount = 0
    let direction: 'CR' | 'DR' | null = null

    if (cm.type === 'combined_amount_direction') {
      const cell = str(row[cm.amountAndDirectionCol]) ?? ''
      const match = cell.match(/([\d,]+\.?\d*)\s+([A-Z]{2})/i)
      if (match) {
        grossAmount = toNum(match[1])
        const indicator = match[2].toUpperCase()
        direction = indicator === cm.creditIndicator.toUpperCase() ? 'CR' : 'DR'
      }
    } else if (cm.type === 'separated_direction') {
      grossAmount = toNum(row[cm.amountCol])
      const dirRaw = str(row[cm.directionCol])
      if (dirRaw) {
        direction = dirRaw.trim().toUpperCase() === cm.creditIndicator.toUpperCase() ? 'CR' : 'DR'
      }
    } else if (cm.type === 'dual_column') {
      const debit = toNum(row[cm.debitCol])
      const credit = toNum(row[cm.creditCol])
      if (credit > 0) {
        grossAmount = credit
        direction = 'CR'
      } else if (debit > 0) {
        grossAmount = debit
        direction = 'DR'
      }
    }

    if (grossAmount === 0 || !direction) {
      skipped++
      continue
    }

    const description = cm.descriptionCol != null ? str(row[cm.descriptionCol]) : null
    const referenceNo = cm.refCol != null ? str(row[cm.refCol]) : null

    mutations.push({
      bankName: config.bankName,
      accountNumber,
      transactionDate: dateISO,
      description,
      grossAmount,
      direction,
      referenceNo,
      rawData: Object.fromEntries(row.map((v, idx) => [`col${idx}`, v])),
    })
  }

  return { mutations, skipped, errors }
}
