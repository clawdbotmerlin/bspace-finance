import * as XLSX from 'xlsx'

export interface ParsedVillaBooking {
  status: string
  checkIn: string       // YYYY-MM-DD
  checkOut: string      // YYYY-MM-DD
  source: string
  accommodationFare: number
  totalPayout: number
  listing: string
  listingId: string
  guestName: string
  numberOfNights: number
  numberOfGuests: number
}

export interface VillaBookingParseResult {
  bookings: ParsedVillaBooking[]
  skipped: number
  errors: string[]
}

// CSV column indices (0-based):
// 0  STATUS
// 1  CHECK-IN
// 2  CHECK-OUT
// 3  SOURCE
// 4  ACCOMMODATION FARE
// 5  TOTAL PAYOUT
// 6  LISTING
// 7  NUMBER OF NIGHTS
// 8  LISTING ID
// 9  GUEST'S NAME
// 10 NUMBER OF GUESTS

function parseDate(raw: string): string {
  if (!raw) throw new Error('Missing date')
  const s = String(raw).trim()

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)

  // MM/DD/YYYY HH:MM or MM/DD/YYYY
  const slashMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (slashMatch) {
    const [, m, d, y] = slashMatch
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  // Try native parse as fallback
  const dt = new Date(s)
  if (!isNaN(dt.getTime())) {
    return dt.toISOString().slice(0, 10)
  }

  throw new Error(`Cannot parse date: "${s}"`)
}

function parseAmount(raw: string): number {
  if (raw == null || raw === '') return 0
  const cleaned = String(raw).replace(/[^0-9.-]/g, '')
  const val = parseFloat(cleaned)
  return isNaN(val) ? 0 : val
}

export function parseVillaBookingCsv(buffer: ArrayBuffer): VillaBookingParseResult {
  const wb = XLSX.read(buffer, { type: 'array', raw: false })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' })

  const bookings: ParsedVillaBooking[] = []
  let skipped = 0
  const errors: string[] = []

  // Row 0 is the header row — skip it
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.length < 9) { skipped++; continue }

    const status = String(row[0] ?? '').trim()
    if (!status) { skipped++; continue }

    try {
      bookings.push({
        status,
        checkIn: parseDate(String(row[1])),
        checkOut: parseDate(String(row[2])),
        source: String(row[3] ?? '').trim(),
        accommodationFare: parseAmount(String(row[4])),
        totalPayout: parseAmount(String(row[5])),
        listing: String(row[6] ?? '').trim(),
        listingId: String(row[8] ?? '').trim(),
        guestName: String(row[9] ?? '').trim(),
        numberOfNights: parseInt(String(row[7] ?? '0'), 10) || 0,
        numberOfGuests: parseInt(String(row[10] ?? '0'), 10) || 0,
      })
    } catch (err) {
      errors.push(`Row ${i + 1}: ${err instanceof Error ? err.message : String(err)}`)
      skipped++
    }
  }

  return { bookings, skipped, errors }
}
