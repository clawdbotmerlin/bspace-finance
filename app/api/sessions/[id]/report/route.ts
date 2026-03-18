import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/guards'
import { prisma } from '@/lib/db'
import puppeteer from 'puppeteer'
import { Decimal } from '@prisma/client/runtime/library'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatRp(amount: number | Decimal | null | undefined): string {
  if (amount === null || amount === undefined) return 'Rp 0'
  const num = typeof amount === 'object' ? Number(amount) : amount
  if (isNaN(num)) return 'Rp 0'
  return 'Rp ' + Math.round(num).toLocaleString('id-ID')
}

function fmtDate(iso: string | Date | null | undefined, withTime = false): string {
  if (!iso) return '—'
  const d = typeof iso === 'string' ? new Date(iso) : iso
  const opts: Intl.DateTimeFormatOptions = {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  }
  if (withTime) {
    opts.hour = '2-digit'
    opts.minute = '2-digit'
    opts.timeZone = 'Asia/Jakarta'
  }
  return d.toLocaleDateString('id-ID', opts)
}

// ─── HTML Generator ──────────────────────────────────────────────────────────

function buildHtml(data: ReportData): string {
  const { session, pairs, zeroCount, discrepancies } = data

  const missingDisc = discrepancies.filter((d) => d.discrepancyType === 'missing_in_bank')
  const unexpectedDisc = discrepancies.filter((d) => d.discrepancyType === 'unexpected_bank_entry')
  const mismatchDisc = discrepancies.filter((d) => d.discrepancyType === 'amount_mismatch')

  const totalCashier = pairs.reduce((s, p) => s + Number(p.cashierEntry.amount), 0)
  const totalBank = pairs.reduce(
    (s, p) => s + (p.bankMutation ? Number(p.bankMutation.grossAmount) : 0),
    0,
  )

  // ── Matched rows ──
  const matchedRows = pairs.map((p) => {
    const diff = Math.round(Math.abs(p.amountDiff))
    const rowBg = diff > 0 ? '#fffbeb' : 'white'
    return `
      <tr style="background:${rowBg}">
        <td>${p.cashierEntry.bankName}</td>
        <td>${p.cashierEntry.terminalCode ?? p.cashierEntry.terminalId ?? '—'}</td>
        <td>${p.cashierEntry.paymentType}</td>
        <td style="text-align:right;font-family:monospace">${formatRp(Number(p.cashierEntry.amount))}</td>
        <td style="text-align:right;font-family:monospace">${p.bankMutation ? formatRp(Number(p.bankMutation.grossAmount)) : '—'}</td>
        <td style="text-align:right;font-family:monospace;color:${diff > 0 ? '#b45309' : '#6b7280'}">${diff > 0 ? formatRp(diff) : '✓'}</td>
        <td>${p.bankMutation?.referenceNo ?? '—'}</td>
      </tr>`
  }).join('')

  // ── Missing rows ──
  const missingRows = missingDisc.map((d) => `
    <tr>
      <td>${d.cashierEntry?.bankName ?? '—'}</td>
      <td>${d.cashierEntry?.terminalCode ?? d.cashierEntry?.terminalId ?? '—'}</td>
      <td>${d.cashierEntry?.paymentType ?? '—'}</td>
      <td style="text-align:right;font-family:monospace">${d.cashierEntry ? formatRp(Number(d.cashierEntry.amount)) : '—'}</td>
      <td>${d.cashierEntry?.entityNameRaw ?? '—'}</td>
      <td>${statusLabel(d.status)}</td>
    </tr>`).join('')

  // ── Unexpected rows ──
  const unexpectedRows = unexpectedDisc.map((d) => `
    <tr>
      <td>${d.bankMutation?.bankName ?? '—'}</td>
      <td style="font-family:monospace">${d.bankMutation?.accountNumber ?? '—'}</td>
      <td>${d.bankMutation?.description ?? '—'}</td>
      <td style="text-align:right;font-family:monospace">${d.bankMutation ? formatRp(Number(d.bankMutation.grossAmount)) : '—'}</td>
      <td style="font-family:monospace">${d.bankMutation?.referenceNo ?? '—'}</td>
      <td>${statusLabel(d.status)}</td>
    </tr>`).join('')

  // ── Mismatch rows ──
  const mismatchRows = mismatchDisc.map((d) => `
    <tr style="background:#fffbeb">
      <td>${d.cashierEntry?.bankName ?? '—'}</td>
      <td>${d.cashierEntry?.terminalCode ?? d.cashierEntry?.terminalId ?? '—'}</td>
      <td style="text-align:right;font-family:monospace">${d.cashierEntry ? formatRp(Number(d.cashierEntry.amount)) : '—'}</td>
      <td style="text-align:right;font-family:monospace">${d.bankMutation ? formatRp(Number(d.bankMutation.grossAmount)) : '—'}</td>
      <td style="text-align:right;font-family:monospace;color:#b45309;font-weight:600">${d.amountDiff ? formatRp(Math.abs(Number(d.amountDiff))) : '—'}</td>
      <td>${statusLabel(d.status)}</td>
    </tr>`).join('')

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #1e293b; background: white; }
  .page { padding: 0; }

  /* Header */
  .header { background: #0d1b2a; color: white; padding: 20px 24px 16px; display: flex; justify-content: space-between; align-items: flex-start; }
  .brand { font-size: 16px; font-weight: 700; letter-spacing: -0.3px; }
  .brand span { color: #60a5fa; }
  .doc-title { font-size: 11px; color: #94a3b8; margin-top: 3px; }
  .header-right { text-align: right; font-size: 10px; color: #94a3b8; }
  .header-right .gen-date { margin-top: 2px; }

  /* Session info band */
  .info-band { background: #f8fafc; border-bottom: 1px solid #e2e8f0; padding: 12px 24px; display: flex; gap: 32px; flex-wrap: wrap; }
  .info-item { display: flex; flex-direction: column; gap: 2px; }
  .info-label { font-size: 9px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; }
  .info-value { font-size: 12px; font-weight: 600; color: #0f172a; }

  /* Content */
  .content { padding: 20px 24px; }

  /* Summary cards */
  .summary-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 20px; }
  .stat-card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; }
  .stat-label { font-size: 9px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; margin-bottom: 4px; }
  .stat-value { font-size: 20px; font-weight: 700; }
  .stat-green .stat-value { color: #059669; }
  .stat-slate .stat-value { color: #64748b; }
  .stat-red .stat-value { color: #dc2626; }
  .stat-amber .stat-value { color: #d97706; }

  /* Total row */
  .total-row { background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 16px; margin-bottom: 20px; display: flex; gap: 32px; align-items: center; }
  .total-item { display: flex; flex-direction: column; gap: 1px; }
  .total-label { font-size: 9px; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; }
  .total-value { font-size: 13px; font-weight: 700; color: #0f172a; font-family: monospace; }

  /* Tables */
  .section-title { font-size: 12px; font-weight: 700; color: #0f172a; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 2px solid #e2e8f0; }
  .section-subtitle { font-size: 10px; color: #64748b; margin-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 10px; }
  th { background: #f8fafc; font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; padding: 8px 10px; text-align: left; border-bottom: 1px solid #e2e8f0; }
  th.right { text-align: right; }
  td { padding: 7px 10px; border-bottom: 1px solid #f1f5f9; color: #334155; }
  tr:last-child td { border-bottom: none; }

  /* Sign-off block */
  .signoff-block { border: 1px solid #d1fae5; background: #f0fdf4; border-radius: 8px; padding: 16px 20px; margin-top: 24px; }
  .signoff-title { font-size: 11px; font-weight: 700; color: #065f46; margin-bottom: 10px; }
  .signoff-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
  .signoff-item .label { font-size: 9px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; margin-bottom: 3px; }
  .signoff-item .value { font-size: 11px; font-weight: 600; color: #0f172a; }
  .signoff-note { margin-top: 10px; padding-top: 10px; border-top: 1px solid #a7f3d0; }
  .signoff-note .label { font-size: 9px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; margin-bottom: 3px; }
  .signoff-note .value { font-size: 11px; color: #0f172a; }

  /* Empty state */
  .empty { text-align: center; padding: 16px; color: #94a3b8; font-style: italic; font-size: 10px; }

  /* Page break */
  .page-break { page-break-before: always; }

  /* Footer */
  .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; font-size: 9px; color: #94a3b8; }
</style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="header">
    <div>
      <div class="brand">BSpace <span>Finance</span></div>
      <div class="doc-title">Laporan Rekonsiliasi</div>
    </div>
    <div class="header-right">
      <div>Dicetak: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
      <div class="gen-date">WIB</div>
    </div>
  </div>

  <!-- Session Info Band -->
  <div class="info-band">
    <div class="info-item">
      <span class="info-label">Outlet</span>
      <span class="info-value">${session.outlet.name}</span>
    </div>
    <div class="info-item">
      <span class="info-label">Kode Outlet</span>
      <span class="info-value">${session.outlet.code}</span>
    </div>
    <div class="info-item">
      <span class="info-label">Tanggal Sesi</span>
      <span class="info-value">${fmtDate(session.sessionDate)}</span>
    </div>
    <div class="info-item">
      <span class="info-label">Total Entri Kasir</span>
      <span class="info-value">${session._count.cashierEntries}</span>
    </div>
    <div class="info-item">
      <span class="info-label">Total Mutasi Bank</span>
      <span class="info-value">${session._count.bankMutations}</span>
    </div>
  </div>

  <div class="content">

    <!-- Summary Cards -->
    <div class="summary-grid">
      <div class="stat-card stat-green">
        <div class="stat-label">Cocok</div>
        <div class="stat-value">${pairs.length}</div>
      </div>
      <div class="stat-card stat-slate">
        <div class="stat-label">Nol / Skip</div>
        <div class="stat-value">${zeroCount}</div>
      </div>
      <div class="stat-card stat-red">
        <div class="stat-label">Tdk Ada di Bank</div>
        <div class="stat-value">${missingDisc.length}</div>
      </div>
      <div class="stat-card stat-red">
        <div class="stat-label">Tidak Terduga</div>
        <div class="stat-value">${unexpectedDisc.length}</div>
      </div>
      <div class="stat-card stat-amber">
        <div class="stat-label">Selisih Jumlah</div>
        <div class="stat-value">${mismatchDisc.length}</div>
      </div>
    </div>

    <!-- Totals -->
    <div class="total-row">
      <div class="total-item">
        <span class="total-label">Total Kasir (Matched)</span>
        <span class="total-value">${formatRp(totalCashier)}</span>
      </div>
      <div class="total-item">
        <span class="total-label">Total Bank (Matched)</span>
        <span class="total-value">${formatRp(totalBank)}</span>
      </div>
      <div class="total-item">
        <span class="total-label">Selisih Bersih</span>
        <span class="total-value">${formatRp(Math.abs(totalBank - totalCashier))}</span>
      </div>
    </div>

    <!-- Matched Pairs Table -->
    <div class="section-title">Data Cocok (${pairs.length})</div>
    ${pairs.length === 0
      ? '<p class="empty">Tidak ada entri yang cocok.</p>'
      : `<table>
          <thead>
            <tr>
              <th>Bank</th><th>Terminal</th><th>Jenis</th>
              <th class="right">Kasir (Rp)</th><th class="right">Bank (Rp)</th>
              <th class="right">Selisih</th><th>Ref Bank</th>
            </tr>
          </thead>
          <tbody>${matchedRows}</tbody>
        </table>`
    }

    ${missingDisc.length > 0 ? `
    <!-- Missing Table -->
    <div class="section-title">Tidak Ada di Bank (${missingDisc.length})</div>
    <table>
      <thead>
        <tr>
          <th>Bank</th><th>Terminal</th><th>Jenis</th>
          <th class="right">Jumlah (Rp)</th><th>Entitas</th><th>Status</th>
        </tr>
      </thead>
      <tbody>${missingRows}</tbody>
    </table>` : ''}

    ${unexpectedDisc.length > 0 ? `
    <!-- Unexpected Table -->
    <div class="section-title">Mutasi Tidak Terduga (${unexpectedDisc.length})</div>
    <table>
      <thead>
        <tr>
          <th>Bank</th><th>Rekening</th><th>Deskripsi</th>
          <th class="right">Jumlah (Rp)</th><th>Referensi</th><th>Status</th>
        </tr>
      </thead>
      <tbody>${unexpectedRows}</tbody>
    </table>` : ''}

    ${mismatchDisc.length > 0 ? `
    <!-- Mismatch Table -->
    <div class="section-title">Selisih Jumlah (${mismatchDisc.length})</div>
    <table>
      <thead>
        <tr>
          <th>Bank</th><th>Terminal</th>
          <th class="right">Kasir (Rp)</th><th class="right">Bank (Rp)</th>
          <th class="right">Selisih</th><th>Status</th>
        </tr>
      </thead>
      <tbody>${mismatchRows}</tbody>
    </table>` : ''}

    <!-- Sign-off Block -->
    <div class="signoff-block">
      <div class="signoff-title">✓ Tanda Tangan Digital</div>
      <div class="signoff-grid">
        <div class="signoff-item">
          <div class="label">Disubmit oleh</div>
          <div class="value">${session.submitter?.name ?? '—'}</div>
          <div style="font-size:9px;color:#6b7280;margin-top:2px">${session.submittedAt ? fmtDate(session.submittedAt, true) : '—'}</div>
        </div>
        <div class="signoff-item">
          <div class="label">Disetujui oleh</div>
          <div class="value">${session.signer?.name ?? '—'}</div>
          <div style="font-size:9px;color:#6b7280;margin-top:2px">${session.signedOffAt ? fmtDate(session.signedOffAt, true) : '—'}</div>
        </div>
        <div class="signoff-item">
          <div class="label">Status</div>
          <div class="value" style="color:#059669">Sudah Ditandatangani</div>
        </div>
      </div>
      ${session.signOffComment ? `
      <div class="signoff-note">
        <div class="label">Catatan</div>
        <div class="value">${session.signOffComment}</div>
      </div>` : ''}
    </div>

    <!-- Footer -->
    <div class="footer">
      <span>BSpace Finance — Laporan Rekonsiliasi</span>
      <span>Sesi ID: ${session.id}</span>
    </div>

  </div>
</div>
</body>
</html>`
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    open: 'Terbuka',
    investigating: 'Investigasi',
    resolved: 'Selesai',
  }
  return map[status] ?? status
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface ReportSession {
  id: string
  sessionDate: string | Date
  status: string
  submittedAt: Date | null
  signedOffAt: Date | null
  signOffComment: string | null
  outlet: { name: string; code: string }
  submitter: { name: string } | null
  signer: { name: string } | null
  _count: { cashierEntries: number; bankMutations: number }
}

interface ReportMatchPair {
  cashierEntry: {
    id: string
    bankName: string
    terminalCode: string | null
    terminalId: string | null
    paymentType: string
    amount: Decimal
    entityNameRaw: string | null
  }
  bankMutation: {
    id: string
    bankName: string
    accountNumber: string | null
    grossAmount: Decimal
    description: string | null
    referenceNo: string | null
  } | null
  amountDiff: number
}

interface ReportDiscrepancy {
  id: string
  discrepancyType: string
  amountDiff: Decimal | null
  status: string
  cashierEntry: {
    bankName: string
    terminalCode: string | null
    terminalId: string | null
    paymentType: string
    amount: Decimal
    entityNameRaw: string | null
  } | null
  bankMutation: {
    bankName: string
    accountNumber: string | null
    grossAmount: Decimal
    description: string | null
    referenceNo: string | null
  } | null
}

interface ReportData {
  session: ReportSession
  pairs: ReportMatchPair[]
  zeroCount: number
  discrepancies: ReportDiscrepancy[]
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export const GET = withAuth(async (req: NextRequest) => {
  const sessionId = req.nextUrl.pathname.split('/').at(-2)!

  // Fetch session
  const session = await prisma.reconciliationSession.findUnique({
    where: { id: sessionId },
    include: {
      outlet: { select: { name: true, code: true } },
      submitter: { select: { name: true } },
      signer: { select: { name: true } },
      _count: { select: { cashierEntries: true, bankMutations: true } },
    },
  })
  if (!session) {
    return NextResponse.json({ error: 'Sesi tidak ditemukan.' }, { status: 404 })
  }
  if (session.status !== 'signed_off') {
    return NextResponse.json(
      { error: 'Laporan hanya tersedia untuk sesi yang sudah ditandatangani.' },
      { status: 400 },
    )
  }

  // Fetch matched pairs
  const entries = await prisma.cashierEntry.findMany({
    where: { sessionId, matchStatus: 'matched' },
    select: {
      id: true, bankName: true, terminalCode: true, terminalId: true,
      paymentType: true, amount: true, entityNameRaw: true, matchedMutationId: true,
    },
    orderBy: { createdAt: 'asc' },
  })

  const mutationIds = entries
    .map((e) => e.matchedMutationId)
    .filter((id): id is string => id !== null)

  const mutations = await prisma.bankMutation.findMany({
    where: { id: { in: mutationIds } },
    select: {
      id: true, bankName: true, accountNumber: true, grossAmount: true,
      description: true, referenceNo: true,
    },
  })
  const mutMap = new Map(mutations.map((m) => [m.id, m]))

  const pairs: ReportMatchPair[] = entries.map((e) => {
    const mut = e.matchedMutationId ? mutMap.get(e.matchedMutationId) ?? null : null
    return {
      cashierEntry: e,
      bankMutation: mut,
      amountDiff: mut ? Number(mut.grossAmount) - Number(e.amount) : 0,
    }
  })

  const zeroCount = await prisma.cashierEntry.count({
    where: { sessionId, matchStatus: 'zero' },
  })

  // Fetch discrepancies
  const discrepancies = await prisma.discrepancy.findMany({
    where: { sessionId },
    select: {
      id: true, discrepancyType: true, amountDiff: true, status: true,
      cashierEntry: {
        select: {
          bankName: true, terminalCode: true, terminalId: true,
          paymentType: true, amount: true, entityNameRaw: true,
        },
      },
      bankMutation: {
        select: {
          bankName: true, accountNumber: true, grossAmount: true,
          description: true, referenceNo: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  // Build HTML
  const html = buildHtml({
    session: session as unknown as ReportSession,
    pairs,
    zeroCount,
    discrepancies,
  })

  // Generate PDF with Puppeteer
  let browser = null
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    })
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0' })
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    })

    const outletCode = session.outlet.code.replace(/[^a-zA-Z0-9]/g, '')
    const dateStr = new Date(session.sessionDate).toISOString().slice(0, 10)
    const filename = `rekonsiliasi-${outletCode}-${dateStr}.pdf`

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } finally {
    if (browser) await browser.close()
  }
}, ['admin', 'finance', 'manager'])
