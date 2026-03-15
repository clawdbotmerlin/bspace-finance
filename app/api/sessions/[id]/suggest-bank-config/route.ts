import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/guards'
import { prisma } from '@/lib/db'
import * as XLSX from 'xlsx'

interface MoonshotResponse {
  choices: Array<{ message: { content: string } }>
}

export const POST = withAuth(async (req: NextRequest) => {
  const pathParts = req.nextUrl.pathname.split('/')
  // path: /api/sessions/[id]/suggest-bank-config → id is at index -2
  const sessionId = pathParts.at(-2)!

  const session = await prisma.reconciliationSession.findUnique({ where: { id: sessionId } })
  if (!session) return NextResponse.json({ error: 'Sesi tidak ditemukan.' }, { status: 404 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const bankName = (formData.get('bankName') as string | null)?.toUpperCase()

  if (!file) return NextResponse.json({ error: 'File tidak ditemukan.' }, { status: 400 })
  if (!bankName) return NextResponse.json({ error: 'bankName wajib diisi.' }, { status: 400 })

  const existingConfig = await prisma.bankColumnConfig.findUnique({ where: { bankName } })
  if (!existingConfig) {
    return NextResponse.json({ error: `Konfigurasi untuk bank "${bankName}" tidak ditemukan.` }, { status: 404 })
  }

  // Read file and extract first 40 rows as preview
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(new Uint8Array(buffer), { type: 'array', raw: true })
  const sheetName = wb.SheetNames[0]
  const sheet = wb.Sheets[sheetName]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allRows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: null, raw: true })
  const previewRows = allRows.slice(0, 40)

  const currentConfig = {
    skipRowsTop: existingConfig.skipRowsTop,
    skipRowsBottom: existingConfig.skipRowsBottom,
    columnMapping: existingConfig.columnMapping,
  }

  const apiKey = process.env.MOONSHOT_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'MOONSHOT_API_KEY tidak dikonfigurasi di server.' }, { status: 500 })
  }

  const prompt = `You are analyzing a bank statement Excel/CSV file to determine the correct column mapping configuration for a finance reconciliation system.

Bank name: ${bankName}
Sheet name: ${sheetName}
File preview (first 40 rows, columns are 0-indexed arrays):
${JSON.stringify(previewRows, null, 2)}

Current config (may be wrong — this is why 0 rows were parsed):
${JSON.stringify(currentConfig, null, 2)}

Task: Analyze the file structure and determine the correct column mapping configuration.

The config must have:
- skipRowsTop (integer): number of header/title rows to skip before the first data row with a transaction date
- skipRowsBottom (integer): number of trailing footer rows to skip (totals, signatures, empty rows at end)
- columnMapping: one of these three types:

Type 1 — "dual_column" (separate debit and credit amount columns):
{ "type": "dual_column", "dateCol": <int>, "dateFormat": "<format>", "descriptionCol": <int|null>, "debitCol": <int>, "creditCol": <int>, "refCol": <int|null> }

Type 2 — "separated_direction" (single amount col + separate direction indicator col):
{ "type": "separated_direction", "dateCol": <int>, "dateFormat": "<format>", "descriptionCol": <int|null>, "amountCol": <int>, "directionCol": <int>, "creditIndicator": "<string>", "refCol": <int|null> }

Type 3 — "combined_amount_direction" (amount and CR/DR combined in one cell like "5000000 CR"):
{ "type": "combined_amount_direction", "dateCol": <int>, "dateFormat": "<format>", "descriptionCol": <int|null>, "amountAndDirectionCol": <int>, "creditIndicator": "<string>", "debitIndicator": "<string>", "refCol": <int|null> }

dateFormat values: "EXCEL_SERIAL" (date is a number like 45678), "DD/MM/YYYY", "DD/MM/YY", or null (if already ISO YYYY-MM-DD or YYYY-MM-DD HH:mm:ss).

Rules:
- Columns are 0-indexed
- For dual_column: creditCol = incoming money (CR), debitCol = outgoing money (DR)
- skipRowsTop: count rows until the first row that contains a real transaction date

Respond with ONLY a JSON object, no explanation, no markdown fences:
{
  "skipRowsTop": <number>,
  "skipRowsBottom": <number>,
  "columnMapping": { ... }
}`

  const res = await fetch('https://api.moonshot.cn/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'kimi-k2',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('Moonshot API error:', err)
    return NextResponse.json({ error: 'Gagal menghubungi layanan AI.' }, { status: 502 })
  }

  const aiData = await res.json() as MoonshotResponse
  const rawText = aiData.choices?.[0]?.message?.content ?? ''

  // Strip any accidental markdown fences and extract JSON
  const jsonMatch = rawText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    return NextResponse.json({ error: 'AI tidak menghasilkan konfigurasi yang valid.' }, { status: 500 })
  }

  let suggestion: unknown
  try {
    suggestion = JSON.parse(jsonMatch[0])
  } catch {
    return NextResponse.json({ error: 'Gagal memproses respons AI.' }, { status: 500 })
  }

  return NextResponse.json({ configId: existingConfig.id, suggestion })
}, ['admin', 'finance'])
