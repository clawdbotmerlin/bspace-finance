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

// Known aliases for each logical field — covers any column order Guesty may export.
// Keys are normalized (uppercase, trimmed). First match wins.
const COLUMN_ALIASES: Record<keyof ParsedVillaBooking, string[]> = {
  status:            ['STATUS'],
  checkIn:           ['CHECK-IN', 'CHECK IN', 'CHECKIN'],
  checkOut:          ['CHECK-OUT', 'CHECK OUT', 'CHECKOUT'],
  source:            ['SOURCE', 'OTA', 'CHANNEL'],
  accommodationFare: ['ACCOMMODATION FARE', 'ACCOMMODATION', 'FARE', 'ROOM REVENUE'],
  totalPayout:       ['TOTAL PAYOUT', 'PAYOUT', 'NET PAYOUT'],
  listing:           ['LISTING', 'LISTING NAME', 'PROPERTY'],
  listingId:         ['LISTING ID', 'LISTING_ID', 'PROPERTY ID'],
  guestName:         ["GUEST'S NAME", 'GUEST NAME', 'GUEST', 'NAME'],
  numberOfNights:    ['NUMBER OF NIGHTS', 'NIGHTS', 'NIGHT'],
  numberOfGuests:    ['NUMBER OF GUESTS', 'GUESTS', 'GUEST COUNT'],
}

function buildColumnMap(headerRow: string[]): Map<keyof ParsedVillaBooking, number> {
  const normalized = headerRow.map(h => String(h).toUpperCase().trim())
  const colMap = new Map<keyof ParsedVillaBooking, number>()

  for (const [field, aliases] of Object.entries(COLUMN_ALIASES) as [keyof ParsedVillaBooking, string[]][]) {
    for (const alias of aliases) {
      const idx = normalized.indexOf(alias)
      if (idx !== -1) { colMap.set(field, idx); break }
    }
  }

  return colMap
}

export function parseVillaBookingCsv(buffer: ArrayBuffer): VillaBookingParseResult {
  // Decode as UTF-8 string first to preserve Unicode characters (em-dash, accents etc.)
  // then pass to xlsx as a pre-decoded string — avoids the Windows-1252 mojibake bug.
  const text = new TextDecoder('utf-8').decode(new Uint8Array(buffer))
  const wb = XLSX.read(text, { type: 'string', raw: false })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' })

  if (rows.length === 0) return { bookings: [], skipped: 0, errors: ['File is empty'] }

  // Build header → index map from row 0 so column order doesn't matter
  const colMap = buildColumnMap(rows[0])

  const get = (row: string[], field: keyof ParsedVillaBooking): string => {
    const idx = colMap.get(field)
    return idx !== undefined ? String(row[idx] ?? '').trim() : ''
  }

  const missingFields = (Object.keys(COLUMN_ALIASES) as (keyof ParsedVillaBooking)[])
    .filter(f => !colMap.has(f))
  if (missingFields.length > 0) {
    return {
      bookings: [],
      skipped: rows.length - 1,
      errors: [`Missing required columns: ${missingFields.join(', ')}. Headers found: ${rows[0].join(', ')}`],
    }
  }

  const bookings: ParsedVillaBooking[] = []
  let skipped = 0
  const errors: string[] = []

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.every(c => c === '')) { skipped++; continue }

    const status = get(row, 'status')
    if (!status) { skipped++; continue }

    try {
      bookings.push({
        status,
        checkIn:           parseDate(get(row, 'checkIn')),
        checkOut:          parseDate(get(row, 'checkOut')),
        source:            get(row, 'source'),
        accommodationFare: parseAmount(get(row, 'accommodationFare')),
        totalPayout:       parseAmount(get(row, 'totalPayout')),
        listing:           fixEncoding(get(row, 'listing')),
        listingId:         get(row, 'listingId'),
        guestName:         get(row, 'guestName'),
        numberOfNights:    parseInt(get(row, 'numberOfNights') || '0', 10) || 0,
        numberOfGuests:    parseInt(get(row, 'numberOfGuests') || '0', 10) || 0,
      })
    } catch (err) {
      errors.push(`Row ${i + 1}: ${err instanceof Error ? err.message : String(err)}`)
      skipped++
    }
  }

  return { bookings, skipped, errors }
}
