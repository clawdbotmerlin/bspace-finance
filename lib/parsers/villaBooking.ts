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

function excelSerialToDate(serial: number): string {
  // Excel epoch is Dec 30, 1899 (accounting for the 1900 leap year bug)
  const excelEpoch = Date.UTC(1899, 11, 30)
  const date = new Date(excelEpoch + Math.floor(serial) * 86400000)
  return date.toISOString().slice(0, 10)
}

function parseDate(raw: string): string {
  if (!raw) throw new Error('Missing date')
  const s = String(raw).trim()

  // Excel serial number — xlsx auto-converts CSV date strings like "4/9/2026 15:00"
  // into serials (e.g. 46121.625). Range 40000–60000 covers 2009–2064.
  const serial = parseFloat(s)
  if (!isNaN(serial) && serial > 40000 && serial < 60000) {
    return excelSerialToDate(serial)
  }

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)

  // MM/DD/YYYY HH:MM or MM/DD/YYYY
  const slashMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (slashMatch) {
    const [, m, d, y] = slashMatch
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  // Native parse fallback
  const dt = new Date(s)
  if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10)

  throw new Error(`Cannot parse date: "${s}"`)
}

function parseAmount(raw: string): number {
  if (raw == null || raw === '') return 0
  const cleaned = String(raw).replace(/[^0-9.-]/g, '')
  const val = parseFloat(cleaned)
  return isNaN(val) ? 0 : val
}

// Decode common UTF-8 mojibake caused by reading UTF-8 bytes as Windows-1252.
// The em-dash U+2014 (UTF-8: E2 80 94) becomes â€" (U+00E2 U+20AC U+201D) under Windows-1252.
export function fixEncoding(s: string): string {
  return s
    .replace(/\u00E2\u20AC\u201D/g, '\u2014') // — em-dash
    .replace(/\u00E2\u20AC\u2013/g, '\u2013') // – en-dash
    .replace(/\u00E2\u20AC\u2019/g, '\u2019') // ' right single quote
    .replace(/\u00E2\u20AC\u02DC/g, '\u2018') // ' left single quote
    .replace(/\u00E2\u20AC\u0153/g, '\u201C') // " left double quote
    .replace(/\u00E2\u20AC/g,       '\u20AC') // € euro (standalone)
    .replace(/\u00C3\u00A9/g,       '\u00E9') // é
    .replace(/\u00C3\u00A0/g,       '\u00E0') // à
    .replace(/\u00C3\u00B4/g,       '\u00F4') // ô
    .trim()
}

export function parseVillaBookingCsv(buffer: ArrayBuffer): VillaBookingParseResult {
  // Decode as UTF-8 string first to preserve Unicode characters (em-dash, accents etc.)
  // then pass to xlsx as a pre-decoded string — avoids the Windows-1252 mojibake bug.
  const text = new TextDecoder('utf-8').decode(new Uint8Array(buffer))
  const wb = XLSX.read(text, { type: 'string', raw: false })
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
        listing: fixEncoding(String(row[6] ?? '')),
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
